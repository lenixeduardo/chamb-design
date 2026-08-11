'use client';

import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import { Check, ExternalLink, LayoutTemplate, Sparkles, Wand2 } from 'lucide-react';
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
  // An empty request must not produce a suggestion: the matcher falls back to
  // the default blueprint when nothing scores, and treating that fallback as a
  // suggestion leaves a "Sugerido pelo seu texto" badge and a pre-selected card
  // on a fresh open — with a key saved the modal opens with nothing typed and
  // the ghost selection reads as broken UI.
  const suggestedId = request.trim() ? (suggestions[0]?.blueprint.id ?? null) : null;
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
          <div className="flex min-h-5 items-center justify-between gap-2">
            <span className="text-[12px] text-ink-faint">Modelo</span>
            {suggestedId && !chosen && <Badge tone="brand">Sugerido pelo seu texto</Badge>}
          </div>

          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {blueprints.map((blueprint, index) => (
              <li
                key={blueprint.id}
                className={cn(blueprint.intent === 'app' && 'sm:col-span-2')}
                style={{ ['--i' as string]: index % 8 }}
              >
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

/** The tallest bar a structure preview draws, in pixels. */
const PREVIEW_MAX_BARS = 8;

/**
 * A tiny wireframe of the page a blueprint would build.
 *
 * Each section of the blueprint becomes a bar; the hero section is the loud
 * one (brand, full height), the nav is the short one at the start, and the
 * rest carry a quiet rhythm. It is the fastest way for someone browsing to
 * see that SaaS is ten sections of marketing and App is a dashboard shell —
 * which is the one real difference between templates.
 */
function StructurePreview({
  blueprint,
  className,
}: {
  blueprint: TemplateBlueprint;
  className?: string;
}) {
  const sections = blueprint.sections.slice(0, PREVIEW_MAX_BARS);
  const rest = blueprint.sections.length - sections.length;

  return (
    <span
      aria-hidden
      className={cn(
        'flex h-7 items-end gap-[3px] overflow-hidden rounded-[6px] bg-panel p-[5px]',
        className,
      )}
    >
      {sections.map((section, index) => {
        const hero = Boolean(section.hero);
        // Nav leads short and quiet; the hero is the only tall, loud bar.
        const height = hero ? 100 : index === 0 ? 42 : 68;
        return (
          <span
            key={index}
            className={cn(
              'min-w-0 flex-1 rounded-full transition-colors duration-200',
              hero
                ? 'bg-brand/70 group-hover:bg-brand'
                : 'bg-hairline-strong/60 group-hover:bg-hairline-strong',
            )}
            style={{ height: `${height}%` }}
          />
        );
      })}
      {rest > 0 && (
        <span className="ml-0.5 shrink-0 text-[9px] font-medium text-ink-faint">+{rest}</span>
      )}
    </span>
  );
}

/**
 * The 16:9 page preview at the top of a card, with the structural bars as a
 * fallback for blueprints that have no rendered thumbnail (or whose image
 * fails to load) — the card must never be left with a blank top.
 */
function TemplatePreview({ blueprint }: { blueprint: TemplateBlueprint }) {
  const [failed, setFailed] = useState(false);

  if (!blueprint.thumbnail || failed) {
    return (
      <span className="rounded-[10px] border border-hairline bg-panel-raised aspect-video flex items-center overflow-hidden p-5">
        <StructurePreview blueprint={blueprint} className="w-full" />
      </span>
    );
  }

  return (
    <span className="rounded-[10px] border border-hairline bg-panel-raised aspect-video block overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed local
          asset shown at its native aspect ratio; next/image adds a loader
          and layout wrapper for no benefit here. */}
      <img
        src={blueprint.thumbnail}
        alt={`Prévia do modelo ${blueprint.name}`}
        width={1672}
        height={941}
        loading="lazy"
        decoding="async"
        onError={(event: SyntheticEvent<HTMLImageElement>) => {
          event.currentTarget.onerror = null;
          setFailed(true);
        }}
        className="block h-full w-full object-cover object-top"
      />
    </span>
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
        'animate-fade-up stagger-item group rounded-control w-full border p-3 text-left transition-all duration-200',
        'hover:-translate-y-px hover:shadow-sm',
        active
          ? 'border-brand/40 bg-brand/8 shadow-[inset_0_0_0_1px_var(--color-brand)]'
          : 'border-hairline bg-panel hover:border-hairline-strong',
      )}
    >
      <TemplatePreview blueprint={blueprint} />
      <span className="mt-2.5 block min-w-0">
        <span className="flex min-w-0 items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[13px] font-medium">{blueprint.name}</span>
          {suggested && !active && <Badge>sugerido</Badge>}
          {active && (
            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-brand text-white">
              <Check size={10} strokeWidth={3} />
            </span>
          )}
        </span>
        <span className="mt-1 block text-[11.5px] leading-relaxed text-ink-faint">
          {blueprint.description}
        </span>
        <span className="mt-2 block text-[10.5px] text-ink-faint">
          {blueprint.sections.length} seções
        </span>
      </span>
    </button>
  );
}
