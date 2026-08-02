import { describe, expect, it, vi } from 'vitest';
import { McpClient, McpError, parseEventStream, textOf } from '../client.js';
import { TwentyFirstClient, twentyFirstKeyFromEnv } from '../twenty-first.js';

/** Minimal server double: answers by method, records every request. */
function server(
  handlers: Record<string, (params: unknown, id: number | string) => unknown>,
  options: { sse?: boolean; sessionId?: string } = {},
) {
  const calls: { method: string; params: unknown; headers: Record<string, string> }[] = [];

  const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
    const message = JSON.parse(String(init?.body)) as {
      method: string;
      params?: unknown;
      id?: number;
    };
    calls.push({
      method: message.method,
      params: message.params,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });

    if (message.id === undefined) {
      return new Response(null, { status: 202 });
    }

    const handler = handlers[message.method];
    const body = handler
      ? { jsonrpc: '2.0', id: message.id, result: handler(message.params, message.id) }
      : {
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32601, message: `unknown method ${message.method}` },
        };

    const headers: Record<string, string> = {
      'content-type': options.sse ? 'text/event-stream' : 'application/json',
      ...(options.sessionId ? { 'mcp-session-id': options.sessionId } : {}),
    };

    const payload = options.sse
      ? `event: message\ndata: ${JSON.stringify(body)}\n\n`
      : JSON.stringify(body);

    return new Response(payload, { status: 200, headers });
  });

  return { fetchImpl, calls };
}

const TOOLS = {
  'tools/list': () => ({ tools: [{ name: 'generate' }, { name: 'search' }] }),
  initialize: () => ({ protocolVersion: '2025-06-18', serverInfo: { name: 'fake', version: '1' } }),
};

describe('McpClient', () => {
  it('handshakes once and notifies initialized before anything else', async () => {
    const { fetchImpl, calls } = server(TOOLS);
    const client = new McpClient({ url: 'https://example.test/mcp', fetch: fetchImpl });

    await client.listTools();
    await client.listTools();

    expect(calls.map((call) => call.method)).toEqual([
      'initialize',
      'notifications/initialized',
      'tools/list',
    ]);
  });

  it('reads a response out of an SSE body', async () => {
    const { fetchImpl } = server(TOOLS, { sse: true });
    const client = new McpClient({ url: 'https://example.test/mcp', fetch: fetchImpl });

    expect((await client.listTools()).map((tool) => tool.name)).toEqual(['generate', 'search']);
  });

  it('carries the session id the server hands back', async () => {
    const { fetchImpl, calls } = server(TOOLS, { sessionId: 'sess-1' });
    const client = new McpClient({ url: 'https://example.test/mcp', fetch: fetchImpl });

    await client.listTools();
    expect(calls[calls.length - 1]?.headers['mcp-session-id']).toBe('sess-1');
  });

  it('sends custom headers on every request', async () => {
    const { fetchImpl, calls } = server(TOOLS);
    const client = new McpClient({
      url: 'https://example.test/mcp',
      fetch: fetchImpl,
      headers: { 'x-api-key': 'secret' },
    });

    await client.listTools();
    expect(calls.every((call) => call.headers['x-api-key'] === 'secret')).toBe(true);
  });

  it('turns a JSON-RPC error into an McpError', async () => {
    const { fetchImpl } = server(TOOLS);
    const client = new McpClient({ url: 'https://example.test/mcp', fetch: fetchImpl });

    await expect(client.callTool('nope')).rejects.toThrow(McpError);
  });

  /** A tool failure is a result with `isError`, not a transport error. */
  it('throws on a tool-level error result', async () => {
    const { fetchImpl } = server({
      ...TOOLS,
      'tools/call': () => ({
        content: [{ type: 'text', text: 'rate limit reached' }],
        isError: true,
      }),
    });
    const client = new McpClient({ url: 'https://example.test/mcp', fetch: fetchImpl });

    await expect(client.callTool('generate')).rejects.toThrow(/rate limit reached/);
  });

  it('reports an HTTP failure with its status', async () => {
    const fetchImpl = vi.fn(async () => new Response('forbidden', { status: 403 }));
    const client = new McpClient({ url: 'https://example.test/mcp', fetch: fetchImpl });

    await expect(client.listTools()).rejects.toThrow(/HTTP 403/);
  });

  it('gives up on a request that never answers', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );

    const client = new McpClient({
      url: 'https://example.test/mcp',
      fetch: fetchImpl,
      timeoutMs: 10,
    });
    await expect(client.listTools()).rejects.toThrow(/timed out/);
  });
});

describe('parseEventStream', () => {
  it('reads every data frame and skips the noise', () => {
    const body = [
      ': keep-alive',
      '',
      'event: message',
      'data: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}',
      '',
      'data: [DONE]',
      '',
    ].join('\n');

    expect(parseEventStream(body)).toEqual([{ jsonrpc: '2.0', id: 1, result: { ok: true } }]);
  });

  it('joins a payload split across data lines', () => {
    const body = 'data: {"jsonrpc":"2.0","id":1,\ndata: "result":{"ok":true}}\n\n';
    expect(parseEventStream(body)[0]).toEqual({ jsonrpc: '2.0', id: 1, result: { ok: true } });
  });
});

describe('textOf', () => {
  it('joins text blocks and ignores the rest', () => {
    expect(
      textOf({
        content: [
          { type: 'text', text: 'one' },
          { type: 'image', data: '...' },
          { type: 'text', text: 'two' },
        ],
      }),
    ).toBe('one\ntwo');
  });
});

describe('TwentyFirstClient', () => {
  it('refuses to be constructed without a key', () => {
    expect(() => new TwentyFirstClient({ apiKey: '  ' })).toThrow(/API key/);
  });

  it('authenticates with x-api-key', async () => {
    const { fetchImpl, calls } = server({
      ...TOOLS,
      'tools/call': () => ({ content: [{ type: 'text', text: '```tsx\n<section />\n```' }] }),
    });

    const client = new TwentyFirstClient({ apiKey: 'k-1', fetch: fetchImpl });
    const response = await client.generateComponent({
      message: 'hero',
      searchQuery: 'hero section',
    });

    expect(response.tool).toBe('generate');
    expect(response.text).toContain('<section />');
    expect(calls.every((call) => call.headers['x-api-key'] === 'k-1')).toBe(true);
  });

  /**
   * 21st.dev renamed its tools once already. Falling back to the legacy name
   * is what keeps an older self-hosted server working.
   */
  it('falls back to the legacy tool name', async () => {
    const seen: string[] = [];
    const { fetchImpl } = server({
      initialize: TOOLS.initialize,
      // The server lists nothing useful, so the candidate list is tried in order.
      'tools/list': () => ({ tools: [] }),
      'tools/call': (params) => {
        const name = (params as { name: string }).name;
        seen.push(name);
        if (name !== '21st_magic_component_builder') {
          throw new Error('unreachable');
        }
        return { content: [{ type: 'text', text: 'legacy answer' }] };
      },
    });

    // `server` cannot throw JSON-RPC errors from a handler, so unknown tools
    // are reported the way a real server does: an error object.
    const guarded = vi.fn(async (url: string, init?: RequestInit) => {
      const message = JSON.parse(String(init?.body)) as {
        method: string;
        params?: { name?: string };
        id?: number;
      };
      if (message.method === 'tools/call' && message.params?.name === 'generate') {
        seen.push('generate');
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32602, message: 'Unknown tool: generate' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return fetchImpl(url, init);
    });

    const client = new TwentyFirstClient({ apiKey: 'k-1', fetch: guarded });
    const response = await client.generateComponent({
      message: 'hero',
      searchQuery: 'hero section',
    });

    expect(seen).toEqual(['generate', '21st_magic_component_builder']);
    expect(response.tool).toBe('21st_magic_component_builder');
  });

  it('prefers a tool the server actually lists', async () => {
    const { fetchImpl, calls } = server({
      ...TOOLS,
      'tools/list': () => ({ tools: [{ name: '21st_magic_component_builder' }] }),
      'tools/call': () => ({ content: [{ type: 'text', text: 'ok' }] }),
    });

    const client = new TwentyFirstClient({ apiKey: 'k-1', fetch: fetchImpl });
    await client.generateComponent({ message: 'hero', searchQuery: 'hero section' });

    const call = calls.find((entry) => entry.method === 'tools/call');
    expect((call?.params as { name: string }).name).toBe('21st_magic_component_builder');
  });

  it('does not retry other names on a real failure', async () => {
    const attempts: string[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const message = JSON.parse(String(init?.body)) as {
        method: string;
        params?: { name?: string };
        id?: number;
      };
      if (message.method === 'initialize') {
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {} }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (message.id === undefined) return new Response(null, { status: 202 });
      if (message.method === 'tools/list') {
        return new Response(
          JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools: [] } }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }

      attempts.push(message.params?.name ?? '');
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32000, message: 'quota exceeded' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const client = new TwentyFirstClient({ apiKey: 'k-1', fetch: fetchImpl });
    await expect(
      client.generateComponent({ message: 'hero', searchQuery: 'hero' }),
    ).rejects.toThrow(/quota exceeded/);
    expect(attempts).toEqual(['generate']);
  });
});

describe('twentyFirstKeyFromEnv', () => {
  it('reads the documented variables in order', () => {
    expect(twentyFirstKeyFromEnv({ TWENTY_FIRST_API_KEY: 'a', API_KEY_21ST: 'b' })).toBe('a');
    expect(twentyFirstKeyFromEnv({ API_KEY_21ST: 'b' })).toBe('b');
    expect(twentyFirstKeyFromEnv({ TWENTY_FIRST_API_KEY: '   ' })).toBeUndefined();
    expect(twentyFirstKeyFromEnv({})).toBeUndefined();
  });
});
