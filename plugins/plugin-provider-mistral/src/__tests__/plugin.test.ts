import { describe, expect, it, vi } from 'vitest';
import { PluginRegistry } from '@opendesign/core';
import { aiProvidersPlugin, collect, type ChatProvider } from '@opendesign/ai';
import { mistralProvider, mistralProviderPlugin } from '../index.js';

/** Builds an SSE `Response` the way an OpenAI-compatible endpoint would. */
function sseResponse(chunks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

describe('mistral provider plugin', () => {
  it('registers alongside the built-in providers', async () => {
    const registry = new PluginRegistry();
    await registry.registerAll([aiProvidersPlugin, mistralProviderPlugin]);

    expect(registry.getAIProviders()).toHaveLength(8);
    expect(registry.getAIProvider('mistral')?.models.length).toBeGreaterThan(0);
  });

  it('creates a working client through the registry', async () => {
    const registry = new PluginRegistry();
    await registry.register(mistralProviderPlugin);

    const contribution = registry.getAIProvider('mistral')!;
    const client = contribution.createClient({ apiKey: 'test-key' }) as ChatProvider;

    expect(client.id).toBe('mistral');
    expect(client.locality).toBe('cloud');
  });

  it('streams deltas and usage from an SSE response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        // Split mid-frame: buffering across chunk boundaries has to work.
        'data: {"choices":[{"delta":{"content":" wo',
        'rld"}}]}\n\n',
        'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":11,"completion_tokens":5}}\n\n',
        'data: [DONE]\n\n',
      ]),
    );

    const provider = mistralProvider({ apiKey: 'k', fetch: fetchMock as unknown as typeof fetch });
    const result = await collect(
      provider.stream({
        model: 'mistral-large-latest',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    );

    expect(result.text).toBe('Hello world');
    expect(result.usage).toEqual({ inputTokens: 11, outputTokens: 5 });
  });

  it('sends a bearer token to the Mistral endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(['data: [DONE]\n\n']));
    const provider = mistralProvider({
      apiKey: 'secret',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await collect(provider.stream({ model: 'mistral-large-latest', messages: [] }));

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.mistral.ai/v1/chat/completions');
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer secret' });
  });

  it('fails clearly when no API key is configured', async () => {
    const provider = mistralProvider({});
    await expect(
      collect(provider.stream({ model: 'mistral-large-latest', messages: [] })),
    ).rejects.toThrow(/missing API key/);
  });

  it('surfaces an upstream error with its status', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response('rate limited', { status: 429, statusText: 'Too Many Requests' }),
      );

    const provider = mistralProvider({ apiKey: 'k', fetch: fetchMock as unknown as typeof fetch });

    await expect(
      collect(provider.stream({ model: 'mistral-large-latest', messages: [] })),
    ).rejects.toThrow(/429/);
  });
});
