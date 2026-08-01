import { BadRequestException, Body, Controller, Get, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { DesignAgent, createProvider, listProviders } from '@opendesign/ai';
import { validateDocumentIntegrity, type DesignDocument } from '@opendesign/core';
import { RegistryService } from '../common/registry.provider';

const ENV_KEYS: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

interface GenerateBody {
  prompt: string;
  document: DesignDocument;
  providerId: string;
  model: string;
  pageId?: string;
  selection?: string[];
  images?: { data: string; mimeType: string }[];
  mode?: 'design' | 'import';
}

/**
 * Server-side AI endpoint.
 *
 * Exists so API keys stay in server environment variables. Streams NDJSON
 * rather than buffering: a page generation is thousands of tokens, and a user
 * watching sections appear one by one is a fundamentally better experience than
 * a spinner that resolves all at once.
 */
@Controller('ai')
export class AiController {
  constructor(
    private readonly config: ConfigService,
    private readonly registryService: RegistryService,
  ) {}

  @Get('providers')
  providers() {
    return {
      providers: listProviders().map((provider) => ({
        ...provider,
        configured:
          provider.locality === 'local' ||
          Boolean(this.config.get<string>(ENV_KEYS[provider.id] ?? '')),
      })),
    };
  }

  @Post('generate')
  async generate(@Body() body: GenerateBody, @Res() response: Response): Promise<void> {
    if (!body.prompt?.trim()) throw new BadRequestException('prompt is required');

    const integrity = validateDocumentIntegrity(body.document);
    if (!integrity.ok) {
      throw new BadRequestException({
        message: 'document failed validation',
        errors: integrity.errors.slice(0, 10),
      });
    }

    const envKey = ENV_KEYS[body.providerId];
    const apiKey = envKey ? this.config.get<string>(envKey) : undefined;

    if (envKey && !apiKey) {
      throw new BadRequestException(
        `${body.providerId} is not configured on this server — set ${envKey}`,
      );
    }

    // `createProvider` throws a plain Error naming the providers that do
    // exist — genuinely the most useful sentence available here, and it used
    // to be discarded into an anonymous 500.
    let provider;
    try {
      provider = createProvider(body.providerId, apiKey ? { apiKey } : {});
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'unknown provider');
    }

    const agent = new DesignAgent({
      provider,
      model: body.model,
      registry: this.registryService.registry,
    });

    response.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
    response.setHeader('cache-control', 'no-cache, no-transform');
    response.flushHeaders();

    const controller = new AbortController();
    response.on('close', () => controller.abort());

    try {
      for await (const event of agent.run({
        prompt: body.prompt,
        document: body.document,
        ...(body.pageId ? { pageId: body.pageId } : {}),
        ...(body.selection ? { selection: body.selection } : {}),
        ...(body.images ? { images: body.images } : {}),
        ...(body.mode ? { mode: body.mode } : {}),
        signal: controller.signal,
      })) {
        // Documents are echoed on every operations event; the client applies
        // ops to its own copy, so shipping them would multiply the payload.
        const payload =
          event.type === 'operations' || event.type === 'done'
            ? (({ document: _document, ...rest }) => rest)(event)
            : event;

        response.write(`${JSON.stringify(payload)}\n`);
      }
    } catch (error) {
      response.write(
        `${JSON.stringify({
          type: 'error',
          message: error instanceof Error ? error.message : String(error),
          recoverable: false,
        })}\n`,
      );
    } finally {
      response.end();
    }
  }
}
