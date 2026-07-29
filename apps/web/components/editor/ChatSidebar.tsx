'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUp,
  Cloud,
  Cpu,
  ImagePlus,
  Loader2,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import type { PluginRegistry } from '@opendesign/core';
import { useEditorState, type Editor } from '@opendesign/editor';
import { isLocalProvider, runAgent } from '@/lib/agent-client';
import { fileToBase64, imageFilesFrom } from '@/lib/assets';
import { Badge, Button, Select } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

/**
 * The AI conversation.
 *
 * Two things make this different from a chat box bolted onto an editor:
 * operations arrive as a stream and land in the *same* undo stack as manual
 * edits, and the model always sees the current selection — so "make this
 * bigger" resolves to the layer the user is looking at.
 */

interface Attachment {
  id: string;
  name: string;
  previewUrl: string;
  data: string;
  mimeType: string;
}

interface Turn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  attachmentCount?: number;
  status?: string;
  operationCount?: number;
  issues?: { message: string; nodeId: string; severity: string }[];
  error?: string;
}

interface ProviderInfo {
  id: string;
  label: string;
  locality: 'cloud' | 'local';
  configured: boolean;
  models: { id: string; label: string; vision?: boolean }[];
}

const SUGGESTIONS = [
  'Build a landing page for a dental clinic',
  'Turn this page into a SaaS dashboard',
  'Add a pricing section with three tiers',
  'Make the layout feel more premium',
  'Add subtle entrance animations',
];

export function ChatSidebar({
  editor,
  registry,
}: {
  editor: Editor;
  registry: PluginRegistry | null;
}) {
  const state = useEditorState(editor);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providerId, setProviderId] = useState('anthropic');
  const [model, setModel] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/ai')
      .then((response) => response.json())
      .then((data: { providers: ProviderInfo[] }) => {
        setProviders(data.providers);
        // Prefer something that will actually work on this deployment.
        const usable = data.providers.find((p) => p.configured) ?? data.providers[0];
        if (usable) {
          setProviderId(usable.id);
          setModel(usable.models[0]?.id ?? '');
        }
      })
      .catch(() => setProviders([]));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns]);

  const attachImages = useCallback(async (files: File[]) => {
    // Vision models take base64, but the composer needs something to show, so
    // both forms are kept for the lifetime of the attachment.
    const added = await Promise.all(
      files.slice(0, 4).map(async (file) => {
        const { data, mimeType } = await fileToBase64(file);
        return {
          id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name || 'screenshot.png',
          previewUrl: `data:${mimeType};base64,${data}`,
          data,
          mimeType,
        };
      }),
    );
    setAttachments((current) => [...current, ...added].slice(0, 4));
  }, []);

  // Paste is how a screenshot actually reaches a chat. Scoped to the composer
  // so pasting into the assets panel still goes to the asset library.
  useEffect(() => {
    const node = composerRef.current;
    if (!node) return;

    const onPaste = (event: ClipboardEvent) => {
      const files = imageFilesFrom(event.clipboardData);
      if (files.length === 0) return;
      event.preventDefault();
      void attachImages(files);
    };

    node.addEventListener('paste', onPaste);
    return () => node.removeEventListener('paste', onPaste);
  }, [attachImages]);

  const activeProvider = providers.find((p) => p.id === providerId);
  const visionCapable = (activeProvider?.models ?? []).some((model) => model.vision !== false);

  const submit = async (prompt: string) => {
    if (!prompt.trim() || busy) return;

    const pending = attachments;
    const userTurn: Turn = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: prompt,
      ...(pending.length > 0 ? { attachmentCount: pending.length } : {}),
    };
    const assistantTurn: Turn = { id: `a_${Date.now()}`, role: 'assistant', text: '' };

    setTurns((current) => [...current, userTurn, assistantTurn]);
    setInput('');
    setAttachments([]);
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const patch = (update: Partial<Turn>) =>
      setTurns((current) =>
        current.map((turn) => (turn.id === assistantTurn.id ? { ...turn, ...update } : turn)),
      );

    try {
      await runAgent(
        {
          prompt,
          document: editor.getDocument(),
          providerId,
          model,
          pageId: state.activePageId,
          selection: state.selection,
          ...(pending.length > 0
            ? {
                images: pending.map((item) => ({ data: item.data, mimeType: item.mimeType })),
                // Reference images mean the request is a reconstruction, which
                // has its own system prompt.
                mode: 'import' as const,
              }
            : {}),
          ...(registry ? { registry } : {}),
          signal: controller.signal,
        },
        {
          onStatus: (status) => patch({ status }),
          onMessage: (text) => patch({ text }),
          onOperations: (operations) => {
            // Apply through the store so AI edits share the user's undo stack.
            editor.store.transact(operations, { label: 'AI edit', source: 'ai' });
            patch({ operationCount: operations.length });
          },
          onReview: (issues) => patch({ issues }),
          onError: (message) => patch({ error: message }),
          onDone: () => patch({ status: undefined }),
        },
      );
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        patch({ error: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-9 shrink-0 items-center justify-between px-3">
        <h2 className="text-[10px] font-medium tracking-[0.14em] text-ink-faint uppercase">
          Assistant
        </h2>
        {activeProvider && (
          <Badge tone={activeProvider.locality === 'local' ? 'positive' : 'neutral'}>
            {activeProvider.locality === 'local' ? (
              <>
                <Cpu size={9} className="mr-1" />
                on device
              </>
            ) : (
              <>
                <Cloud size={9} className="mr-1" />
                cloud
              </>
            )}
          </Badge>
        )}
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3">
        {turns.length === 0 && (
          <div className="space-y-3 pt-6">
            <div className="flex items-center gap-2 text-ink-muted">
              <Sparkles size={14} className="text-brand-soft" />
              <p className="text-[12px] font-medium">Describe what you want to build</p>
            </div>
            <p className="text-[11px] leading-relaxed text-ink-faint">
              The assistant edits your document through validated operations, so everything it does
              lands in the same undo stack as your own edits.
            </p>
            <ul className="space-y-1.5 pt-1">
              {SUGGESTIONS.map((suggestion) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    onClick={() => submit(suggestion)}
                    className="w-full rounded-lg border border-hairline bg-shell px-2.5 py-2 text-left text-[11.5px] text-ink-muted transition-colors hover:border-brand/40 hover:text-ink"
                  >
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {turns.map((turn) => (
          <article key={turn.id} className="animate-fade-up space-y-1.5">
            {turn.role === 'user' ? (
              <div className="rounded-lg rounded-br-sm bg-brand/14 px-2.5 py-1.5">
                {turn.attachmentCount ? (
                  <p className="mb-1 flex items-center gap-1 text-[10.5px] text-brand-soft">
                    <ImagePlus size={10} />
                    {turn.attachmentCount} reference image
                    {turn.attachmentCount === 1 ? '' : 's'}
                  </p>
                ) : null}
                <p className="text-[12px] leading-relaxed text-ink">{turn.text}</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {turn.status && (
                  <p className="flex items-center gap-1.5 text-[11px] text-ink-faint">
                    <Loader2 size={11} className="animate-spin" />
                    {STATUS_LABELS[turn.status] ?? turn.status}
                  </p>
                )}

                {turn.text && (
                  <p className="text-[12px] leading-relaxed text-ink-muted">{turn.text}</p>
                )}

                {turn.operationCount !== undefined && (
                  <p className="text-[11px] text-positive">
                    Applied {turn.operationCount} operation
                    {turn.operationCount === 1 ? '' : 's'} · ⌘Z to undo
                  </p>
                )}

                {turn.issues && turn.issues.length > 0 && (
                  <div className="rounded-md border border-caution/25 bg-caution/8 px-2 py-1.5">
                    <p className="flex items-center gap-1.5 text-[11px] font-medium text-caution">
                      <AlertTriangle size={10} />
                      Design review found {turn.issues.length} issue
                      {turn.issues.length === 1 ? '' : 's'}
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {turn.issues.slice(0, 4).map((issue, index) => (
                        <li key={index} className="text-[11px] leading-snug text-ink-faint">
                          {issue.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {turn.error && (
                  <p className="rounded-md border border-critical/25 bg-critical/8 px-2 py-1.5 text-[11px] leading-relaxed text-critical">
                    {turn.error}
                  </p>
                )}
              </div>
            )}
          </article>
        ))}
      </div>

      <div className="shrink-0 space-y-2 border-t border-hairline p-3">
        <div className="flex gap-1.5">
          <Select
            value={providerId}
            onChange={(next) => {
              setProviderId(next);
              const provider = providers.find((p) => p.id === next);
              setModel(provider?.models[0]?.id ?? '');
            }}
            options={providers.map((provider) => ({
              label: provider.configured ? provider.label : `${provider.label} (not configured)`,
              value: provider.id,
            }))}
          />
          <Select
            value={model}
            onChange={setModel}
            options={(activeProvider?.models ?? []).map((entry) => ({
              label: entry.label,
              value: entry.id,
            }))}
          />
        </div>

        {activeProvider && !activeProvider.configured && !isLocalProvider(activeProvider.id) && (
          <p className="text-[11px] leading-relaxed text-caution">
            No API key on this server. Set one in the environment, or switch to Ollama / LM Studio
            to run a model on your own machine.
          </p>
        )}

        <div ref={composerRef}>
          {attachments.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-1.5">
              {attachments.map((item) => (
                <li key={item.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.previewUrl}
                    alt={item.name}
                    className="h-12 w-12 rounded-md border border-hairline object-cover"
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${item.name}`}
                    onClick={() =>
                      setAttachments((current) => current.filter((entry) => entry.id !== item.id))
                    }
                    className="absolute -top-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-shell text-ink-muted hover:text-critical"
                  >
                    <X size={9} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit(input);
            }}
            className="relative"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              const files = imageFilesFrom(event.dataTransfer);
              if (files.length === 0) return;
              event.preventDefault();
              void attachImages(files);
            }}
          >
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void submit(input);
                }
              }}
              rows={3}
              placeholder={
                state.selection.length > 0
                  ? `Edit ${state.selection.length} selected layer${state.selection.length === 1 ? '' : 's'}…`
                  : 'Describe a page, a section, or a change…'
              }
              className={cn(
                'w-full resize-none rounded-lg border border-hairline bg-shell py-2 pr-10 pl-2.5',
                'text-[12px] leading-relaxed text-ink placeholder:text-ink-faint',
                'transition-colors focus:border-brand focus:outline-none',
              )}
            />

            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                void attachImages(Array.from(event.target.files ?? []));
                event.target.value = '';
              }}
            />

            <button
              type="button"
              aria-label="Attach a reference image"
              title={
                visionCapable
                  ? 'Attach a reference image — drop or paste works too'
                  : 'This model may not accept images'
              }
              onClick={() => imageInputRef.current?.click()}
              className="absolute bottom-1.5 left-1.5 grid h-7 w-7 place-items-center rounded-md text-ink-faint transition-colors hover:bg-panel-raised hover:text-ink"
            >
              <ImagePlus size={13} />
            </button>

            {busy ? (
              <Button
                size="sm"
                variant="ghost"
                className="absolute right-1.5 bottom-1.5"
                onClick={() => abortRef.current?.abort()}
              >
                <Square size={11} />
                Stop
              </Button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                aria-label="Send"
                className="absolute right-1.5 bottom-1.5 grid h-7 w-7 place-items-center rounded-md bg-brand text-white transition-opacity disabled:opacity-30"
              >
                <ArrowUp size={13} />
              </button>
            )}
          </form>
        </div>

        {attachments.length > 0 && (
          <p className="text-[10.5px] leading-relaxed text-ink-faint">
            Reference images switch the assistant into reconstruction mode.
          </p>
        )}
      </div>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  thinking: 'Designing…',
  validating: 'Validating operations…',
  reviewing: 'Running design review…',
  repairing: 'Fixing rejected operations…',
};
