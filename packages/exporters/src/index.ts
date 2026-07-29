import {
  definePlugin,
  type DesignDocument,
  type ExporterContribution,
  type GeneratedFile,
  type OpenDesignPlugin,
  type PluginRegistry,
} from '@opendesign/core';
import { nextExporter, reactExporter } from './targets/react.js';
import { htmlExporter } from './targets/html.js';
import { astroExporter, svelteExporter, sfcExporters, vueExporter } from './targets/sfc.js';

export * from './emit/tree.js';
export * from './emit/serialize.js';
export { generateReact } from './targets/react.js';
export { generateHtml } from './targets/html.js';
export { reactExporter, nextExporter, htmlExporter, vueExporter, svelteExporter, astroExporter };

export const BUILTIN_EXPORTERS: ExporterContribution[] = [
  reactExporter,
  nextExporter,
  htmlExporter,
  ...sfcExporters,
];

/** Export targets ship as a plugin, exactly like third-party ones do. */
export const exportersPlugin: OpenDesignPlugin = definePlugin({
  id: 'opendesign.exporters',
  name: 'OpenDesign exporters',
  version: '0.1.0',
  description: 'React, Next.js, HTML, Vue, Svelte and Astro export targets.',
  activate(context) {
    for (const exporter of BUILTIN_EXPORTERS) context.registerExporter(exporter);
  },
});

export interface ExportResult {
  targetId: string;
  files: GeneratedFile[];
  totalBytes: number;
}

/**
 * Runs an export target by id.
 *
 * Resolution goes through the registry, so a plugin-contributed target is
 * indistinguishable from a built-in one at the call site.
 */
export async function exportProject(
  registry: PluginRegistry,
  document: DesignDocument,
  targetId: string,
  options?: Record<string, unknown>,
): Promise<ExportResult> {
  const exporter = registry.getExporter(targetId);
  if (!exporter) {
    const available = registry
      .getExporters()
      .map((e) => e.id)
      .join(', ');
    throw new Error(`[opendesign] unknown export target "${targetId}". Available: ${available}`);
  }

  const files = await exporter.generate(document, options);
  const totalBytes = files.reduce((sum, file) => sum + Buffer.byteLength(file.contents, 'utf8'), 0);

  return { targetId, files, totalBytes };
}
