import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  applyOperations,
  parseOperations,
  validateDocumentIntegrity,
  type DesignDocument,
  type Operation,
} from '@opendesign/core';
import { PrismaService } from '../common/prisma.service';
import { CacheService } from '../common/cache.service';

/**
 * Project persistence.
 *
 * The interesting method is `applyOperations`: clients send operations, not
 * documents. That means two people editing the same project converge on the
 * server by replaying ops against the authoritative copy, instead of one
 * client's stale snapshot silently overwriting the other's work.
 */
@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  private assertDatabase(): void {
    if (!this.prisma.isConnected) {
      throw new ServiceUnavailableException(
        'no database connection — set DATABASE_URL, or use the editor local-first without a server',
      );
    }
  }

  async list(ownerId: string) {
    this.assertDatabase();
    return this.prisma.project.findMany({
      where: { OR: [{ ownerId }, { memberships: { some: { userId: ownerId } } }] },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, slug: true, folder: true, updatedAt: true, createdAt: true },
    });
  }

  async get(id: string): Promise<DesignDocument> {
    this.assertDatabase();

    const cached = await this.cache.get<DesignDocument>(`project:${id}`);
    if (cached) return cached;

    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException(`project ${id} not found`);

    const document = project.document as unknown as DesignDocument;
    await this.cache.set(`project:${id}`, document);
    return document;
  }

  async create(ownerId: string, name: string, document: DesignDocument, folder?: string) {
    this.assertDatabase();
    this.validate(document);

    return this.prisma.project.create({
      data: {
        name,
        slug: await this.uniqueSlug(name),
        ownerId,
        folder: folder ?? null,
        document: document as never,
        schemaVersion: document.schemaVersion,
      },
    });
  }

  /**
   * Applies a batch of client operations to the authoritative document.
   *
   * Rejected wholesale rather than partially: a half-applied batch is how a
   * shared document ends up in a state no client can reconcile.
   */
  async applyOperations(
    projectId: string,
    rawOperations: unknown[],
    options: { authorId?: string; label?: string; branchId?: string; source?: 'USER' | 'AI' } = {},
  ): Promise<{ document: DesignDocument; commitId: string }> {
    this.assertDatabase();

    const parsed = parseOperations(rawOperations);
    if (!parsed.ok) {
      throw new BadRequestException({
        message: 'one or more operations were rejected',
        errors: parsed.errors,
      });
    }

    const current = await this.get(projectId);

    let result;
    try {
      result = applyOperations(current, parsed.value as Operation[]);
    } catch (error) {
      throw new BadRequestException(
        `operations could not be applied: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    this.validate(result.document);

    const [, commit] = await this.prisma.$transaction([
      this.prisma.project.update({
        where: { id: projectId },
        data: { document: result.document as never },
      }),
      this.prisma.commit.create({
        data: {
          projectId,
          label: options.label ?? 'Remote edit',
          source: options.source ?? 'USER',
          authorId: options.authorId ?? null,
          branchId: options.branchId ?? null,
          operations: parsed.value as never,
          inverse: result.inverse as never,
        },
      }),
    ]);

    await this.cache.set(`project:${projectId}`, result.document);
    return { document: result.document, commitId: commit.id };
  }

  async history(projectId: string, limit = 50) {
    this.assertDatabase();
    return this.prisma.commit.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      select: { id: true, label: true, source: true, createdAt: true, authorId: true },
    });
  }

  async createSnapshot(projectId: string, name: string, message?: string) {
    this.assertDatabase();
    const document = await this.get(projectId);
    return this.prisma.snapshot.create({
      data: { projectId, name, message: message ?? null, document: document as never },
    });
  }

  async restoreSnapshot(projectId: string, snapshotId: string): Promise<DesignDocument> {
    this.assertDatabase();

    const snapshot = await this.prisma.snapshot.findUnique({ where: { id: snapshotId } });
    if (!snapshot || snapshot.projectId !== projectId) {
      throw new NotFoundException(`snapshot ${snapshotId} not found in project ${projectId}`);
    }

    // Capture the pre-restore state first — restoring must not be the one
    // action in the system that loses work.
    await this.createSnapshot(projectId, `Before restoring "${snapshot.name}"`);

    const document = snapshot.document as unknown as DesignDocument;
    await this.prisma.project.update({
      where: { id: projectId },
      data: { document: document as never },
    });
    await this.cache.set(`project:${projectId}`, document);

    return document;
  }

  async remove(id: string): Promise<void> {
    this.assertDatabase();
    await this.prisma.project.delete({ where: { id } });
    await this.cache.del(`project:${id}`);
  }

  private validate(document: DesignDocument): void {
    const integrity = validateDocumentIntegrity(document);
    if (!integrity.ok) {
      throw new BadRequestException({
        message: 'document failed integrity validation',
        errors: integrity.errors.slice(0, 20),
      });
    }
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'project';

    let slug = base;
    let suffix = 1;

    while (await this.prisma.project.findUnique({ where: { slug } })) {
      suffix += 1;
      slug = `${base}-${suffix}`;
    }

    return slug;
  }
}
