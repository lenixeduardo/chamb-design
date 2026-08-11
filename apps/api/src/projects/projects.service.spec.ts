import { describe, expect, it, vi } from 'vitest';
import { createDocument, createNode, seededRng, setIdRng } from '@opendesign/core';
import { ProjectsService } from './projects.service';
import type { CacheService } from '../common/cache.service';
import type { PrismaService } from '../common/prisma.service';

/**
 * Service-level tests with a stubbed Prisma.
 *
 * The behaviour worth pinning down here is not "does Prisma write a row" — it
 * is that a bad batch from a client is rejected *before* anything is persisted.
 * A shared document that half-applies an operation batch is a state no client
 * can reconcile, so these tests assert that no write happens on failure.
 *
 * Two of those stubs earn their keep by modelling something real. `updateMany`
 * honours the `version` in its `where`, so the optimistic-concurrency path can
 * be tested at all; and `$transaction` runs the callback it is given, which is
 * what lets the "commit is not written when the update matched nothing" case be
 * expressed. A `Promise.all` stub cannot model either, which is precisely why
 * the lost-update bug went unnoticed.
 */

const OWNER = 'u1';

function makeService(options: { connected?: boolean; ownerId?: string } = {}) {
  setIdRng(seededRng(77));
  const document = createDocument({ name: 'Server test' });

  const project = {
    id: 'p1',
    document,
    name: 'Server test',
    ownerId: options.ownerId ?? OWNER,
    version: 0,
    memberships: [] as { id: string }[],
  };

  const updateMany = vi.fn(
    async ({ where }: { where: { id: string; version?: number } }): Promise<{ count: number }> => {
      if (where.id !== project.id) return { count: 0 };
      if (where.version !== undefined && where.version !== project.version) return { count: 0 };
      project.version += 1;
      return { count: 1 };
    },
  );

  const prisma = {
    isConnected: options.connected ?? true,
    project: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; slug?: string } }) =>
        where.slug ? null : where.id === 'p1' ? project : null,
      ),
      update: vi.fn(async () => project),
      updateMany,
      create: vi.fn(async ({ data }: { data: unknown }) => data),
      findMany: vi.fn(async () => []),
      delete: vi.fn(async () => project),
    },
    commit: { create: vi.fn(async () => ({ id: 'c1' })), findMany: vi.fn(async () => []) },
    snapshot: { create: vi.fn(async () => ({ id: 's1' })), findUnique: vi.fn(async () => null) },
    $transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) => run(prisma)),
  } as unknown as PrismaService & { project: { updateMany: typeof updateMany } };

  const store = new Map<string, unknown>();
  const cache = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    del: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  } as unknown as CacheService;

  return { service: new ProjectsService(prisma, cache), prisma, cache, document, project };
}

/** An insert of one frame at the root of the first page. */
function insertFrame(document: ReturnType<typeof createDocument>) {
  const node = createNode({ type: 'frame', name: 'Section' });
  return {
    node,
    operations: [
      {
        type: 'insertSubtree',
        nodes: [node],
        rootId: node.id,
        parentId: document.pages[0]!.rootId,
        index: 0,
      },
    ],
  };
}

/**
 * Makes the next document read return the version it saw, then advances the
 * stored version behind it — a competing writer landing between this caller's
 * read and its conditional update.
 */
function staleReadOnce(prisma: PrismaService, project: { version: number }): void {
  const findUnique = vi.mocked(prisma.project.findUnique) as unknown as {
    mockImplementationOnce: (impl: () => Promise<unknown>) => void;
  };
  // First call is the access check; the second is the document read.
  findUnique.mockImplementationOnce(async () => project);
  findUnique.mockImplementationOnce(async () => {
    const stale = { ...project };
    project.version += 1;
    return stale;
  });
}

describe('ProjectsService', () => {
  it('refuses to serve anything when the database is unreachable', async () => {
    const { service } = makeService({ connected: false });
    await expect(service.get('p1', OWNER)).rejects.toThrow(/no database connection/);
  });

  it('applies a valid operation batch and records a commit with its inverse', async () => {
    const { service, prisma, document } = makeService();
    const { node, operations } = insertFrame(document);

    const result = await service.applyOperations('p1', operations, { authorId: OWNER });

    expect(result.document.nodes[node.id]).toBeDefined();
    expect(result.commitId).toBe('c1');

    const commitCall = vi.mocked(prisma.commit.create).mock.calls[0]![0] as {
      data: { operations: unknown[]; inverse: unknown[] };
    };
    expect(commitCall.data.operations).toHaveLength(1);
    expect(commitCall.data.inverse).toHaveLength(1);
  });

  it('rejects a schema-invalid batch without writing', async () => {
    const { service, prisma } = makeService();

    await expect(
      service.applyOperations('p1', [{ type: 'notARealOperation', nodeId: 'x' }], {
        authorId: OWNER,
      }),
    ).rejects.toThrow(/rejected/);

    expect(prisma.project.updateMany).not.toHaveBeenCalled();
    expect(prisma.commit.create).not.toHaveBeenCalled();
  });

  it('rejects a semantically impossible batch without writing', async () => {
    const { service, prisma } = makeService();

    await expect(
      service.applyOperations('p1', [{ type: 'removeSubtree', nodeId: 'does-not-exist' }], {
        authorId: OWNER,
      }),
    ).rejects.toThrow(/could not be applied/);

    expect(prisma.project.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an all-or-nothing batch where only the second op is bad', async () => {
    const { service, prisma, document } = makeService();
    const { node, operations } = insertFrame(document);

    await expect(
      service.applyOperations(
        'p1',
        [...operations, { type: 'moveNode', nodeId: node.id, parentId: node.id, index: 0 }],
        { authorId: OWNER },
      ),
    ).rejects.toThrow();

    expect(prisma.project.updateMany).not.toHaveBeenCalled();
  });

  it('serves the cached document on a second read', async () => {
    const { service, prisma } = makeService();

    await service.get('p1', OWNER);
    await service.get('p1', OWNER);

    // Two access checks, one document read: the cache saved the second fetch.
    expect(prisma.project.findUnique).toHaveBeenCalledTimes(3);
  });

  it('refreshes the cache after a write so readers do not see stale state', async () => {
    const { service, cache, document } = makeService();
    const { node, operations } = insertFrame(document);

    await service.applyOperations('p1', operations, { authorId: OWNER });

    const cached = await service.get('p1', OWNER);
    expect(cached.nodes[node.id]).toBeDefined();
    expect(cache.set).toHaveBeenCalled();
  });

  it('rejects a corrupt document at creation time', async () => {
    const { service, prisma } = makeService();

    await expect(service.create(OWNER, 'Broken', { pages: [] } as never)).rejects.toThrow(
      /integrity|validation/i,
    );

    expect(prisma.project.create).not.toHaveBeenCalled();
  });

  describe('access control', () => {
    it('will not read, write or delete a project belonging to someone else', async () => {
      const { service, prisma } = makeService({ ownerId: 'someone-else' });
      const stranger = 'u2';

      // The same 404 a missing project gets, so this cannot be used to find out
      // which project ids are real.
      await expect(service.get('p1', stranger)).rejects.toThrow(/not found/);
      await expect(service.remove('p1', stranger)).rejects.toThrow(/not found/);
      await expect(service.history('p1', stranger)).rejects.toThrow(/not found/);
      await expect(service.createSnapshot('p1', stranger, 'v1')).rejects.toThrow(/not found/);
      await expect(service.restoreSnapshot('p1', stranger, 's1')).rejects.toThrow(/not found/);
      await expect(service.applyOperations('p1', [], { authorId: stranger })).rejects.toThrow(
        /not found/,
      );

      expect(prisma.project.delete).not.toHaveBeenCalled();
      expect(prisma.project.updateMany).not.toHaveBeenCalled();
    });

    it('lets a member through even when they are not the owner', async () => {
      const { service, project } = makeService({ ownerId: 'someone-else' });
      project.memberships = [{ id: 'm1' }];

      await expect(service.get('p1', 'u2')).resolves.toBeDefined();
    });

    it('refuses every route without an identity rather than acting anonymously', async () => {
      const { service } = makeService();

      await expect(service.list('')).rejects.toThrow(/authentication is required/);
      await expect(service.get('p1', '')).rejects.toThrow(/authentication is required/);
      await expect(service.create('  ', 'n', createDocument({ name: 'x' }))).rejects.toThrow(
        /authentication is required/,
      );
      await expect(service.remove('p1', undefined as never)).rejects.toThrow(
        /authentication is required/,
      );
      await expect(service.applyOperations('p1', [], {})).rejects.toThrow(
        /authentication is required/,
      );
    });
  });

  describe('concurrent writes', () => {
    it('rejects a batch built on a document that has since changed', async () => {
      const { service, prisma, document, project } = makeService();
      const { operations } = insertFrame(document);

      // Someone else's write lands between this caller's read and its update.
      staleReadOnce(prisma, project);

      await expect(service.applyOperations('p1', operations, { authorId: OWNER })).rejects.toThrow(
        /changed while these operations were being applied/,
      );

      // The losing writer must not leave a commit describing an edit the
      // document does not contain.
      expect(prisma.commit.create).not.toHaveBeenCalled();
    });

    it('drops the cache entry on conflict so the next read is authoritative', async () => {
      const { service, prisma, cache, document, project } = makeService();
      const { operations } = insertFrame(document);

      staleReadOnce(prisma, project);

      await expect(
        service.applyOperations('p1', operations, { authorId: OWNER }),
      ).rejects.toThrow();

      expect(cache.del).toHaveBeenCalledWith('project:p1');
    });
  });

  describe('history', () => {
    it('falls back to the default when the limit is not a usable number', async () => {
      const { service, prisma } = makeService();

      // `?limit=abc` arrives as NaN and used to reach Prisma as `take: NaN`.
      await service.history('p1', OWNER, Number('abc'));
      await service.history('p1', OWNER, -5);
      await service.history('p1', OWNER, undefined);

      for (const call of vi.mocked(prisma.commit.findMany).mock.calls) {
        expect((call[0] as { take: number }).take).toBe(50);
      }
    });

    it('caps the limit rather than trusting it', async () => {
      const { service, prisma } = makeService();

      await service.history('p1', OWNER, 5000);

      const call = vi.mocked(prisma.commit.findMany).mock.calls[0]![0] as { take: number };
      expect(call.take).toBe(200);
    });
  });
});
