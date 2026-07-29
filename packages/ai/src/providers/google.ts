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
 * Google's Generative Language API.
 *
 * Two quirks shape this adapter: roles are `user`/`model` rather than
 * `user`/`assistant`, and content is a list of `parts` with `inlineData` for
 * images. Streaming uses SSE via the `?alt=sse` query flag.
 */
export function googleProvider(config: ProviderConfig = {}): ChatProvider {
  const doFetch = config.fetch ?? globalThis.fetch;
  const baseUrl = (config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(
    /\/$/,
    '',
  );

  return {
    id: 'google',
    label: 'Gemini (Google)',
    locality: 'cloud',
    models: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', contextWindow: 1000000, vision: true },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', contextWindow: 1000000, vision: true },
    ],

    async *stream(request: ChatRequest): AsyncIterable<ChatChunk> {
      if (!config.apiKey) throw new ProviderError('missing API key', 'google');

      const url = `${baseUrl}/models/${encodeURIComponent(
        request.model,
      )}:streamGenerateContent?alt=sse`;

      const response = await doFetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': config.apiKey,
          ...config.headers,
        },
        body: JSON.stringify({
          contents: toGoogleContents(request.messages),
          ...(request.system ? { systemInstruction: { parts: [{ text: request.system }] } } : {}),
          generationConfig: {
            temperature: request.temperature ?? 0.4,
            maxOutputTokens: request.maxTokens ?? 8192,
            ...(request.responseFormat === 'json' ? { responseMimeType: 'application/json' } : {}),
          },
        }),
        ...(request.signal ? { signal: request.signal } : {}),
      });

      await assertOk(response, 'google');

      for await (const event of parseSSE(response, 'google')) {
        const candidates = event.candidates as
          { content?: { parts?: { text?: string }[] } }[] | undefined;

        const delta =
          candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';

        const usage = event.usageMetadata as
          { promptTokenCount?: number; candidatesTokenCount?: number } | undefined;

        if (usage) {
          yield {
            delta,
            done: false,
            usage: {
              inputTokens: usage.promptTokenCount ?? 0,
              outputTokens: usage.candidatesTokenCount ?? 0,
            },
          };
          continue;
        }

        if (delta) yield { delta, done: false };
      }

      yield { delta: '', done: true };
    },
  };
}

function toGoogleContents(messages: ChatMessage[]) {
  return messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts:
        typeof message.content === 'string'
          ? [{ text: message.content }]
          : message.content.map((part) =>
              part.type === 'text'
                ? { text: part.text }
                : { inlineData: { mimeType: part.mimeType, data: part.data } },
            ),
    }));
}
