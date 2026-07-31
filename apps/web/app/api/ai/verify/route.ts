import { NextResponse } from 'next/server';
import { createProvider } from '@opendesign/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Key check.
 *
 * A pasted key is either right or wrong, and finding out by watching a design
 * generation fail three paragraphs in is a bad first experience. This asks the
 * provider for a couple of tokens and reports what came back, so Settings can
 * say "working" or show the provider's own error before any real work starts.
 */

const ENV_KEYS: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

interface VerifyBody {
  providerId: string;
  model?: string;
}

export async function POST(request: Request) {
  let body: VerifyBody;
  try {
    body = (await request.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'corpo JSON inválido' }, { status: 400 });
  }

  const envKey = ENV_KEYS[body.providerId];
  const apiKey =
    request.headers.get('x-od-api-key')?.trim() || (envKey ? process.env[envKey] : undefined);
  const baseUrl = request.headers.get('x-od-base-url')?.trim();

  if (envKey && !apiKey) {
    return NextResponse.json(
      { ok: false, error: 'nenhuma chave de API para verificar' },
      { status: 400 },
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
      { ok: false, error: error instanceof Error ? error.message : 'provedor desconhecido' },
      { status: 400 },
    );
  }

  const model = body.model || provider.models[0]?.id;
  if (!model) {
    return NextResponse.json(
      { ok: false, error: 'o provedor não expõe nenhum modelo' },
      { status: 400 },
    );
  }

  // Two tokens is enough to prove the credential works; anything more is the
  // user's money spent on a health check.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    for await (const chunk of provider.stream({
      model,
      messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
      maxTokens: 16,
      signal: controller.signal,
    })) {
      if (chunk.done) break;
    }
    return NextResponse.json({ ok: true, model });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: summarize(message) }, { status: 200 });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Provider errors arrive as a wrapped message plus a raw JSON body. The body is
 * where the useful sentence lives ("invalid x-api-key"), so surface that and
 * drop the rest instead of showing the user a wall of vendor JSON.
 */
function summarize(message: string): string {
  const match = /"message"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(message);
  if (match?.[1]) return match[1].replace(/\\"/g, '"');
  return message.length > 240 ? `${message.slice(0, 240)}…` : message;
}
