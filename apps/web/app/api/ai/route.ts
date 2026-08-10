import { NextResponse } from 'next/server';
import { DesignAgent, createProvider, listProviders, ProviderError } from '@opendesign/ai';
import { validateDocumentIntegrity, type DesignDocument } from '@opendesign/core';
import { getRegistry } from '@/lib/registry';
import { CredentialError, providerSignal, resolveCredentials } from '@/lib/provider-credentials';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Server-side AI endpoint.
 *
 * A key can come from two places, in this order:
 *
 *   1. The request headers, when the user pasted their own key into Settings.
 *      It lives in their browser, passes through here, and is forwarded to the
 *      provider — never logged, never stored. This is what makes the deployed
 *      app usable by anyone rather than only by whoever set the env vars.
 *   2. A server environment variable, for a deployment that supplies its own.
 *
 * Local providers (Ollama, LM Studio) are intentionally *not* proxied here —
 * the client talks to them directly, because forcing localhost traffic through
 * a server would break the case where the server is somewhere else.
 */

const ENV_KEYS: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

interface AgentRequestBody {
  prompt: string;
  document: DesignDocument;
  providerId: string;
  model: string;
  pageId?: string;
  selection?: string[];
  images?: { data: string; mimeType: string }[];
  mode?: 'design' | 'import';
}

/** Which providers this deployment can actually serve, for the model picker. */
export async function GET() {
  const providers = listProviders().map((provider) => ({
    ...provider,
    configured: provider.locality === 'local' || Boolean(process.env[ENV_KEYS[provider.id] ?? '']),
  }));

  return NextResponse.json({ providers });
}

export async function POST(request: Request) {
  let body: AgentRequestBody;
  try {
    body = (await request.json()) as AgentRequestBody;
  } catch {
    return NextResponse.json({ error: 'corpo JSON inválido' }, { status: 400 });
  }

  if (!body.prompt?.trim()) {
    return NextResponse.json({ error: 'o prompt é obrigatório' }, { status: 400 });
  }

  // The document arrives from a client we do not control. Validate before
  // handing it to the agent rather than discovering a broken tree mid-stream.
  const integrity = validateDocumentIntegrity(body.document);
  if (!integrity.ok) {
    return NextResponse.json(
      { error: 'o documento não passou na validação', details: integrity.errors.slice(0, 10) },
      { status: 422 },
    );
  }

  const envKey = ENV_KEYS[body.providerId];
  const locality =
    listProviders().find((provider) => provider.id === body.providerId)?.locality ?? 'cloud';

  let apiKey: string | undefined;
  let baseUrl: string | undefined;
  try {
    ({ apiKey, baseUrl } = await resolveCredentials({
      headers: request.headers,
      envKey,
      locality,
    }));
  } catch (error) {
    if (error instanceof CredentialError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  if (envKey && !apiKey) {
    return NextResponse.json(
      {
        error: `sem chave de API para ${body.providerId}`,
        hint: 'Adicione sua chave em Ajustes, ou escolha um provedor local que rode na sua máquina.',
      },
      { status: 401 },
    );
  }

  let provider;
  try {
    provider = createProvider(body.providerId, {
      ...(apiKey ? { apiKey } : {}),
      ...(baseUrl ? { baseUrl } : {}),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'provedor desconhecido' },
      { status: 400 },
    );
  }

  const registry = await getRegistry();
  const agent = new DesignAgent({ provider, model: body.model, registry });

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        for await (const event of agent.run({
          prompt: body.prompt,
          document: body.document,
          ...(body.pageId ? { pageId: body.pageId } : {}),
          ...(body.selection ? { selection: body.selection } : {}),
          ...(body.images ? { images: body.images } : {}),
          ...(body.mode ? { mode: body.mode } : {}),
          signal: providerSignal(request),
        })) {
          // The full document is echoed on every operations event; strip it to
          // keep the stream small — the client applies ops to its own copy.
          if (event.type === 'operations' || event.type === 'done') {
            const { document: _document, ...rest } = event;
            send(rest);
          } else {
            send(event);
          }
        }
      } catch (error) {
        // A 429 means the provider's rate limit is exhausted — the one failure
        // the user can act on by simply trying again, so it is the only one
        // surfaced with a plain-language explanation and `recoverable: true`.
        // Everything else keeps the raw provider message for the log.
        if (error instanceof ProviderError && error.status === 429) {
          send({
            type: 'error',
            message:
              'O provedor de IA atingiu o limite de requisições (429). Aguarde alguns segundos e tente de novo.',
            recoverable: true,
          });
        } else {
          send({
            type: 'error',
            message: error instanceof Error ? error.message : String(error),
            recoverable: false,
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
    },
  });
}
