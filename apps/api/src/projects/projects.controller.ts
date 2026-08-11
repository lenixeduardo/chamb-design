import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { DesignDocument } from '@opendesign/core';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
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
 * Every route sits behind `JwtAuthGuard`: identity comes from a verified
 * bearer token, not a caller-supplied header, so a project's owner is the
 * only one who can list, read or write it unless they add a collaborator.
 */
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() userId: string) {
    return this.projects.list(userId);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() userId: string) {
    return this.projects.get(id, userId);
  }

  @Post()
  create(@CurrentUser() userId: string, @Body() body: CreateProjectBody) {
    return this.projects.create(userId, body.name, body.document, body.folder);
  }

  @Post(':id/operations')
  applyOperations(
    @Param('id') id: string,
    @CurrentUser() userId: string,
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
    @CurrentUser() userId: string,
    @Query('limit') limit?: string,
  ) {
    return this.projects.history(id, userId, limit === undefined ? undefined : Number(limit));
  }

  @Post(':id/snapshots')
  createSnapshot(
    @Param('id') id: string,
    @CurrentUser() userId: string,
    @Body() body: { name: string; message?: string },
  ) {
    return this.projects.createSnapshot(id, userId, body.name, body.message);
  }

  @Post(':id/snapshots/:snapshotId/restore')
  restoreSnapshot(
    @Param('id') id: string,
    @Param('snapshotId') snapshotId: string,
    @CurrentUser() userId: string,
  ) {
    return this.projects.restoreSnapshot(id, userId, snapshotId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() userId: string) {
    await this.projects.remove(id, userId);
    return { ok: true };
  }
}
