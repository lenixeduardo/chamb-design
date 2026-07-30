import {
  assertOk,
  parseSSE,
  ProviderError,
  type ChatChunk,
  type ChatMessage,
  type ChatProvider,
  type ChatRequest,
  type ProviderConfig,
} from '../provider.js';

/**
 * Anthropic's Messages API.
 *
 * It differs from the OpenAI shape in three ways that matter here: the system
 * prompt is a top-level field rather than a message, images are inline base64
 * `source` blocks, and streaming arrives as typed events instead of deltas on a
 * choice. Small differences, but exactly why a shared adapter would leak.
 */

/**
 * Sampling parameters were removed from the current Claude generation and now
 * return a 400 rather than being ignored. The agent sets a temperature for
 * every provider, so it has to be dropped here instead — sending it would make
 * the best models the only ones that cannot run.
 */
function acceptsTemperature(model: string): boolean {
  return !/^claude-(opus-5|sonnet-5|fable-5|mythos-5|opus-4-(7|8))/.test(model);
}

export function anthropicProvider(config: ProviderConfig = {}): ChatProvider {
  const doFetch = config.fetch ?? globalThis.fetch;
  const baseUrl = (config.baseUrl ?? 'https://api.anthropic.com/v1').replace(/\/$/, '');

  return {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    locality: 'cloud',
    models: [
      { id: 'claude-opus-5', label: 'Claude Opus 5', contextWindow: 1000000, vision: true },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', contextWindow: 1000000, vision: true },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', contextWindow: 200000, vision: true },
    ],

    async *stream(request: ChatRequest): AsyncIterable<ChatChunk> {
      if (!config.apiKey) throw new ProviderError('missing API key', 'anthropic');

      const response = await doFetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          ...config.headers,
        },
        body: JSON.stringify({
          model: request.model,
          // A full page is a large batch of operations, and the current models
          // think before they answer — both come out of this budget. 8k truncated
          // real generations mid-JSON, which surfaced as "no operations".
          max_tokens: request.maxTokens ?? 32000,
          ...(acceptsTemperature(request.model) ? { temperature: request.temperature ?? 0.4 } : {}),
          stream: true,
          ...(request.system ? { system: request.system } : {}),
          messages: toAnthropicMessages(request.messages),
        }),
        ...(request.signal ? { signal: request.signal } : {}),
      });

      await assertOk(response, 'anthropic');

      let inputTokens = 0;

      for await (const event of parseSSE(response, 'anthropic')) {
        const type = event.type as string | undefined;

        if (type === 'message_start') {
          const usage = (event.message as { usage?: { input_tokens?: number } } | undefined)?.usage;
          inputTokens = usage?.input_tokens ?? 0;
          continue;
        }

        if (type === 'content_block_delta') {
          const delta = event.delta as { type?: string; text?: string } | undefined;
          if (delta?.type === 'text_delta' && delta.text) {
            yield { delta: delta.text, done: false };
          }
          continue;
        }

        if (type === 'message_delta') {
          const usage = event.usage as { output_tokens?: number } | undefined;
          if (usage) {
            yield {
              delta: '',
              done: false,
              usage: { inputTokens, outputTokens: usage.output_tokens ?? 0 },
            };
          }
          continue;
        }

        if (type === 'error') {
          const error = event.error as { message?: string } | undefined;
          throw new ProviderError(error?.message ?? 'stream error', 'anthropic');
        }
      }

      yield { delta: '', done: true };
    },
  };
}

function toAnthropicMessages(messages: ChatMessage[]) {
  // Anthropic rejects system messages inside the array; they belong up top.
  return messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role,
      content:
        typeof message.content === 'string'
          ? message.content
          : message.content.map((part) =>
              part.type === 'text'
                ? { type: 'text', text: part.text }
                : {
                    type: 'image',
                    source: part.data.startsWith('http')
                      ? { type: 'url', url: part.data }
                      : { type: 'base64', media_type: part.mimeType, data: part.data },
                  },
            ),
    }));
}
