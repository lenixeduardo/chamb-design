import { NextResponse } from 'next/server';
import { DesignAgent, createProvider, listProviders } from '@opendesign/ai';
import { validateDocumentIntegrity, type DesignDocument } from '@opendesign/core';
import { getRegistry } from '@/lib/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Server-side AI endpoint.
 *
 * Cloud API keys live in server environment variables and never reach the
 * browser. Local providers (Ollama, LM Studio) are intentionally *not* proxied
 * here — the client talks to them directly, because forcing localhost traffic
 * through a server would break the case where the server is somewhere else.
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
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (!body.prompt?.trim()) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
  }

  // The document arrives from a client we do not control. Validate before
  // handing it to the agent rather than discovering a broken tree mid-stream.
  const integrity = validateDocumentIntegrity(body.document);
  if (!integrity.ok) {
    return NextResponse.json(
      { error: 'document failed validation', details: integrity.errors.slice(0, 10) },
      { status: 422 },
    );
  }

  const envKey = ENV_KEYS[body.providerId];
  const apiKey = envKey ? process.env[envKey] : undefined;

  if (envKey && !apiKey) {
    return NextResponse.json(
      {
        error: `${body.providerId} is not configured on this server`,
        hint: `Set ${envKey}, or pick a local provider that runs on your machine.`,
      },
      { status: 503 },
    );
  }

  let provider;
  try {
    provider = createProvider(body.providerId, apiKey ? { apiKey } : {});
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'unknown provider' },
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
          signal: request.signal,
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
        send({
          type: 'error',
          message: error instanceof Error ? error.message : String(error),
          recoverable: false,
        });
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
