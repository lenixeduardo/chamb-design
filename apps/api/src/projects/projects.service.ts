import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
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

  private static requireUser(userId: string | undefined): string {
    const id = userId?.trim();
    if (!id) throw new UnauthorizedException('the x-user-id header is required');
    return id;
  }

  /**
   * Ownership check for every per-project route.
   *
   * A missing project and a project belonging to someone else get the *same*
   * 404. Distinguishing them would turn this into an oracle for which project
   * ids exist, which is the first half of the attack it is here to prevent.
   */
  private async assertAccess(projectId: string, userId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true, memberships: { where: { userId }, select: { id: true } } },
    });

    if (!project || (project.ownerId !== userId && project.memberships.length === 0)) {
      throw new NotFoundException(`project ${projectId} not found`);
    }
  }

  async list(rawOwnerId: string) {
    this.assertDatabase();
    const ownerId = ProjectsService.requireUser(rawOwnerId);
    return this.prisma.project.findMany({
      where: { OR: [{ ownerId }, { memberships: { some: { userId: ownerId } } }] },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, slug: true, folder: true, updatedAt: true, createdAt: true },
    });
  }

  async get(id: string, rawUserId: string): Promise<DesignDocument> {
    this.assertDatabase();
    await this.assertAccess(id, ProjectsService.requireUser(rawUserId));

    const cached = await this.cache.get<DesignDocument>(`project:${id}`);
    if (cached) return cached;

    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException(`project ${id} not found`);

    const document = project.document as unknown as DesignDocument;
    await this.cache.set(`project:${id}`, document);
    return document;
  }

  async create(rawOwnerId: string, name: string, document: DesignDocument, folder?: string) {
    this.assertDatabase();
    const ownerId = ProjectsService.requireUser(rawOwnerId);
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
   *
   * The read is deliberately not the cached one. Replaying operations against
   * the authoritative copy is only convergent if the copy really is
   * authoritative, and a per-instance cache is not — two serverless instances
   * hold different ideas of "current". So the row is read directly, and the
   * write is conditional on the `version` that read returned: whoever loses the
   * race gets a 409 and replays, instead of both reporting success while one
   * edit quietly disappears.
   */
  async applyOperations(
    projectId: string,
    rawOperations: unknown[],
    options: { authorId?: string; label?: string; branchId?: string; source?: 'USER' | 'AI' } = {},
  ): Promise<{ document: DesignDocument; commitId: string }> {
    this.assertDatabase();
    await this.assertAccess(projectId, ProjectsService.requireUser(options.authorId));

    const parsed = parseOperations(rawOperations);
    if (!parsed.ok) {
      throw new BadRequestException({
        message: 'one or more operations were rejected',
        errors: parsed.errors,
      });
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { document: true, version: true },
    });
    if (!project) throw new NotFoundException(`project ${projectId} not found`);

    const current = project.document as unknown as DesignDocument;

    let result;
    try {
      result = applyOperations(current, parsed.value as Operation[]);
    } catch (error) {
      throw new BadRequestException(
        `operations could not be applied: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    this.validate(result.document);

    const commit = await this.prisma.$transaction(async (tx) => {
      const written = await tx.project.updateMany({
        where: { id: projectId, version: project.version },
        data: {
          document: result.document as never,
          schemaVersion: result.document.schemaVersion,
          version: { increment: 1 },
        },
      });

      // Nothing matched: someone else wrote between our read and here. Return
      // without creating the commit so the log never records an edit the
      // document does not contain.
      if (written.count === 0) return null;

      return tx.commit.create({
        data: {
          projectId,
          label: options.label ?? 'Remote edit',
          source: options.source ?? 'USER',
          authorId: options.authorId ?? null,
          branchId: options.branchId ?? null,
          operations: parsed.value as never,
          inverse: result.inverse as never,
        },
      });
    });

    if (!commit) {
      await this.cache.del(`project:${projectId}`);
      throw new ConflictException(
        'the project changed while these operations were being applied — re-read it and replay them',
      );
    }

    await this.cache.set(`project:${projectId}`, result.document);
    return { document: result.document, commitId: commit.id };
  }

  async history(projectId: string, rawUserId: string, limit?: number) {
    this.assertDatabase();
    await this.assertAccess(projectId, ProjectsService.requireUser(rawUserId));

    return this.prisma.commit.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: ProjectsService.clampLimit(limit),
      select: { id: true, label: true, source: true, createdAt: true, authorId: true },
    });
  }

  /**
   * `?limit=abc` used to reach Prisma as `take: NaN` and come back a 500.
   * Anything that is not a usable count falls back to the default.
   */
  private static clampLimit(limit: number | undefined): number {
    if (limit === undefined || !Number.isFinite(limit) || limit < 1) return 50;
    return Math.min(Math.floor(limit), 200);
  }

  async createSnapshot(projectId: string, rawUserId: string, name: string, message?: string) {
    this.assertDatabase();
    await this.assertAccess(projectId, ProjectsService.requireUser(rawUserId));
    return this.writeSnapshot(projectId, name, message);
  }

  /** Snapshot write with the access check already done by the caller. */
  private async writeSnapshot(projectId: string, name: string, message?: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { document: true },
    });
    if (!project) throw new NotFoundException(`project ${projectId} not found`);

    return this.prisma.snapshot.create({
      data: {
        projectId,
        name,
        message: message ?? null,
        document: project.document as never,
      },
    });
  }

  async restoreSnapshot(
    projectId: string,
    rawUserId: string,
    snapshotId: string,
  ): Promise<DesignDocument> {
    this.assertDatabase();
    await this.assertAccess(projectId, ProjectsService.requireUser(rawUserId));

    const snapshot = await this.prisma.snapshot.findUnique({ where: { id: snapshotId } });
    if (!snapshot || snapshot.projectId !== projectId) {
      throw new NotFoundException(`snapshot ${snapshotId} not found in project ${projectId}`);
    }

    // Capture the pre-restore state first — restoring must not be the one
    // action in the system that loses work.
    await this.writeSnapshot(projectId, `Before restoring "${snapshot.name}"`);

    const document = snapshot.document as unknown as DesignDocument;
    await this.prisma.project.update({
      where: { id: projectId },
      // A restore replaces the document, so it has to move the version too —
      // otherwise an operation batch that read the pre-restore document would
      // still be accepted and undo the restore.
      data: { document: document as never, version: { increment: 1 } },
    });
    await this.cache.set(`project:${projectId}`, document);

    return document;
  }

  async remove(id: string, rawUserId: string): Promise<void> {
    this.assertDatabase();
    await this.assertAccess(id, ProjectsService.requireUser(rawUserId));
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
