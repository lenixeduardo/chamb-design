import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PluginRegistry } from '@opendesign/core';
import { componentsPlugin } from '@opendesign/components';
import { exportersPlugin } from '@opendesign/exporters';
import { aiProvidersPlugin } from '@opendesign/ai';

/**
 * The server's plugin registry.
 *
 * Deliberately the *same* set of plugins the editor loads, registered through
 * the same public API. Server-side export and browser-side export therefore
 * produce byte-identical output — a CI pipeline and a designer clicking
 * "Download" can never drift apart.
 */
@Injectable()
export class RegistryService implements OnModuleInit {
  private readonly logger = new Logger(RegistryService.name);
  readonly registry = new PluginRegistry();

  async onModuleInit(): Promise<void> {
    await this.registry.registerAll([componentsPlugin, exportersPlugin, aiProvidersPlugin]);
    this.logger.log(
      `loaded ${this.registry.getComponents().length} blocks, ` +
        `${this.registry.getExporters().length} export targets, ` +
        `${this.registry.getAIProviders().length} model providers`,
    );
  }
}
