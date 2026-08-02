import {
  McpClient,
  McpError,
  isToolNotFound,
  textOf,
  type FetchLike,
  type McpTool,
} from './client.js';

/**
 * The 21st.dev MCP server.
 *
 * Endpoint and auth header come from 21st.dev's own setup page; the tool names
 * are versioned there (`generate` today, `21st_magic_component_builder`
 * before), which is why every call goes through a candidate list instead of a
 * hard-coded name. A server that renames a tool should cost this integration a
 * `tools/list` round trip, not an outage.
 */

export const TWENTY_FIRST_MCP_URL = 'https://21st.dev/api/mcp';

/** Env vars 21st.dev's own tooling reads, in the order it reads them. */
export const TWENTY_FIRST_ENV_KEYS = ['TWENTY_FIRST_API_KEY', 'API_KEY_21ST'] as const;

export type TwentyFirstToolKind = 'generate' | 'inspiration' | 'search' | 'logo';

/** New name first, legacy names after. */
const TOOL_CANDIDATES: Record<TwentyFirstToolKind, string[]> = {
  generate: ['generate', '21st_magic_component_builder', '21st_magic_component_refiner'],
  inspiration: ['get_inspiration', '21st_magic_component_inspiration'],
  search: ['search', '21st_magic_component_search'],
  logo: ['search_logo', 'logo_search'],
};

export interface TwentyFirstOptions {
  apiKey: string;
  url?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
}

export interface GenerateComponentInput {
  /** The full user request, in their own words. */
  message: string;
  /** Two to four words the catalog can search on, e.g. `saas hero section`. */
  searchQuery: string;
  /** Extra arguments for a tool variant that asks for more than the two above. */
  extra?: Record<string, unknown>;
}

export interface TwentyFirstResponse {
  /** The tool's text output — usually a fenced code block plus commentary. */
  text: string;
  /** Which tool name actually answered, useful in logs when names drift. */
  tool: string;
}

/** Reads the API key from the environment, without assuming Node is present. */
export function twentyFirstKeyFromEnv(
  env: Record<string, string | undefined> = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env ?? {},
): string | undefined {
  for (const key of TWENTY_FIRST_ENV_KEYS) {
    const value = env[key];
    if (value?.trim()) return value.trim();
  }
  return undefined;
}

export class TwentyFirstClient {
  private readonly client: McpClient;
  private readonly resolved = new Map<TwentyFirstToolKind, string>();

  constructor(options: TwentyFirstOptions) {
    if (!options.apiKey?.trim()) {
      throw new McpError('a 21st.dev API key is required (https://21st.dev/magic/console)');
    }

    this.client = new McpClient({
      url: options.url ?? TWENTY_FIRST_MCP_URL,
      headers: { 'x-api-key': options.apiKey.trim() },
      ...(options.fetch ? { fetch: options.fetch } : {}),
      ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
      clientInfo: { name: 'charm-design', version: '0.1.0' },
    });
  }

  listTools(): Promise<McpTool[]> {
    return this.client.listTools();
  }

  /** A cheap end-to-end check for the settings UI: does the key work at all? */
  async verify(): Promise<{ ok: boolean; tools: string[] }> {
    const tools = await this.listTools();
    return { ok: tools.length > 0, tools: tools.map((tool) => tool.name) };
  }

  async generateComponent(input: GenerateComponentInput): Promise<TwentyFirstResponse> {
    return this.call('generate', {
      message: input.message,
      searchQuery: input.searchQuery,
      ...input.extra,
    });
  }

  async getInspiration(input: GenerateComponentInput): Promise<TwentyFirstResponse> {
    return this.call('inspiration', {
      message: input.message,
      searchQuery: input.searchQuery,
      ...input.extra,
    });
  }

  async search(query: string): Promise<TwentyFirstResponse> {
    return this.call('search', { search_query: query, searchQuery: query, query });
  }

  async searchLogo(query: string, format: 'TSX' | 'SVG' = 'TSX'): Promise<TwentyFirstResponse> {
    return this.call('logo', { queries: [query], format });
  }

  close(): Promise<void> {
    return this.client.close();
  }

  /**
   * Calls the first candidate name the server accepts, and remembers it.
   *
   * `tools/list` decides when the server answers it; when it does not, the
   * candidates are tried in order and only a genuine "unknown tool" moves on
   * to the next — a rate limit or a bad key must surface, not be retried
   * three times under different names.
   */
  private async call(
    kind: TwentyFirstToolKind,
    args: Record<string, unknown>,
  ): Promise<TwentyFirstResponse> {
    const known = this.resolved.get(kind);
    if (known) return { text: textOf(await this.client.callTool(known, args)), tool: known };

    const candidates = await this.candidates(kind);

    let lastError: unknown;
    for (const name of candidates) {
      try {
        const result = await this.client.callTool(name, args);
        this.resolved.set(kind, name);
        return { text: textOf(result), tool: name };
      } catch (error) {
        if (!isToolNotFound(error)) throw error;
        lastError = error;
      }
    }

    throw new McpError(
      `21st.dev exposes no ${kind} tool (tried ${candidates.join(', ')})`,
      undefined,
      lastError,
    );
  }

  private async candidates(kind: TwentyFirstToolKind): Promise<string[]> {
    const preferred = TOOL_CANDIDATES[kind];

    try {
      const available = new Set((await this.listTools()).map((tool) => tool.name));
      const present = preferred.filter((name) => available.has(name));
      if (present.length > 0) return present;
    } catch {
      // Listing is a convenience. If it fails, calling still might not.
    }

    return preferred;
  }
}
