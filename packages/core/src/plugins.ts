import type { DesignDocument, SceneNode, StyleMap, TokenSet } from './types.js';

/* -------------------------------------------------------------------------- */
/*                             Contribution points                            */
/* -------------------------------------------------------------------------- */

export interface PropSchemaField {
  name: string;
  label?: string;
  type: 'string' | 'number' | 'boolean' | 'color' | 'image' | 'enum' | 'richtext';
  defaultValue?: unknown;
  options?: { label: string; value: string }[];
  description?: string;
}

/** A component that can be dropped on the canvas and rendered/exported. */
export interface ComponentContribution {
  /** Namespaced, e.g. `lib:pricing-table` or `charts:bar`. */
  id: string;
  name: string;
  category: string;
  description?: string;
  keywords?: string[];
  /** Data URI or remote URL shown in the library grid. */
  thumbnail?: string;
  props: PropSchemaField[];
  defaultStyle?: StyleMap;
  /** Builds the subtree inserted when the user (or the AI) places the block. */
  create: (context: ComponentCreateContext) => { nodes: SceneNode[]; rootId: string };
  /**
   * Optional direct code emission. When absent, exporters walk the subtree
   * produced by `create` — which is what keeps most blocks portable across
   * every export target for free.
   */
  emit?: Partial<Record<string, (node: SceneNode) => string>>;
}

export interface ComponentCreateContext {
  createId: (prefix?: string) => string;
  tokens: TokenSet;
  props?: Record<string, unknown>;
}

export interface GeneratedFile {
  path: string;
  contents: string;
}

export interface ExporterContribution {
  id: string;
  label: string;
  description?: string;
  /** Emits a complete, runnable project (or a single file for `html`). */
  generate: (
    document: DesignDocument,
    options?: Record<string, unknown>,
  ) => GeneratedFile[] | Promise<GeneratedFile[]>;
}

export interface AIProviderContribution {
  id: string;
  label: string;
  /** `local` providers never leave the machine — surfaced in the UI as such. */
  locality: 'cloud' | 'local';
  models: { id: string; label: string; contextWindow?: number }[];
  createClient: (config: Record<string, unknown>) => unknown;
}

/**
 * A source of generated raster images.
 *
 * Kept separate from `AIProviderContribution` because the two have genuinely
 * different shapes: a chat provider streams tokens, an image provider returns
 * bytes once. Folding them together would mean one interface where half the
 * methods are always unused.
 */
export interface ImageProviderContribution {
  id: string;
  label: string;
  locality: 'cloud' | 'local';
  models: { id: string; label: string; sizes?: string[] }[];
  createClient: (config: Record<string, unknown>) => unknown;
}

export interface TemplateContribution {
  id: string;
  name: string;
  category: string;
  thumbnail?: string;
  /** A full document, ready to be loaded into a new project. */
  build: () => DesignDocument;
}

export interface CommandContribution {
  id: string;
  title: string;
  /** Shown in the ⌘K palette; e.g. `["mod+shift+d"]`. */
  shortcut?: string[];
  section?: string;
  run: (api: PluginRuntimeApi) => void | Promise<void>;
}

export interface PanelContribution {
  id: string;
  title: string;
  placement: 'left' | 'right' | 'bottom';
  icon?: string;
  /** Rendered by the host app; typed as unknown to keep core React-free. */
  component: unknown;
}

export interface IntegrationContribution {
  id: string;
  label: string;
  kind: 'deploy' | 'storage' | 'import' | 'analytics';
  run: (document: DesignDocument, config: Record<string, unknown>) => Promise<unknown>;
}

/* -------------------------------------------------------------------------- */
/*                                   Plugin                                   */
/* -------------------------------------------------------------------------- */

/** The subset of the host the plugin is allowed to touch. */
export interface PluginRuntimeApi {
  getDocument: () => DesignDocument;
  transact: (ops: unknown[], label: string) => void;
  notify: (message: string, level?: 'info' | 'success' | 'error') => void;
}

export interface PluginContext {
  readonly pluginId: string;
  registerComponent: (contribution: ComponentContribution) => void;
  registerExporter: (contribution: ExporterContribution) => void;
  registerAIProvider: (contribution: AIProviderContribution) => void;
  registerImageProvider: (contribution: ImageProviderContribution) => void;
  registerTemplate: (contribution: TemplateContribution) => void;
  registerCommand: (contribution: CommandContribution) => void;
  registerPanel: (contribution: PanelContribution) => void;
  registerIntegration: (contribution: IntegrationContribution) => void;
  log: (...args: unknown[]) => void;
}

export interface OpenDesignPlugin {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  /** Plugin ids that must be active first. */
  dependencies?: string[];
  activate: (context: PluginContext) => void | Promise<void>;
  deactivate?: () => void | Promise<void>;
}

/* -------------------------------------------------------------------------- */
/*                                  Registry                                  */
/* -------------------------------------------------------------------------- */

interface RegistryEntry<T> {
  pluginId: string;
  contribution: T;
}

/**
 * Holds every contribution in the running instance.
 *
 * Core ships zero components and zero exporters of its own: the built-in
 * library and the built-in export targets register through exactly the same
 * API third-party plugins use. If a first-party feature needs a private hook,
 * that is a bug in the plugin API.
 */
export class PluginRegistry {
  private readonly plugins = new Map<string, OpenDesignPlugin>();
  private readonly active = new Set<string>();

  private readonly components = new Map<string, RegistryEntry<ComponentContribution>>();
  private readonly exporters = new Map<string, RegistryEntry<ExporterContribution>>();
  private readonly providers = new Map<string, RegistryEntry<AIProviderContribution>>();
  private readonly imageProviders = new Map<string, RegistryEntry<ImageProviderContribution>>();
  private readonly templates = new Map<string, RegistryEntry<TemplateContribution>>();
  private readonly commands = new Map<string, RegistryEntry<CommandContribution>>();
  private readonly panels = new Map<string, RegistryEntry<PanelContribution>>();
  private readonly integrations = new Map<string, RegistryEntry<IntegrationContribution>>();

  async register(plugin: OpenDesignPlugin): Promise<void> {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`[opendesign] plugin already registered: ${plugin.id}`);
    }

    for (const dependency of plugin.dependencies ?? []) {
      if (!this.active.has(dependency)) {
        throw new Error(
          `[opendesign] plugin "${plugin.id}" requires "${dependency}", which is not active`,
        );
      }
    }

    this.plugins.set(plugin.id, plugin);
    await plugin.activate(this.createContext(plugin.id));
    this.active.add(plugin.id);
  }

  async registerAll(plugins: OpenDesignPlugin[]): Promise<void> {
    for (const plugin of plugins) await this.register(plugin);
  }

  async unregister(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    const dependents = [...this.plugins.values()].filter((p) => p.dependencies?.includes(pluginId));
    if (dependents.length > 0) {
      throw new Error(
        `[opendesign] cannot unregister "${pluginId}": still required by ${dependents
          .map((p) => p.id)
          .join(', ')}`,
      );
    }

    await plugin.deactivate?.();

    for (const map of [
      this.components,
      this.exporters,
      this.providers,
      this.imageProviders,
      this.templates,
      this.commands,
      this.panels,
      this.integrations,
    ] as Map<string, RegistryEntry<unknown>>[]) {
      for (const [key, entry] of map) {
        if (entry.pluginId === pluginId) map.delete(key);
      }
    }

    this.active.delete(pluginId);
    this.plugins.delete(pluginId);
  }

  getPlugins(): OpenDesignPlugin[] {
    return [...this.plugins.values()];
  }

  getComponent(id: string): ComponentContribution | undefined {
    return this.components.get(id)?.contribution;
  }

  getComponents(category?: string): ComponentContribution[] {
    const all = [...this.components.values()].map((e) => e.contribution);
    return category ? all.filter((c) => c.category === category) : all;
  }

  getCategories(): string[] {
    return [...new Set(this.getComponents().map((c) => c.category))].sort();
  }

  searchComponents(query: string): ComponentContribution[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.getComponents();
    return this.getComponents().filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.keywords?.some((k) => k.toLowerCase().includes(q)),
    );
  }

  getExporter(id: string): ExporterContribution | undefined {
    return this.exporters.get(id)?.contribution;
  }

  getExporters(): ExporterContribution[] {
    return [...this.exporters.values()].map((e) => e.contribution);
  }

  getAIProvider(id: string): AIProviderContribution | undefined {
    return this.providers.get(id)?.contribution;
  }

  getAIProviders(): AIProviderContribution[] {
    return [...this.providers.values()].map((e) => e.contribution);
  }

  getImageProvider(id: string): ImageProviderContribution | undefined {
    return this.imageProviders.get(id)?.contribution;
  }

  getImageProviders(): ImageProviderContribution[] {
    return [...this.imageProviders.values()].map((e) => e.contribution);
  }

  getTemplates(): TemplateContribution[] {
    return [...this.templates.values()].map((e) => e.contribution);
  }

  getCommands(): CommandContribution[] {
    return [...this.commands.values()].map((e) => e.contribution);
  }

  getPanels(placement?: PanelContribution['placement']): PanelContribution[] {
    const all = [...this.panels.values()].map((e) => e.contribution);
    return placement ? all.filter((p) => p.placement === placement) : all;
  }

  getIntegrations(kind?: IntegrationContribution['kind']): IntegrationContribution[] {
    const all = [...this.integrations.values()].map((e) => e.contribution);
    return kind ? all.filter((i) => i.kind === kind) : all;
  }

  private createContext(pluginId: string): PluginContext {
    const add = <T extends { id: string }>(
      map: Map<string, RegistryEntry<T>>,
      kind: string,
      contribution: T,
    ) => {
      const existing = map.get(contribution.id);
      if (existing) {
        throw new Error(
          `[opendesign] ${kind} "${contribution.id}" already contributed by "${existing.pluginId}"`,
        );
      }
      map.set(contribution.id, { pluginId, contribution });
    };

    return {
      pluginId,
      registerComponent: (c) => add(this.components, 'component', c),
      registerExporter: (c) => add(this.exporters, 'exporter', c),
      registerAIProvider: (c) => add(this.providers, 'ai provider', c),
      registerImageProvider: (c) => add(this.imageProviders, 'image provider', c),
      registerTemplate: (c) => add(this.templates, 'template', c),
      registerCommand: (c) => add(this.commands, 'command', c),
      registerPanel: (c) => add(this.panels, 'panel', c),
      registerIntegration: (c) => add(this.integrations, 'integration', c),
      log: (...args: unknown[]) => console.info(`[plugin:${pluginId}]`, ...args),
    };
  }
}

/** Convenience helper so plugin authors get full type inference. */
export function definePlugin(plugin: OpenDesignPlugin): OpenDesignPlugin {
  return plugin;
}
