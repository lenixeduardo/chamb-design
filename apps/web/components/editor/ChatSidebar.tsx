'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUp,
  Cloud,
  Cpu,
  ImagePlus,
  KeyRound,
  Loader2,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import type { PluginRegistry } from '@opendesign/core';
import { useEditorState, type Editor } from '@opendesign/editor';
import { isLocalProvider, runAgent } from '@/lib/agent-client';
import { fileToBase64, imageFilesFrom } from '@/lib/assets';
import { hasKey, readSettings, setLastModel, subscribeToSettings } from '@/lib/settings';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { CharmDino } from '@/components/brand/CharmDino';
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
  'Criar uma landing page para uma clínica odontológica',
  'Transformar esta página em um dashboard SaaS',
  'Adicionar uma seção de preços com três planos',
  'Deixar o layout com cara de mais premium',
  'Adicionar animações de entrada sutis',
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
  const [served, setServed] = useState<ProviderInfo[]>([]);
  const [providerId, setProviderId] = useState('anthropic');
  const [model, setModel] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Bumped whenever a key is saved or removed, so the "configured" badges
  // reflect Settings without a reload.
  const [credentialVersion, setCredentialVersion] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  // The default is chosen once. After that the selection belongs to the user,
  // including a deliberate pick of a provider they have not added a key for —
  // that is exactly the state where the "add your key" prompt should appear.
  const pickedDefault = useRef(false);

  useEffect(() => subscribeToSettings(() => setCredentialVersion((n) => n + 1)), []);

  useEffect(() => {
    fetch('/api/ai')
      .then((response) => response.json())
      .then((data: { providers: ProviderInfo[] }) => setServed(data.providers ?? []))
      .catch(() => setServed([]));
  }, []);

  // A provider is usable when either this browser has a key for it or the
  // server does. Derived rather than refetched, so saving a key updates the
  // badges without disturbing what the user has selected.
  const providers = useMemo(
    () =>
      served.map((provider) => ({
        ...provider,
        configured: provider.configured || hasKey(provider.id),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keys are read imperatively
    [served, credentialVersion],
  );

  useEffect(() => {
    if (pickedDefault.current || providers.length === 0) return;
    pickedDefault.current = true;

    const remembered = readSettings();
    const previous = remembered.providerId
      ? providers.find((provider) => provider.id === remembered.providerId)
      : undefined;

    // Landing on a local runtime nobody is running turns the first prompt into
    // "Failed to fetch". Prefer something with a key; otherwise start on a
    // cloud provider, where the UI can explain what is missing.
    const usable =
      previous ??
      providers.find((provider) => provider.configured && provider.locality === 'cloud') ??
      // A cloud provider without a key beats a local one we cannot reach:
      // "add your key" is a fixable state, "Failed to fetch" is not.
      providers.find((provider) => provider.locality === 'cloud') ??
      providers[0];

    if (!usable) return;
    setProviderId(usable.id);
    const rememberedModel = usable.models.find((entry) => entry.id === remembered.model);
    setModel(rememberedModel?.id ?? usable.models[0]?.id ?? '');
  }, [providers]);

  useEffect(() => {
    if (providerId && model) setLastModel(providerId, model);
  }, [providerId, model]);

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
  const noProviderReady =
    providers.length > 0 && !providers.some((provider) => provider.configured);

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
            editor.store.transact(operations, { label: 'Edição da IA', source: 'ai' });
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
          Assistente
        </h2>
        <div className="flex items-center gap-1.5">
          {activeProvider && (
            <Badge tone={activeProvider.locality === 'local' ? 'positive' : 'neutral'}>
              {activeProvider.locality === 'local' ? (
                <>
                  <Cpu size={9} className="mr-1" />
                  no dispositivo
                </>
              ) : (
                <>
                  <Cloud size={9} className="mr-1" />
                  nuvem
                </>
              )}
            </Badge>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Chaves de API e ajustes"
            title="Chaves de API e ajustes"
            className="grid h-6 w-6 place-items-center rounded-md text-ink-faint transition-colors hover:bg-panel-raised hover:text-ink"
          >
            <KeyRound size={12} />
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3">
        {turns.length === 0 && (
          <div className="space-y-3 pt-6">
            <div className="flex items-center gap-2 text-ink-muted">
              <CharmDino role="mark" size={22} />
              <p className="text-[12px] font-medium">Descreva o que você quer construir</p>
            </div>
            <p className="text-[11px] leading-relaxed text-ink-faint">
              O assistente edita seu documento por operações validadas, então tudo o que ele faz cai
              na mesma pilha de desfazer das suas próprias edições.
            </p>

            {noProviderReady && (
              <div className="space-y-2 rounded-2xl border border-brand/25 bg-brand/8 px-3 py-2.5">
                <p className="text-[11.5px] leading-relaxed text-ink-muted">
                  Adicione uma chave de API para começar a gerar. Ela fica neste navegador e é
                  enviada só para o provedor que você escolher.
                </p>
                <Button size="sm" variant="primary" onClick={() => setSettingsOpen(true)}>
                  <KeyRound size={11} />
                  Adicionar sua chave de API
                </Button>
              </div>
            )}

            <ul className="space-y-1.5 pt-1">
              {SUGGESTIONS.map((suggestion) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    onClick={() => submit(suggestion)}
                    className="w-full rounded-2xl border border-hairline bg-panel-raised px-3 py-2 text-left text-[11.5px] text-ink-muted transition-colors hover:border-brand/40 hover:text-ink"
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
              <div className="rounded-2xl rounded-br-md bg-brand/10 px-3 py-2">
                {turn.attachmentCount ? (
                  <p className="mb-1 flex items-center gap-1 text-[10.5px] text-brand-soft">
                    <ImagePlus size={10} />
                    {turn.attachmentCount} imagem{turn.attachmentCount === 1 ? '' : 'ns'} de
                    referência
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
                    {turn.operationCount} opera
                    {turn.operationCount === 1 ? 'ção aplicada' : 'ções aplicadas'} · ⌘Z para
                    desfazer
                  </p>
                )}

                {turn.issues && turn.issues.length > 0 && (
                  <div className="rounded-md border border-caution/25 bg-caution/8 px-2 py-1.5">
                    <p className="flex items-center gap-1.5 text-[11px] font-medium text-caution">
                      <AlertTriangle size={10} />A revisão de design encontrou {turn.issues.length}{' '}
                      {turn.issues.length === 1 ? 'problema' : 'problemas'}
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
              label: provider.configured ? provider.label : `${provider.label} (sem chave)`,
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
          <div className="space-y-1.5 rounded-2xl border border-caution/25 bg-caution/8 px-3 py-2.5">
            <p className="text-[11px] leading-relaxed text-caution">
              {activeProvider.label} precisa de uma chave de API. Adicione a sua — ela fica neste
              navegador — ou troque para Ollama / LM Studio e rode um modelo na sua máquina.
            </p>
            <Button size="sm" variant="primary" onClick={() => setSettingsOpen(true)}>
              <KeyRound size={11} />
              Adicionar sua chave de API
            </Button>
          </div>
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
                    aria-label={`Remover ${item.name}`}
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
                  ? `Editar ${state.selection.length} camada${state.selection.length === 1 ? '' : 's'} selecionada${state.selection.length === 1 ? '' : 's'}…`
                  : 'Descreva uma página, uma seção ou uma mudança…'
              }
              className={cn(
                'w-full resize-none rounded-2xl border border-hairline bg-panel-raised py-2.5 pr-10 pl-3',
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
              aria-label="Anexar uma imagem de referência"
              title={
                visionCapable
                  ? 'Anexar uma imagem de referência — arrastar ou colar também funciona'
                  : 'Este modelo pode não aceitar imagens'
              }
              onClick={() => imageInputRef.current?.click()}
              className="absolute bottom-1.5 left-1.5 grid h-7 w-7 place-items-center rounded-full text-ink-faint transition-colors hover:bg-panel-raised hover:text-ink"
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
                Parar
              </Button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                aria-label="Enviar"
                className="absolute right-1.5 bottom-1.5 grid h-7 w-7 place-items-center rounded-full bg-brand text-white transition-opacity disabled:opacity-30"
              >
                <ArrowUp size={13} />
              </button>
            )}
          </form>
        </div>

        {attachments.length > 0 && (
          <p className="text-[10.5px] leading-relaxed text-ink-faint">
            Imagens de referência colocam o assistente em modo de reconstrução.
          </p>
        )}
      </div>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  thinking: 'Desenhando…',
  validating: 'Validando operações…',
  reviewing: 'Rodando a revisão de design…',
  repairing: 'Corrigindo operações rejeitadas…',
};
