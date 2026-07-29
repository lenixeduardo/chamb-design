'use client';

import { DesignAgent, createProvider, type AgentEvent } from '@opendesign/ai';
import type { DesignDocument, Operation, PluginRegistry } from '@opendesign/core';

/**
 * Client-side agent transport.
 *
 * Two routes, chosen by where the model runs:
 *
 *   - **cloud** goes through `/api/ai`, so API keys stay in server env vars and
 *     never touch the browser.
 *   - **local** (Ollama, LM Studio) runs the agent *in the browser* against
 *     `localhost`. Proxying that through the server would break the moment the
 *     server is not the user's own machine — and the whole point of a local
 *     model is that the data never leaves the desk.
 */

export type StreamEvent = Exclude<AgentEvent, { type: 'operations' } | { type: 'done' }> &
  Record<string, unknown>;

export interface AgentStreamHandlers {
  onDelta?: (text: string) => void;
  onMessage?: (text: string) => void;
  onStatus?: (status: string) => void;
  onOperations?: (operations: Operation[]) => void;
  onReview?: (issues: { message: string; nodeId: string; severity: string }[]) => void;
  onError?: (message: string) => void;
  onDone?: (usage?: { inputTokens: number; outputTokens: number }) => void;
}

export interface RunAgentOptions {
  prompt: string;
  document: DesignDocument;
  providerId: string;
  model: string;
  pageId?: string;
  selection?: string[];
  images?: { data: string; mimeType: string }[];
  registry?: PluginRegistry;
  baseUrl?: string;
  signal?: AbortSignal;
}

const LOCAL_PROVIDERS = new Set(['ollama', 'lmstudio']);

export function isLocalProvider(providerId: string): boolean {
  return LOCAL_PROVIDERS.has(providerId);
}

export async function runAgent(
  options: RunAgentOptions,
  handlers: AgentStreamHandlers,
): Promise<void> {
  if (isLocalProvider(options.providerId)) {
    await runLocally(options, handlers);
    return;
  }
  await runRemotely(options, handlers);
}

async function runLocally(options: RunAgentOptions, handlers: AgentStreamHandlers): Promise<void> {
  const provider = createProvider(
    options.providerId,
    options.baseUrl ? { baseUrl: options.baseUrl } : {},
  );

  const agent = new DesignAgent({
    provider,
    model: options.model,
    ...(options.registry ? { registry: options.registry } : {}),
  });

  for await (const event of agent.run({
    prompt: options.prompt,
    document: options.document,
    ...(options.pageId ? { pageId: options.pageId } : {}),
    ...(options.selection ? { selection: options.selection } : {}),
    ...(options.images ? { images: options.images } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  })) {
    dispatch(event, handlers);
  }
}

async function runRemotely(options: RunAgentOptions, handlers: AgentStreamHandlers): Promise<void> {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      prompt: options.prompt,
      document: options.document,
      providerId: options.providerId,
      model: options.model,
      pageId: options.pageId,
      selection: options.selection,
      images: options.images,
    }),
    ...(options.signal ? { signal: options.signal } : {}),
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as
      | { error?: string; hint?: string }
      | null;
    handlers.onError?.(
      [detail?.error ?? `request failed with ${response.status}`, detail?.hint]
        .filter(Boolean)
        .join(' — '),
    );
    return;
  }

  if (!response.body) {
    handlers.onError?.('the server returned an empty stream');
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    // The last fragment may be a partial line; keep it for the next chunk.
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        dispatch(JSON.parse(line) as AgentEvent, handlers);
      } catch {
        // A malformed frame should not kill an otherwise good generation.
      }
    }
  }

  if (buffer.trim()) {
    try {
      dispatch(JSON.parse(buffer) as AgentEvent, handlers);
    } catch {
      /* ignore a truncated tail */
    }
  }
}

function dispatch(event: AgentEvent, handlers: AgentStreamHandlers): void {
  switch (event.type) {
    case 'delta':
      handlers.onDelta?.(event.text);
      break;
    case 'message':
      handlers.onMessage?.(event.text);
      break;
    case 'status':
      handlers.onStatus?.(event.status);
      break;
    case 'operations':
      handlers.onOperations?.(event.operations);
      break;
    case 'review':
      handlers.onReview?.(
        event.issues.map((issue) => ({
          message: issue.message,
          nodeId: issue.nodeId,
          severity: issue.severity,
        })),
      );
      break;
    case 'error':
      handlers.onError?.(event.message);
      break;
    case 'done':
      handlers.onDone?.(event.usage);
      break;
  }
}
