import { definePlugin, type OpenDesignPlugin } from '@opendesign/core';
import {
  createOpenAICompatibleProvider,
  type ChatProvider,
  type ProviderConfig,
} from '@opendesign/ai';

/**
 * Example: an AI provider plugin.
 *
 * Mistral speaks the OpenAI chat-completions shape, so this is a base URL and a
 * model list. A provider with its own wire format would implement the
 * `ChatProvider` interface directly instead — `stream()` is the only required
 * method, and it takes plain `fetch`, so there is no SDK to depend on.
 */
export function mistralProvider(config: ProviderConfig = {}): ChatProvider {
  return createOpenAICompatibleProvider({
    ...config,
    id: 'mistral',
    label: 'Mistral',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    models: [
      { id: 'mistral-large-latest', label: 'Mistral Large', contextWindow: 128000 },
      { id: 'mistral-medium-latest', label: 'Mistral Medium', contextWindow: 128000 },
      { id: 'codestral-latest', label: 'Codestral', contextWindow: 256000 },
      { id: 'pixtral-large-latest', label: 'Pixtral Large (vision)', vision: true },
    ],
  });
}

export const mistralProviderPlugin: OpenDesignPlugin = definePlugin({
  id: 'community.provider-mistral',
  name: 'Mistral provider',
  version: '0.1.0',
  description: 'Adds Mistral models to the provider picker.',
  author: 'OpenDesign community',
  activate(context) {
    const provider = mistralProvider();
    context.registerAIProvider({
      id: provider.id,
      label: provider.label,
      locality: provider.locality,
      models: provider.models.map((model) => ({
        id: model.id,
        label: model.label,
        ...(model.contextWindow !== undefined ? { contextWindow: model.contextWindow } : {}),
      })),
      createClient: (clientConfig) => mistralProvider(clientConfig as ProviderConfig),
    });
  },
});

export default mistralProviderPlugin;
