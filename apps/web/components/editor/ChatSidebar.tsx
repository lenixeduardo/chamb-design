'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowUp, Cpu, Cloud, Loader2, Sparkles, Square } from 'lucide-react';
import type { PluginRegistry } from '@opendesign/core';
import { useEditorState, type Editor } from '@opendesign/editor';
import { isLocalProvider, runAgent } from '@/lib/agent-client';
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

interface Turn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
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
  models: { id: string; label: string }[];
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
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providerId, setProviderId] = useState('anthropic');
  const [model, setModel] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const activeProvider = providers.find((p) => p.id === providerId);

  const submit = async (prompt: string) => {
    if (!prompt.trim() || busy) return;

    const userTurn: Turn = { id: `u_${Date.now()}`, role: 'user', text: prompt };
    const assistantTurn: Turn = { id: `a_${Date.now()}`, role: 'assistant', text: '' };

    setTurns((current) => [...current, userTurn, assistantTurn]);
    setInput('');
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
              <p className="rounded-lg rounded-br-sm bg-brand/14 px-2.5 py-1.5 text-[12px] leading-relaxed text-ink">
                {turn.text}
              </p>
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
              label: provider.configured
                ? provider.label
                : `${provider.label} (not configured)`,
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

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit(input);
          }}
          className="relative"
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
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  thinking: 'Designing…',
  validating: 'Validating operations…',
  reviewing: 'Running design review…',
  repairing: 'Fixing rejected operations…',
};
