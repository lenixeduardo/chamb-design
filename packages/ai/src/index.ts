import { definePlugin, type OpenDesignPlugin } from '@opendesign/core';
import { anthropicProvider } from './providers/anthropic.js';
import { googleProvider } from './providers/google.js';
import {
  deepseekProvider,
  lmstudioProvider,
  ollamaProvider,
  openaiProvider,
  openrouterProvider,
} from './providers/openai-compatible.js';
import type { ChatProvider, ProviderConfig } from './provider.js';
import { IMAGE_PROVIDER_FACTORIES } from './image.js';

export * from './provider.js';
export * from './context.js';
export * from './extract.js';
export * from './prompts.js';
export * from './review.js';
export * from './agent.js';
export * from './image.js';
export * from './providers/anthropic.js';
export * from './providers/google.js';
export * from './providers/openai-compatible.js';

export type ProviderFactory = (config?: ProviderConfig) => ChatProvider;

/**
 * Every provider the platform ships with.
 *
 * They are keyed by id and constructed lazily, so listing available models in
 * the UI never requires an API key or a network call.
 */
export const PROVIDER_FACTORIES: Record<string, ProviderFactory> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  google: googleProvider,
  deepseek: deepseekProvider,
  openrouter: openrouterProvider,
  ollama: ollamaProvider,
  lmstudio: lmstudioProvider,
};

export function createProvider(id: string, config: ProviderConfig = {}): ChatProvider {
  const factory = PROVIDER_FACTORIES[id];
  if (!factory) {
    throw new Error(
      `[opendesign:ai] unknown provider "${id}". Available: ${Object.keys(PROVIDER_FACTORIES).join(', ')}`,
    );
  }
  return factory(config);
}

/** Metadata for the provider picker, with no credentials required. */
export function listProviders(): {
  id: string;
  label: string;
  locality: 'cloud' | 'local';
  models: { id: string; label: string; vision?: boolean }[];
}[] {
  return Object.entries(PROVIDER_FACTORIES).map(([id, factory]) => {
    const provider = factory({});
    return {
      id,
      label: provider.label,
      locality: provider.locality,
      models: provider.models.map((model) => ({
        id: model.id,
        label: model.label,
        ...(model.vision !== undefined ? { vision: model.vision } : {}),
      })),
    };
  });
}

/** Providers register as plugin contributions, same as blocks and exporters. */
export const aiProvidersPlugin: OpenDesignPlugin = definePlugin({
  id: 'opendesign.ai-providers',
  name: 'OpenDesign model providers',
  version: '0.1.0',
  description: 'Claude, GPT, Gemini, DeepSeek, OpenRouter, Ollama and LM Studio.',
  activate(context) {
    for (const [id, factory] of Object.entries(PROVIDER_FACTORIES)) {
      const provider = factory({});
      context.registerAIProvider({
        id,
        label: provider.label,
        locality: provider.locality,
        models: provider.models.map((model) => ({
          id: model.id,
          label: model.label,
          ...(model.contextWindow !== undefined ? { contextWindow: model.contextWindow } : {}),
        })),
        createClient: (config) => factory(config as ProviderConfig),
      });
    }

    // Image generation registers through its own contribution point, so a
    // plugin can add a model source without touching the chat providers.
    for (const [id, factory] of Object.entries(IMAGE_PROVIDER_FACTORIES)) {
      const provider = factory({});
      context.registerImageProvider({
        id,
        label: provider.label,
        locality: provider.locality,
        models: provider.models.map((model) => ({
          id: model.id,
          label: model.label,
          ...(model.sizes ? { sizes: model.sizes } : {}),
        })),
        createClient: (config) => factory(config as ProviderConfig),
      });
    }
  },
});
