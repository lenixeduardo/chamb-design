import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { exportProject } from '@opendesign/exporters';
import { validateDocumentIntegrity, type DesignDocument } from '@opendesign/core';
import { RegistryService } from '../common/registry.provider';

interface ExportBody {
  document: DesignDocument;
  target: string;
  options?: Record<string, unknown>;
}

/**
 * Headless export.
 *
 * The same registry the editor uses, so CI and the Download button produce
 * identical files. This is what makes "export to a repo on every merge" a
 * three-line pipeline step rather than a scraping exercise.
 */
@Controller('export')
export class ExportController {
  constructor(private readonly registryService: RegistryService) {}

  @Get('targets')
  targets() {
    return {
      targets: this.registryService.registry.getExporters().map((exporter) => ({
        id: exporter.id,
        label: exporter.label,
        description: exporter.description,
      })),
    };
  }

  @Post()
  async run(@Body() body: ExportBody) {
    const integrity = validateDocumentIntegrity(body.document);
    if (!integrity.ok) {
      throw new BadRequestException({
        message: 'document failed validation',
        errors: integrity.errors.slice(0, 10),
      });
    }

    try {
      return await exportProject(
        this.registryService.registry,
        body.document,
        body.target,
        body.options,
      );
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }
  }
}
