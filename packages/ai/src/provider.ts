/**
 * The provider contract.
 *
 * Every model — hosted or local — is reached through this one interface, and
 * every adapter is written against `fetch` rather than a vendor SDK. That keeps
 * the package dependency-free, runnable on the edge, and makes "add a provider"
 * a ~60 line file instead of a new dependency and a new failure mode.
 */

export type MessageRole = 'system' | 'user' | 'assistant';

export interface TextPart {
  type: 'text';
  text: string;
}

export interface ImagePart {
  type: 'image';
  /** Base64 payload without the data URI prefix, or an absolute URL. */
  data: string;
  mimeType: string;
}

export type ContentPart = TextPart | ImagePart;

export interface ChatMessage {
  role: MessageRole;
  content: string | ContentPart[];
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
  /** Ask the provider for strict JSON where it supports it. */
  responseFormat?: 'text' | 'json';
  signal?: AbortSignal;
}

export interface ChatChunk {
  /** Incremental text. Empty on the final usage-only chunk. */
  delta: string;
  done: boolean;
  usage?: TokenUsage;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ModelInfo {
  id: string;
  label: string;
  contextWindow?: number;
  /** Whether the model accepts image parts — gates the "import a screenshot" flow. */
  vision?: boolean;
}

export interface ProviderConfig {
  apiKey?: string;
  /** Override for self-hosted gateways, proxies and local runtimes. */
  baseUrl?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

export interface ChatProvider {
  readonly id: string;
  readonly label: string;
  /** `local` providers never send data off the machine. */
  readonly locality: 'cloud' | 'local';
  readonly models: ModelInfo[];
  /** Streams a completion. Implementations must yield a final `done` chunk. */
  stream(request: ChatRequest): AsyncIterable<ChatChunk>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly providerId: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(`[opendesign:ai:${providerId}] ${message}`);
    this.name = 'ProviderError';
  }
}

/** Collects a stream into one string — the non-streaming convenience path. */
export async function collect(stream: AsyncIterable<ChatChunk>): Promise<{
  text: string;
  usage?: TokenUsage;
}> {
  let text = '';
  let usage: TokenUsage | undefined;
  for await (const chunk of stream) {
    text += chunk.delta;
    if (chunk.usage) usage = chunk.usage;
  }
  return usage ? { text, usage } : { text };
}

/**
 * Parses a Server-Sent Events body.
 *
 * Every provider we support streams SSE, but they disagree on framing details,
 * so the byte-level handling lives here once. Buffering across chunk
 * boundaries matters: a JSON payload is routinely split mid-object.
 */
export async function* parseSSE(
  response: Response,
  providerId: string,
): AsyncGenerator<Record<string, unknown>> {
  if (!response.body) {
    throw new ProviderError('response had no body', providerId, response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const event of events) {
        for (const line of event.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '' || payload === '[DONE]') continue;
          try {
            yield JSON.parse(payload) as Record<string, unknown>;
          } catch {
            // A malformed frame is not worth aborting a long generation over.
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function assertOk(response: Response, providerId: string): Promise<void> {
  if (response.ok) return;
  const body = await response.text().catch(() => '');
  throw new ProviderError(
    `request failed with ${response.status} ${response.statusText}`,
    providerId,
    response.status,
    body.slice(0, 2000),
  );
}
