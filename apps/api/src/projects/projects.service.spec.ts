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
 */

function makeService(options: { connected?: boolean } = {}) {
  setIdRng(seededRng(77));
  const document = createDocument({ name: 'Server test' });

  const project = { id: 'p1', document, name: 'Server test' };

  const prisma = {
    isConnected: options.connected ?? true,
    project: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; slug?: string } }) =>
        where.slug ? null : where.id === 'p1' ? project : null,
      ),
      update: vi.fn(async () => project),
      create: vi.fn(async ({ data }: { data: unknown }) => data),
      findMany: vi.fn(async () => []),
      delete: vi.fn(async () => project),
    },
    commit: { create: vi.fn(async () => ({ id: 'c1' })), findMany: vi.fn(async () => []) },
    snapshot: { create: vi.fn(async () => ({ id: 's1' })), findUnique: vi.fn(async () => null) },
    // The service uses $transaction([...]) and expects results positionally.
    $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  } as unknown as PrismaService;

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

  return { service: new ProjectsService(prisma, cache), prisma, cache, document };
}

describe('ProjectsService', () => {
  it('refuses to serve anything when the database is unreachable', async () => {
    const { service } = makeService({ connected: false });
    await expect(service.get('p1')).rejects.toThrow(/no database connection/);
  });

  it('applies a valid operation batch and records a commit with its inverse', async () => {
    const { service, prisma, document } = makeService();
    const rootId = document.pages[0]!.rootId;
    const node = createNode({ type: 'frame', name: 'Section' });

    const result = await service.applyOperations('p1', [
      { type: 'insertSubtree', nodes: [node], rootId: node.id, parentId: rootId, index: 0 },
    ]);

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
      service.applyOperations('p1', [{ type: 'notARealOperation', nodeId: 'x' }]),
    ).rejects.toThrow(/rejected/);

    expect(prisma.project.update).not.toHaveBeenCalled();
    expect(prisma.commit.create).not.toHaveBeenCalled();
  });

  it('rejects a semantically impossible batch without writing', async () => {
    const { service, prisma } = makeService();

    await expect(
      service.applyOperations('p1', [{ type: 'removeSubtree', nodeId: 'does-not-exist' }]),
    ).rejects.toThrow(/could not be applied/);

    expect(prisma.project.update).not.toHaveBeenCalled();
  });

  it('rejects an all-or-nothing batch where only the second op is bad', async () => {
    const { service, prisma, document } = makeService();
    const rootId = document.pages[0]!.rootId;
    const node = createNode({ type: 'frame' });

    await expect(
      service.applyOperations('p1', [
        { type: 'insertSubtree', nodes: [node], rootId: node.id, parentId: rootId, index: 0 },
        { type: 'moveNode', nodeId: node.id, parentId: node.id, index: 0 },
      ]),
    ).rejects.toThrow();

    expect(prisma.project.update).not.toHaveBeenCalled();
  });

  it('serves the cached document on a second read', async () => {
    const { service, prisma } = makeService();

    await service.get('p1');
    await service.get('p1');

    expect(prisma.project.findUnique).toHaveBeenCalledTimes(1);
  });

  it('refreshes the cache after a write so readers do not see stale state', async () => {
    const { service, cache, document } = makeService();
    const node = createNode({ type: 'frame' });

    await service.applyOperations('p1', [
      {
        type: 'insertSubtree',
        nodes: [node],
        rootId: node.id,
        parentId: document.pages[0]!.rootId,
        index: 0,
      },
    ]);

    const cached = await service.get('p1');
    expect(cached.nodes[node.id]).toBeDefined();
    expect(cache.set).toHaveBeenCalled();
  });

  it('rejects a corrupt document at creation time', async () => {
    const { service, prisma } = makeService();

    await expect(service.create('u1', 'Broken', { pages: [] } as never)).rejects.toThrow(
      /integrity|validation/i,
    );

    expect(prisma.project.create).not.toHaveBeenCalled();
  });
});
