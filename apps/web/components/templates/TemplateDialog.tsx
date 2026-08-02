'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, LayoutTemplate, Sparkles, Wand2 } from 'lucide-react';
import type { TemplateBlueprint } from '@opendesign/templates';
import { Overlay, OverlayHeader } from '@/components/ui/overlay';
import { Badge, Button } from '@/components/ui/primitives';
import {
  TWENTY_FIRST_CREDENTIAL,
  createProjectFromTemplate,
  heroGenerationAvailable,
  listBlueprints,
  suggestForRequest,
} from '@/lib/templates';
import { getCredential, setCredential } from '@/lib/settings';
import { cn } from '@/lib/utils';

/**
 * "Começar por um modelo".
 *
 * One text field decides everything: the request picks the template, and — if
 * the switch is on — briefs 21st.dev for the hero. The picker below is a
 * correction, not a first step; someone who knows they want a SaaS page can
 * click it, and everyone else can just describe the thing.
 */
export function TemplateDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (projectId: string) => void;
}) {
  const blueprints = useMemo(() => listBlueprints(), []);
  const [request, setRequest] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [generateHero, setGenerateHero] = useState(true);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void heroGenerationAvailable().then(setAvailable);
  }, []);

  // The suggestion follows what is typed; an explicit pick outranks it until
  // the user picks again, which is why `chosen` is separate rather than being
  // seeded from the match.
  const suggestions = useMemo(() => suggestForRequest(request, 3), [request]);
  const suggestedId = suggestions[0]?.blueprint.id ?? null;
  const activeId = chosen ?? suggestedId;

  const create = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const result = await createProjectFromTemplate({
        request: request.trim(),
        ...(chosen ? { blueprintId: chosen } : {}),
        generateHero: generateHero && available !== false,
      });
      onCreated(result.document.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  };

  const saveKey = () => {
    const apiKey = keyDraft.trim();
    if (!apiKey) return;
    setCredential(TWENTY_FIRST_CREDENTIAL, { apiKey });
    setKeyDraft('');
    setAvailable(true);
  };

  return (
    <Overlay label="Começar por um modelo" onClose={onClose} size="md">
      <OverlayHeader
        icon={<LayoutTemplate size={14} className="text-brand-soft" />}
        title="Modelos"
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <label className="block text-[12px] text-ink-faint" htmlFor="template-request">
          O que você quer construir?
        </label>
        <textarea
          id="template-request"
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          rows={3}
          placeholder="Ex.: uma landing page para um SaaS de gestão financeira para clínicas"
          className="rounded-control mt-2 w-full resize-none border border-hairline bg-panel-raised px-3.5 py-2.5 text-[16px] text-ink transition-colors placeholder:text-ink-faint focus:border-brand focus:outline-none sm:text-[13px]"
        />

        <div className="mt-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] text-ink-faint">Modelo</span>
            {suggestedId && !chosen && <Badge tone="brand">Sugerido pelo seu texto</Badge>}
          </div>

          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {blueprints.map((blueprint) => (
              <li key={blueprint.id}>
                <TemplateCard
                  blueprint={blueprint}
                  active={blueprint.id === activeId}
                  suggested={blueprint.id === suggestedId}
                  onSelect={() => setChosen(blueprint.id)}
                />
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-surface mt-5 border border-hairline bg-panel-raised p-3.5">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={generateHero}
              onChange={(event) => setGenerateHero(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-[13px] font-medium">
                <Sparkles size={13} className="text-brand-soft" />
                Gerar a hero com o 21st.dev
              </span>
              <span className="mt-1 block text-[12px] leading-relaxed text-ink-faint">
                A seção acima da dobra é gerada pelo catálogo do 21st.dev e convertida em camadas
                editáveis do documento — não em código colado. O resto da página vem do modelo, sem
                rede. Se a geração falhar ou vier fraca, o modelo usa a própria hero.
              </span>
            </span>
          </label>

          {available === false && (
            <div className="mt-3 border-t border-hairline pt-3">
              <p className="text-[12px] text-ink-faint">
                Nenhuma chave do 21st.dev configurada. Cole a sua — ela fica neste navegador e só é
                enviada ao 21st.dev na hora de gerar.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  value={keyDraft}
                  onChange={(event) => setKeyDraft(event.target.value)}
                  placeholder="Chave do 21st.dev"
                  aria-label="Chave do 21st.dev"
                  className="rounded-chip h-9 min-w-[200px] flex-1 border border-hairline bg-panel px-3 text-[16px] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none sm:text-[12px]"
                />
                <Button size="sm" onClick={saveKey} disabled={!keyDraft.trim()}>
                  Salvar
                </Button>
                <a
                  href="https://21st.dev/magic/console"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 text-[12px] text-ink-muted hover:text-ink"
                >
                  Obter chave
                  <ExternalLink size={11} />
                </a>
              </div>
            </div>
          )}
        </div>

        {error && <p className="mt-4 text-[12px] text-critical">{error}</p>}
      </div>

      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-hairline px-4 py-3 sm:px-5">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button variant="primary" onClick={create} loading={busy}>
          {!busy && <Wand2 size={14} />}
          Criar projeto
        </Button>
      </footer>
    </Overlay>
  );
}

function TemplateCard({
  blueprint,
  active,
  suggested,
  onSelect,
}: {
  blueprint: TemplateBlueprint;
  active: boolean;
  suggested: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        'rounded-control w-full border p-3 text-left transition-colors',
        active
          ? 'border-brand/40 bg-brand/8'
          : 'border-hairline bg-panel hover:border-hairline-strong',
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-medium">{blueprint.name}</span>
        {suggested && !active && <Badge>sugerido</Badge>}
      </span>
      <span className="mt-1 block text-[11.5px] leading-relaxed text-ink-faint">
        {blueprint.description}
      </span>
      <span className="mt-2 block text-[10.5px] text-ink-faint">
        {blueprint.sections.length} seções
      </span>
    </button>
  );
}
