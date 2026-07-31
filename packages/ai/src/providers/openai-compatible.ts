import {
  assertOk,
  parseSSE,
  ProviderError,
  type ChatChunk,
  type ChatMessage,
  type ChatProvider,
  type ChatRequest,
  type ModelInfo,
  type ProviderConfig,
} from '../provider.js';

/**
 * One adapter, five providers.
 *
 * OpenAI's chat-completions shape became the de facto standard: DeepSeek,
 * OpenRouter, LM Studio and Ollama all speak it. Rather than copy the same
 * request builder five times, they differ only by base URL, auth header and
 * model list — which is also why community providers are cheap to add.
 */

export interface OpenAICompatibleOptions extends ProviderConfig {
  id: string;
  label: string;
  locality?: 'cloud' | 'local';
  defaultBaseUrl: string;
  models: ModelInfo[];
  /** Extra headers some gateways require (OpenRouter attribution, for example). */
  extraHeaders?: Record<string, string>;
  /** Local runtimes are usually unauthenticated. */
  requiresApiKey?: boolean;
}

function toApiMessages(messages: ChatMessage[], system?: string) {
  const out: Record<string, unknown>[] = [];
  if (system) out.push({ role: 'system', content: system });

  for (const message of messages) {
    if (typeof message.content === 'string') {
      out.push({ role: message.role, content: message.content });
      continue;
    }

    out.push({
      role: message.role,
      content: message.content.map((part) =>
        part.type === 'text'
          ? { type: 'text', text: part.text }
          : {
              type: 'image_url',
              image_url: {
                url: part.data.startsWith('http')
                  ? part.data
                  : `data:${part.mimeType};base64,${part.data}`,
              },
            },
      ),
    });
  }

  return out;
}

export function createOpenAICompatibleProvider(options: OpenAICompatibleOptions): ChatProvider {
  const {
    id,
    label,
    locality = 'cloud',
    defaultBaseUrl,
    models,
    apiKey,
    baseUrl,
    headers,
    extraHeaders,
    requiresApiKey = true,
    fetch: fetchImpl,
  } = options;

  const doFetch = fetchImpl ?? globalThis.fetch;
  const endpoint = `${(baseUrl ?? defaultBaseUrl).replace(/\/$/, '')}/chat/completions`;

  return {
    id,
    label,
    locality,
    models,

    async *stream(request: ChatRequest): AsyncIterable<ChatChunk> {
      if (requiresApiKey && !apiKey) {
        throw new ProviderError('missing API key', id);
      }

      const response = await doFetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          ...extraHeaders,
          ...headers,
        },
        body: JSON.stringify({
          model: request.model,
          messages: toApiMessages(request.messages, request.system),
          temperature: request.temperature ?? 0.4,
          // A page-sized batch of operations does not fit in 8k; a truncated
          // JSON block reads to the agent as "the model returned no operations".
          max_tokens: request.maxTokens ?? 16000,
          stream: true,
          stream_options: { include_usage: true },
          ...(request.responseFormat === 'json'
            ? { response_format: { type: 'json_object' } }
            : {}),
        }),
        ...(request.signal ? { signal: request.signal } : {}),
      });

      await assertOk(response, id);

      for await (const event of parseSSE(response, id)) {
        const choices = event.choices as { delta?: { content?: string } }[] | undefined;
        const delta = choices?.[0]?.delta?.content ?? '';

        const usageRaw = event.usage as
          { prompt_tokens?: number; completion_tokens?: number } | undefined;

        if (usageRaw) {
          yield {
            delta,
            done: false,
            usage: {
              inputTokens: usageRaw.prompt_tokens ?? 0,
              outputTokens: usageRaw.completion_tokens ?? 0,
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

/* -------------------------------------------------------------------------- */
/*                            Concrete providers                              */
/* -------------------------------------------------------------------------- */

export const openaiProvider = (config: ProviderConfig = {}): ChatProvider =>
  createOpenAICompatibleProvider({
    ...config,
    id: 'openai',
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-5', label: 'GPT-5', contextWindow: 400000, vision: true },
      { id: 'gpt-5-mini', label: 'GPT-5 mini', contextWindow: 400000, vision: true },
      { id: 'gpt-4.1', label: 'GPT-4.1', contextWindow: 1000000, vision: true },
      { id: 'gpt-4o', label: 'GPT-4o', contextWindow: 128000, vision: true },
    ],
  });

export const deepseekProvider = (config: ProviderConfig = {}): ChatProvider =>
  createOpenAICompatibleProvider({
    ...config,
    id: 'deepseek',
    label: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat', contextWindow: 128000 },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner', contextWindow: 128000 },
    ],
  });

export const openrouterProvider = (config: ProviderConfig = {}): ChatProvider =>
  createOpenAICompatibleProvider({
    ...config,
    id: 'openrouter',
    label: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    extraHeaders: {
      'HTTP-Referer': 'https://github.com/lenixeduardo/chamb-design',
      'X-Title': 'Charm-Design',
    },
    models: [
      { id: 'anthropic/claude-opus-5', label: 'Claude Opus 5', vision: true },
      { id: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5', vision: true },
      { id: 'openai/gpt-5', label: 'GPT-5', vision: true },
      { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', vision: true },
      { id: 'meta-llama/llama-4-maverick', label: 'Llama 4 Maverick' },
    ],
  });

/**
 * LM Studio serves an OpenAI-compatible API on localhost and does not
 * authenticate, so the key requirement is dropped.
 */
export const lmstudioProvider = (config: ProviderConfig = {}): ChatProvider =>
  createOpenAICompatibleProvider({
    ...config,
    id: 'lmstudio',
    label: 'LM Studio',
    locality: 'local',
    requiresApiKey: false,
    defaultBaseUrl: 'http://localhost:1234/v1',
    models: [{ id: 'local-model', label: 'Currently loaded model' }],
  });

export const ollamaProvider = (config: ProviderConfig = {}): ChatProvider =>
  createOpenAICompatibleProvider({
    ...config,
    id: 'ollama',
    label: 'Ollama',
    locality: 'local',
    requiresApiKey: false,
    defaultBaseUrl: 'http://localhost:11434/v1',
    models: [
      { id: 'llama3.3', label: 'Llama 3.3' },
      { id: 'qwen2.5-coder', label: 'Qwen 2.5 Coder' },
      { id: 'deepseek-r1', label: 'DeepSeek R1' },
      { id: 'llava', label: 'LLaVA (vision)', vision: true },
    ],
  });
