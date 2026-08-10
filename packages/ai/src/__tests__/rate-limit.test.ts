import { describe, expect, it } from 'vitest';
import { DesignAgent } from '../agent.js';
import { ProviderError, type ChatChunk, type ChatProvider } from '../provider.js';
import { createDocument, setIdRng, seededRng } from '@opendesign/core';

/**
 * Reproduces the "too many requests" path the user hits in the chat.
 *
 * A real provider responds 429 when its rate limit is exhausted. `assertOk`
 * turns that into a `ProviderError` carrying the status; this test proves the
 * agent surfaces it (rather than swallowing it into the repair loop) and that
 * the status survives to the layer that formats the user-facing message.
 */

function rateLimitedProvider(status = 429): ChatProvider & { calls: number } {
  const provider = {
    id: 'fake',
    label: 'Fake',
    locality: 'local' as const,
    models: [{ id: 'fake-1', label: 'Fake 1' }],
    calls: 0,
    async *stream(): AsyncIterable<ChatChunk> {
      provider.calls += 1;
      throw new ProviderError(
        'request failed with 429 Too Many Requests',
        'fake',
        status,
        '{"error":{"message":"Rate limit reached. Retry later."}}',
      );
    },
  };
  return provider;
}

describe('rate limit (429) handling', () => {
  it('propagates a ProviderError with status 429 instead of repairing it', async () => {
    const provider = rateLimitedProvider();
    const agent = new DesignAgent({ provider, model: 'fake-1', autoReview: false });

    const doc = createDocument({ name: 'rate limit test' });

    const events: unknown[] = [];
    let thrown: unknown = null;
    try {
      for await (const event of agent.run({ prompt: 'do something', document: doc })) {
        events.push(event);
      }
    } catch (error) {
      thrown = error;
    }

    // A rate limit must not be misread as a schema/repair problem: it has to
    // escape the agent loop as a transport failure, so the caller can show the
    // right message.
    expect(thrown).toBeInstanceOf(ProviderError);
    const err = thrown as ProviderError;
    expect(err.status).toBe(429);
    expect(err.message).toContain('429');
    // Exactly one provider call — the failure escapes on the first attempt,
    // so a 429 never triggers the repair loop (which would re-bill the key).
    expect(provider.calls).toBe(1);
    expect(events.filter((e) => (e as { type?: string }).type === 'error')).toHaveLength(0);
  });

  it('exposes the status the UI needs to format a friendly message', async () => {
    const provider = rateLimitedProvider(429);
    try {
      const agent = new DesignAgent({ provider, model: 'fake-1', autoReview: false });
      await agent.edit({ prompt: 'x', document: createDocument({ name: 't' }) });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).status).toBe(429);
      expect((error as ProviderError).providerId).toBe('fake');
      expect((error as ProviderError).body).toContain('Rate limit reached');
    }
  });

  it('distinguishes 429 from other provider failures by status', async () => {
    const provider = rateLimitedProvider(401);
    const agent = new DesignAgent({ provider, model: 'fake-1', autoReview: false });
    try {
      await agent.edit({ prompt: 'x', document: createDocument({ name: 't' }) });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      // 401 means the key is wrong — not a "try again" signal.
      expect((error as ProviderError).status).toBe(401);
    }
  });
});
