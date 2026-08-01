import { Body, Controller, Delete, Get, Headers, Param, Post, Query } from '@nestjs/common';
import type { DesignDocument } from '@opendesign/core';
import { ProjectsService } from './projects.service';

interface CreateProjectBody {
  name: string;
  document: DesignDocument;
  folder?: string;
}

interface ApplyOperationsBody {
  operations: unknown[];
  label?: string;
  branchId?: string;
  source?: 'USER' | 'AI';
}

/**
 * Project REST surface.
 *
 * Identity arrives as `x-user-id` here. That is the seam where a real auth
 * provider plugs in — Clerk, Better Auth, or an existing SSO — and keeping it
 * a single header means swapping one guard rather than rewriting controllers.
 *
 * Every route passes it through, including the ones that do not otherwise need
 * it: the service refuses to act on a project the caller cannot reach, and it
 * can only do that if it is told who is asking.
 */
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@Headers('x-user-id') userId: string) {
    return this.projects.list(userId);
  }

  @Get(':id')
  get(@Param('id') id: string, @Headers('x-user-id') userId: string) {
    return this.projects.get(id, userId);
  }

  @Post()
  create(@Headers('x-user-id') userId: string, @Body() body: CreateProjectBody) {
    return this.projects.create(userId, body.name, body.document, body.folder);
  }

  @Post(':id/operations')
  applyOperations(
    @Param('id') id: string,
    @Headers('x-user-id') userId: string,
    @Body() body: ApplyOperationsBody,
  ) {
    return this.projects.applyOperations(id, body.operations, {
      authorId: userId,
      ...(body.label ? { label: body.label } : {}),
      ...(body.branchId ? { branchId: body.branchId } : {}),
      ...(body.source ? { source: body.source } : {}),
    });
  }

  @Get(':id/history')
  history(
    @Param('id') id: string,
    @Headers('x-user-id') userId: string,
    @Query('limit') limit?: string,
  ) {
    return this.projects.history(id, userId, limit === undefined ? undefined : Number(limit));
  }

  @Post(':id/snapshots')
  createSnapshot(
    @Param('id') id: string,
    @Headers('x-user-id') userId: string,
    @Body() body: { name: string; message?: string },
  ) {
    return this.projects.createSnapshot(id, userId, body.name, body.message);
  }

  @Post(':id/snapshots/:snapshotId/restore')
  restoreSnapshot(
    @Param('id') id: string,
    @Param('snapshotId') snapshotId: string,
    @Headers('x-user-id') userId: string,
  ) {
    return this.projects.restoreSnapshot(id, userId, snapshotId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Headers('x-user-id') userId: string) {
    await this.projects.remove(id, userId);
    return { ok: true };
  }
}
