import { PluginRegistry, type OpenDesignPlugin } from '@opendesign/core';
import { componentsPlugin } from '@opendesign/components';
import { exportersPlugin } from '@opendesign/exporters';
import { aiProvidersPlugin } from '@opendesign/ai';

/**
 * The running instance's plugin registry.
 *
 * Built-in blocks, exporters and model providers register through the same
 * public API a third-party plugin uses — the app has no privileged path into
 * the registry, which is the only way to know the plugin API is actually
 * sufficient.
 */
let registryPromise: Promise<PluginRegistry> | null = null;

const CORE_PLUGINS: OpenDesignPlugin[] = [componentsPlugin, exportersPlugin, aiProvidersPlugin];

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
