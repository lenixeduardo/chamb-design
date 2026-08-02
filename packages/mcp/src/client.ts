/**
 * A small MCP client, streamable-HTTP only.
 *
 * There is an official SDK, and it is the right call for a host that speaks to
 * arbitrary servers over stdio. This client exists because Charm-Design speaks
 * to exactly one remote server from inside a Next.js route: no process
 * spawning, no transport negotiation, no dependency that ships a stdio stack
 * into a serverless bundle. Roughly 200 lines against a stable spec is a
 * better trade than the alternative — and it keeps the browser build clean,
 * because nothing here imports a node builtin.
 */

export const JSONRPC_VERSION = '2.0';
export const MCP_PROTOCOL_VERSION = '2025-06-18';

export type JsonRpcId = number | string;

interface JsonRpcRequest {
  jsonrpc: typeof JSONRPC_VERSION;
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

interface JsonRpcNotification {
  jsonrpc: typeof JSONRPC_VERSION;
  method: string;
  params?: unknown;
}

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: typeof JSONRPC_VERSION;
  id: JsonRpcId;
  result?: unknown;
  error?: JsonRpcError;
}

export interface McpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpContentBlock {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
  [key: string]: unknown;
}

export interface McpToolResult {
  content: McpContentBlock[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface McpServerInfo {
  protocolVersion?: string;
  serverInfo?: { name?: string; version?: string };
  capabilities?: Record<string, unknown>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface McpClientOptions {
  url: string;
  headers?: Record<string, string>;
  /** Injectable for tests and for runtimes with a patched fetch. */
  fetch?: FetchLike;
  clientInfo?: { name: string; version: string };
  /** Per-request timeout. Generation is slow; 60s is the honest default. */
  timeoutMs?: number;
}

export class McpError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = 'McpError';
  }
}

/** True when the server says the tool does not exist, under any of its spellings. */
export function isToolNotFound(error: unknown): boolean {
  if (!(error instanceof McpError)) return false;
  // -32601 is "method not found"; servers also report unknown tools as an
  // ordinary error with a message, which is why the text check is here too.
  return error.code === -32601 || /unknown tool|tool not found|no such tool/i.test(error.message);
}

export class McpClient {
  private readonly url: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: FetchLike;
  private readonly clientInfo: { name: string; version: string };
  private readonly timeoutMs: number;

  private sessionId: string | null = null;
  private nextId = 1;
  private handshake: Promise<McpServerInfo> | null = null;
  private toolsCache: McpTool[] | null = null;

  constructor(options: McpClientOptions) {
    this.url = options.url;
    this.headers = options.headers ?? {};
    const fetchImpl = options.fetch ?? (globalThis.fetch as FetchLike | undefined);
    if (!fetchImpl) throw new McpError('no fetch implementation available');
    this.fetchImpl = fetchImpl;
    this.clientInfo = options.clientInfo ?? { name: 'charm-design', version: '0.1.0' };
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  /** Handshake, run at most once per client. */
  async initialize(): Promise<McpServerInfo> {
    this.handshake ??= (async () => {
      const result = (await this.send('initialize', {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: this.clientInfo,
      })) as McpServerInfo;

      // The spec requires this notification before any other request; a server
      // that never receives it is entitled to reject everything that follows.
      await this.notify('notifications/initialized');
      return result ?? {};
    })();

    return this.handshake;
  }

  async listTools(): Promise<McpTool[]> {
    if (this.toolsCache) return this.toolsCache;
    await this.initialize();
    const result = (await this.send('tools/list', {})) as { tools?: McpTool[] };
    this.toolsCache = result?.tools ?? [];
    return this.toolsCache;
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpToolResult> {
    await this.initialize();
    const result = (await this.send('tools/call', {
      name,
      arguments: args,
    })) as McpToolResult | null;

    const normalized: McpToolResult = {
      content: result?.content ?? [],
      ...(result?.structuredContent ? { structuredContent: result.structuredContent } : {}),
      ...(result?.isError ? { isError: true } : {}),
    };

    // A tool-level failure comes back as a normal result with `isError`, not as
    // a JSON-RPC error. Surfacing it as a thrown McpError keeps both failure
    // shapes on one path for callers.
    if (normalized.isError) {
      throw new McpError(textOf(normalized) || `tool "${name}" failed`);
    }

    return normalized;
  }

  /** Ends the server-side session when there is one. Safe to call always. */
  async close(): Promise<void> {
    if (!this.sessionId) return;
    const sessionId = this.sessionId;
    this.sessionId = null;
    try {
      await this.fetchImpl(this.url, {
        method: 'DELETE',
        headers: { ...this.headers, 'mcp-session-id': sessionId },
      });
    } catch {
      // Best effort: an unclosed session expires on its own.
    }
  }

  private async notify(method: string, params?: unknown): Promise<void> {
    const message: JsonRpcNotification = {
      jsonrpc: JSONRPC_VERSION,
      method,
      ...(params ? { params } : {}),
    };
    await this.post(message);
  }

  private async send(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const message: JsonRpcRequest = {
      jsonrpc: JSONRPC_VERSION,
      id,
      method,
      ...(params ? { params } : {}),
    };
    const response = await this.post(message);
    if (!response) throw new McpError(`no response to "${method}"`);
    if (response.error) {
      throw new McpError(response.error.message, response.error.code, response.error.data);
    }
    return response.result;
  }

  private async post(
    message: JsonRpcRequest | JsonRpcNotification,
  ): Promise<JsonRpcResponse | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // Both, in this order: the spec lets the server answer a single
          // request with either a JSON body or an SSE stream, and 21st.dev
          // uses the stream.
          accept: 'application/json, text/event-stream',
          ...(this.sessionId ? { 'mcp-session-id': this.sessionId } : {}),
          ...this.headers,
        },
        body: JSON.stringify(message),
        signal: controller.signal,
      });
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') {
        throw new McpError(`request timed out after ${this.timeoutMs}ms: ${message.method}`);
      }
      throw new McpError(`request failed: ${(error as Error)?.message ?? String(error)}`);
    } finally {
      clearTimeout(timer);
    }

    const session = response.headers?.get?.('mcp-session-id');
    if (session) this.sessionId = session;

    if (!response.ok) {
      const detail = await safeText(response);
      throw new McpError(
        `HTTP ${response.status} from MCP server${detail ? `: ${truncate(detail, 300)}` : ''}`,
        response.status,
      );
    }

    // 202 with no body is the correct answer to a notification.
    if (response.status === 202 || response.status === 204) return null;

    const contentType = response.headers?.get?.('content-type') ?? '';
    const body = await response.text();
    if (!body.trim()) return null;

    return contentType.includes('text/event-stream')
      ? pickResponse(parseEventStream(body), 'id' in message ? message.id : undefined)
      : (JSON.parse(body) as JsonRpcResponse);
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

/** Every JSON-RPC message carried by an SSE body, in arrival order. */
export function parseEventStream(body: string): JsonRpcResponse[] {
  const messages: JsonRpcResponse[] = [];

  for (const block of body.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n');

    if (!data || data === '[DONE]') continue;
    try {
      messages.push(JSON.parse(data) as JsonRpcResponse);
    } catch {
      // A stream can carry keep-alives and non-JSON comments; skip them.
    }
  }

  return messages;
}

function pickResponse(messages: JsonRpcResponse[], id?: JsonRpcId): JsonRpcResponse | null {
  if (id !== undefined) {
    const match = messages.find((message) => message.id === id);
    if (match) return match;
  }
  // Fall back to the last message carrying a result or an error: some servers
  // renumber ids across a proxy, and dropping a valid answer over that would
  // be the wrong kind of strict.
  return (
    [...messages].reverse().find((message) => 'result' in message || 'error' in message) ?? null
  );
}

/** Concatenated text content of a tool result. */
export function textOf(result: McpToolResult | null | undefined): string {
  return (result?.content ?? [])
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('\n')
    .trim();
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
