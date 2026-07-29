import {
  applyOperations,
  createId,
  parseOperations,
  validateDocumentIntegrity,
  type DesignDocument,
  type NodeId,
  type Operation,
  type PluginRegistry,
} from '@opendesign/core';
import { buildDocumentContext } from './context.js';
import { extractOperations } from './extract.js';
import {
  buildComponentCatalog,
  buildRepairPrompt,
  buildReviewPrompt,
  DESIGN_SYSTEM_PROMPT,
  IMPORT_SYSTEM_PROMPT,
} from './prompts.js';
import { formatIssues, reviewDocument, reviewHeadingStructure, type ReviewIssue } from './review.js';
import type { ChatMessage, ChatProvider, ContentPart, TokenUsage } from './provider.js';

/**
 * The design agent.
 *
 * The loop is: build context -> stream a response -> extract operations ->
 * validate against the schema -> dry-run them on a copy of the document ->
 * review the result -> repair what failed. The user's real document is only
 * touched once a batch has survived all of that, which is why an AI edit here
 * can't leave a project in a broken state.
 */

export interface AgentOptions {
  provider: ChatProvider;
  model: string;
  registry?: PluginRegistry;
  /** Attempts to repair schema failures before giving up. */
  maxRepairAttempts?: number;
  /** Run the automated design review and let the model fix what it flags. */
  autoReview?: boolean;
  temperature?: number;
}

export interface AgentRequest {
  prompt: string;
  document: DesignDocument;
  pageId?: string;
  selection?: NodeId[];
  /** Prior turns, so follow-ups like "make it darker" resolve correctly. */
  history?: ChatMessage[];
  /** Reference images for the "rebuild this screenshot" flow. */
  images?: { data: string; mimeType: string }[];
  mode?: 'design' | 'import';
  signal?: AbortSignal;
}

export type AgentEvent =
  | { type: 'status'; status: 'thinking' | 'validating' | 'reviewing' | 'repairing' }
  | { type: 'delta'; text: string }
  | { type: 'message'; text: string }
  | { type: 'operations'; operations: Operation[]; document: DesignDocument }
  | { type: 'review'; issues: ReviewIssue[] }
  | { type: 'error'; message: string; recoverable: boolean }
  | { type: 'done'; usage?: TokenUsage; operations: Operation[]; document: DesignDocument };

/**
 * A convenience pseudo-operation.
 *
 * Asking a model to emit 40 nodes for a pricing table wastes tokens and invites
 * mistakes when the library already has one. `insertBlock` lets it name a block
 * instead; we expand it into a real `insertSubtree` locally.
 */
interface InsertBlockOperation {
  type: 'insertBlock';
  blockId: string;
  parentId: NodeId;
  index?: number;
  props?: Record<string, unknown>;
}

function isInsertBlock(value: unknown): value is InsertBlockOperation {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'insertBlock' &&
    typeof (value as { blockId?: unknown }).blockId === 'string'
  );
}

export class DesignAgent {
  private readonly options: Required<Pick<AgentOptions, 'maxRepairAttempts' | 'autoReview' | 'temperature'>> &
    AgentOptions;

  constructor(options: AgentOptions) {
    this.options = {
      maxRepairAttempts: 2,
      autoReview: true,
      temperature: 0.4,
      ...options,
    };
  }

  /** Streams the full edit cycle. Consumers render events as they arrive. */
  async *run(request: AgentRequest): AsyncGenerator<AgentEvent> {
    const { provider, model, registry } = this.options;

    const catalog = registry ? buildComponentCatalog(registry.getComponents()) : '';
    const system = [
      request.mode === 'import' ? IMPORT_SYSTEM_PROMPT : DESIGN_SYSTEM_PROMPT,
      catalog,
    ]
      .filter(Boolean)
      .join('\n\n');

    const context = buildDocumentContext(request.document, {
      ...(request.pageId ? { pageId: request.pageId } : {}),
      ...(request.selection ? { selection: request.selection } : {}),
    });

    const userContent: ContentPart[] = [
      { type: 'text', text: `CURRENT DOCUMENT\n\n${context.text}` },
      ...(request.images ?? []).map(
        (image): ContentPart => ({ type: 'image', data: image.data, mimeType: image.mimeType }),
      ),
      { type: 'text', text: `REQUEST\n\n${request.prompt}` },
    ];

    const messages: ChatMessage[] = [
      ...(request.history ?? []),
      { role: 'user', content: userContent },
    ];

    let workingDocument = request.document;
    const appliedOperations: Operation[] = [];
    let usage: TokenUsage | undefined;
    let attempt = 0;

    while (attempt <= this.options.maxRepairAttempts) {
      yield { type: 'status', status: attempt === 0 ? 'thinking' : 'repairing' };

      let raw = '';
      for await (const chunk of provider.stream({
        model,
        system,
        messages,
        temperature: this.options.temperature,
        ...(request.signal ? { signal: request.signal } : {}),
      })) {
        if (chunk.delta) {
          raw += chunk.delta;
          yield { type: 'delta', text: chunk.delta };
        }
        if (chunk.usage) usage = chunk.usage;
      }

      const extracted = extractOperations(raw);
      if (extracted.message) yield { type: 'message', text: extracted.message };

      if (!extracted.json) {
        yield {
          type: 'error',
          message: extracted.error ?? 'the model returned no operations',
          recoverable: attempt < this.options.maxRepairAttempts,
        };
        attempt += 1;
        messages.push({ role: 'assistant', content: raw });
        messages.push({
          role: 'user',
          content: buildRepairPrompt([extracted.error ?? 'no JSON block was found']),
        });
        continue;
      }

      yield { type: 'status', status: 'validating' };

      const { operations, errors: expansionErrors } = this.expandBlocks(
        extracted.json,
        workingDocument,
      );

      const parsed = parseOperations(operations);
      const errors = [...expansionErrors, ...parsed.errors];
      const valid = parsed.value ?? [];

      // Dry-run on a copy: a schema-valid op can still be semantically wrong
      // (a missing parent id, a move into its own subtree).
      const accepted: Operation[] = [];
      let candidate = workingDocument;

      for (const operation of valid) {
        try {
          candidate = applyOperations(candidate, [operation]).document;
          accepted.push(operation);
        } catch (error) {
          errors.push(
            `operation ${operation.type} failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      const integrity = validateDocumentIntegrity(candidate);
      if (!integrity.ok) {
        errors.push(...integrity.errors.map((e) => `document integrity: ${e}`));
      } else {
        workingDocument = candidate;
        appliedOperations.push(...accepted);
        if (accepted.length > 0) {
          yield { type: 'operations', operations: accepted, document: workingDocument };
        }
      }

      if (errors.length === 0) break;

      yield {
        type: 'error',
        message: errors.join('\n'),
        recoverable: attempt < this.options.maxRepairAttempts,
      };

      attempt += 1;
      if (attempt > this.options.maxRepairAttempts) break;

      messages.push({ role: 'assistant', content: raw });
      messages.push({ role: 'user', content: buildRepairPrompt(errors) });
    }

    if (this.options.autoReview && appliedOperations.length > 0) {
      yield { type: 'status', status: 'reviewing' };

      const issues = [
        ...reviewDocument(workingDocument),
        ...reviewHeadingStructure(workingDocument),
      ].filter((issue) => issue.severity === 'error');

      if (issues.length > 0) {
        yield { type: 'review', issues };

        const fixed = await this.repairIssues(workingDocument, issues, messages, request.signal);
        if (fixed.operations.length > 0) {
          workingDocument = fixed.document;
          appliedOperations.push(...fixed.operations);
          yield { type: 'operations', operations: fixed.operations, document: workingDocument };
        }
      }
    }

    yield {
      type: 'done',
      ...(usage ? { usage } : {}),
      operations: appliedOperations,
      document: workingDocument,
    };
  }

  /** One-shot convenience wrapper used by non-streaming callers. */
  async edit(request: AgentRequest): Promise<{
    document: DesignDocument;
    operations: Operation[];
    message: string;
    usage?: TokenUsage;
  }> {
    let document = request.document;
    const operations: Operation[] = [];
    let message = '';
    let usage: TokenUsage | undefined;

    for await (const event of this.run(request)) {
      if (event.type === 'message') message = event.text;
      if (event.type === 'done') {
        document = event.document;
        operations.push(...event.operations);
        usage = event.usage;
      }
    }

    return usage ? { document, operations, message, usage } : { document, operations, message };
  }

  /** Turns `insertBlock` pseudo-ops into real `insertSubtree` operations. */
  private expandBlocks(
    input: unknown[],
    document: DesignDocument,
  ): { operations: unknown[]; errors: string[] } {
    const registry = this.options.registry;
    const operations: unknown[] = [];
    const errors: string[] = [];

    for (const candidate of input) {
      if (!isInsertBlock(candidate)) {
        operations.push(candidate);
        continue;
      }

      if (!registry) {
        errors.push('insertBlock was used but no component registry is available');
        continue;
      }

      const component = registry.getComponent(candidate.blockId);
      if (!component) {
        errors.push(
          `unknown block "${candidate.blockId}". Use one of: ${registry
            .getComponents()
            .map((c) => c.id)
            .join(', ')}`,
        );
        continue;
      }

      const built = component.create({
        createId,
        tokens: document.tokens,
        ...(candidate.props ? { props: candidate.props } : {}),
      });

      operations.push({
        type: 'insertSubtree',
        nodes: built.nodes,
        rootId: built.rootId,
        parentId: candidate.parentId,
        index: candidate.index ?? 0,
      });
    }

    return { operations, errors };
  }

  private async repairIssues(
    document: DesignDocument,
    issues: ReviewIssue[],
    messages: ChatMessage[],
    signal?: AbortSignal,
  ): Promise<{ document: DesignDocument; operations: Operation[] }> {
    const { provider, model } = this.options;

    const conversation: ChatMessage[] = [
      ...messages,
      { role: 'user', content: buildReviewPrompt(formatIssues(issues)) },
    ];

    let raw = '';
    try {
      for await (const chunk of provider.stream({
        model,
        system: DESIGN_SYSTEM_PROMPT,
        messages: conversation,
        temperature: 0.2,
        ...(signal ? { signal } : {}),
      })) {
        raw += chunk.delta;
      }
    } catch {
      // A failed review pass must never discard the edit the user already got.
      return { document, operations: [] };
    }

    const extracted = extractOperations(raw);
    if (!extracted.json) return { document, operations: [] };

    const parsed = parseOperations(extracted.json);
    const accepted: Operation[] = [];
    let candidate = document;

    for (const operation of parsed.value ?? []) {
      try {
        candidate = applyOperations(candidate, [operation]).document;
        accepted.push(operation);
      } catch {
        // Skip; the original issue simply stays reported.
      }
    }

    if (!validateDocumentIntegrity(candidate).ok) return { document, operations: [] };
    return { document: candidate, operations: accepted };
  }
}
