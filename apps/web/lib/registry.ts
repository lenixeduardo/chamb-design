import { PluginRegistry, type OpenDesignPlugin } from '@opendesign/core';
import { componentsPlugin } from '@opendesign/components';
import { exportersPlugin } from '@opendesign/exporters';
import { aiProvidersPlugin } from '@opendesign/ai';
import { chartsPlugin } from '@opendesign/plugin-charts';
import { chambBrandPlugin } from '@opendesign/plugin-chamb-brand';
import { remotionPlugin } from '@opendesign/plugin-remotion';

/**
 * The running instance's plugin registry.
 *
 * Built-in blocks, exporters and model providers register through the same
 * public API a third-party plugin uses — the app has no privileged path into
 * the registry, which is the only way to know the plugin API is actually
 * sufficient.
 */
let registryPromise: Promise<PluginRegistry> | null = null;

const CORE_PLUGINS: OpenDesignPlugin[] = [
  componentsPlugin,
  exportersPlugin,
  aiProvidersPlugin,
  // Bundled community plugins. They load through the same public API as any
  // third-party pack — which is the whole reason they stay separate packages.
  chartsPlugin,
  chambBrandPlugin,
  // Video export. The target only emits code, so Remotion itself stays an
  // optional peer dependency and nothing here pulls in its licence.
  remotionPlugin,
];

export function getRegistry(): Promise<PluginRegistry> {
  if (!registryPromise) {
    registryPromise = (async () => {
      const registry = new PluginRegistry();
      await registry.registerAll(CORE_PLUGINS);
      return registry;
    })();
  }
  return registryPromise;
}

/** Registers a plugin into the live instance (used by the plugin manager UI). */
export async function installPlugin(plugin: OpenDesignPlugin): Promise<void> {
  const registry = await getRegistry();
  await registry.register(plugin);
}
