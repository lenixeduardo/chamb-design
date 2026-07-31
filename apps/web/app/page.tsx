'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Copy,
  FolderOpen,
  Code2,
  KeyRound,
  Layers,
  Plus,
  Search,
  Settings,
  Trash2,
} from 'lucide-react';
import {
  createProject,
  deleteProject,
  duplicateProject,
  listFolders,
  searchProjects,
  type ProjectSummary,
} from '@/lib/projects';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { CharmDino } from '@/components/brand/CharmDino';
import { getCredential, hasKey, subscribeToSettings } from '@/lib/settings';
import { Badge, Button, EmptyState, IconButton } from '@/components/ui/primitives';
import { LoadingRegion, ProjectCardSkeleton, Skeleton } from '@/components/ui/skeleton';
import { cn, formatRelativeTime } from '@/lib/utils';

/**
 * The workspace.
 *
 * Projects are read from local storage on the client, so this page renders an
 * empty shell on the server and fills in after hydration. That is the honest
 * trade for local-first: no account required, nothing to sync, and the list is
 * instant once it is there.
 */
export default function WorkspacePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);
  // Creating a project writes to storage and then routes. Both are fast, but
  // "fast" on a cold phone is still long enough to tap twice — and twice means
  // two projects.
  const [creating, setCreating] = useState(false);

  const refresh = () => setProjects(searchProjects(query));

  useEffect(() => {
    setProjects(searchProjects(query));
    setLoaded(true);
  }, [query]);

  // Whether *anything* can generate. Asked here rather than in the editor so
  // the first prompt someone types is not the thing that discovers the app
  // cannot answer it.
  //
  // A local provider reports itself as configured because it needs no key —
  // but nothing proves a runtime is actually listening, so it only counts once
  // the user has pointed at one in Settings. Otherwise a machine with no Ollama
  // installed would look ready and then fail on the first prompt.
  useEffect(() => {
    const check = () =>
      fetch('/api/ai')
        .then((response) => response.json())
        .then((data: { providers?: { id: string; configured: boolean; locality: string }[] }) =>
          setReady(
            (data.providers ?? []).some((provider) =>
              provider.locality === 'local'
                ? Boolean(getCredential(provider.id)?.baseUrl)
                : provider.configured || hasKey(provider.id),
            ),
          ),
        )
        .catch(() => setReady(null));

    void check();
    return subscribeToSettings(() => void check());
  }, []);

  const folders = useMemo(() => (loaded ? listFolders() : []), [loaded, projects]);

  const visible = folder ? projects.filter((project) => project.folder === folder) : projects;

  const handleCreate = () => {
    if (creating) return;
    setCreating(true);
    const document = createProject('Projeto sem título', folder ?? undefined);
    router.push(`/editor/${document.id}`);
  };

  return (
    <main className="animate-page-in mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-6 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          <CharmDino role="logo" size={38} alt="Charm-Design" />
          <div className="min-w-0">
            {/* The wordmark, in script. This is the only place in the product
                that sets the name as a logotype rather than as a label — the
                dino carries the mark everywhere else, and a script face used
                twice stops being a signature. */}
            <h1 className="wordmark text-[22px] text-brand-soft">Charm-Design</h1>
            <p className="truncate text-[12px] text-ink-faint">
              O app de design que une velocidade e charme.
            </p>
          </div>
        </div>

        {/* On a phone the three actions no longer fit on the logo's line, so
            they take their own full-width row with the primary action last —
            closest to the thumb, and never the one that gets squeezed off. */}
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <a
            href="https://github.com/lenixeduardo/chamb-design"
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Código-fonte no GitHub"
            className="inline-flex h-11 items-center gap-2 rounded-control border border-hairline px-4 text-[13px] text-ink-muted transition-colors hover:border-hairline-strong hover:text-ink sm:h-9"
          >
            <Code2 size={14} />
            <span className="hidden sm:inline">Código-fonte</span>
          </a>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex h-11 items-center gap-2 rounded-control border border-hairline px-4 text-[13px] text-ink-muted transition-colors hover:border-hairline-strong hover:text-ink sm:h-9"
          >
            <Settings size={14} />
            Ajustes
          </button>
          <Button
            variant="primary"
            className="ml-auto sm:ml-0"
            loading={creating}
            onClick={handleCreate}
          >
            {!creating && <Plus size={14} />}
            Novo projeto
          </Button>
        </div>
      </header>

      <section className="lift rounded-surface sm:rounded-sheet relative mt-6 overflow-hidden border border-hairline bg-panel p-5 sm:mt-10 sm:p-10">
        {/* Watermark, at the brand's weight: large, rotated, barely there. It
            reads as paper texture rather than as a second mascot. */}
        <CharmDino
          role="watermark"
          size={240}
          className="absolute -right-14 -bottom-16 rotate-12 opacity-[0.035]"
        />

        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <Badge tone="brand">Licença MIT · self-hosted</Badge>
            {/* The one place the display serif earns its keep: a single large
                line carrying the brand's voice, with the accent on the promise.
                At the reference's proportions: a serif set large
                enough to be an image rather than a sentence, with the promise
                carried by an italic of the same face. Two cuts of one family
                doing the work that a second family would otherwise be hired
                for — which is why the optical-size axis matters here and
                nowhere else. */}
            {/* Sized to land on three lines, not to hit the reference's 64px.
                The reference carries a six-word headline; this one is a
                sentence and a promise, and at 60px it took four lines and
                pushed the project list off a laptop screen — a workspace that
                opens on nothing but its own hero. */}
            <h2 className="display mt-5 max-w-[18ch] text-[31px] sm:text-[38px] lg:text-[46px]">
              Descreva uma interface. Ajuste cada pixel.{' '}
              <span className="text-brand italic">Exporte código limpo.</span>
            </h2>
            <p className="mt-5 max-w-[52ch] text-[16px] leading-[1.5] text-ink-muted sm:text-[19px]">
              Um canvas visual, um design system de verdade e uma camada de IA que edita seu
              documento por operações validadas — então toda alteração da IA é revisável e
              reversível. Traga o Claude, o GPT, o Gemini ou um modelo rodando na sua própria
              máquina.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-2.5">
              {/* Full-width on a phone, hugging on a desktop — the reference's
                  rule, and the right one: a stacked pair of centred CTAs is the
                  only arrangement that survives a 360px screen without one of
                  them looking like an afterthought. */}
              <Button
                variant="primary"
                size="lg"
                className="w-full sm:w-auto"
                loading={creating}
                onClick={handleCreate}
              >
                Começar um projeto em branco
                {!creating && <ArrowRight size={16} />}
              </Button>

              {/* The provider check is a network round trip, so the slot it will
                  occupy is held open. Without this the hero's buttons reflow
                  under the user's thumb a beat after the page settles — the
                  cheapest way to make someone tap the wrong thing. */}
              {ready === null ? (
                <Skeleton className="rounded-control h-13 w-full sm:h-12 sm:w-[248px]" />
              ) : ready === false ? (
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full animate-fade-up sm:w-auto"
                  onClick={() => setSettingsOpen(true)}
                >
                  <KeyRound size={16} />
                  Adicionar sua chave de API
                </Button>
              ) : null}
            </div>
            {ready === false && (
              <p className="mt-4 max-w-[56ch] animate-fade-up text-[13px] leading-relaxed text-ink-faint">
                Nenhum modelo conectado ainda. Cole sua própria chave de API em Ajustes — ela fica
                neste navegador — ou aponte o app para o Ollama ou o LM Studio na sua máquina.
              </p>
            )}
          </div>

          {/* The hero character. One per screen, and only where there is room —
              hidden below md rather than shrunk into a sticker. */}
          <CharmDino role="float" size={132} className="hidden shrink-0 md:block" />
        </div>
      </section>

      <div className="mt-8 flex flex-wrap items-center gap-3 sm:mt-10">
        <div className="relative w-full min-w-[220px] sm:w-auto sm:flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-faint"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar projetos…"
            aria-label="Buscar projetos"
            className="rounded-control h-11 w-full border border-hairline bg-panel pr-4 pl-10 text-[16px] text-ink transition-colors placeholder:text-ink-faint focus:border-brand focus:outline-none sm:h-9 sm:pl-9 sm:text-[13px]"
          />
        </div>

        {folders.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFolder(null)}
              aria-pressed={folder === null}
              className={cn(
                'inline-flex h-9 items-center rounded-full border px-3.5 text-[12px] transition-colors sm:h-7 sm:px-3',
                folder === null
                  ? 'border-brand/30 bg-brand/12 text-brand-soft'
                  : 'border-hairline text-ink-muted hover:text-ink',
              )}
            >
              Todos
            </button>
            {folders.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setFolder(name)}
                aria-pressed={folder === name}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[12px] transition-colors sm:h-7 sm:px-3',
                  folder === name
                    ? 'border-brand/30 bg-brand/12 text-brand-soft'
                    : 'border-hairline text-ink-muted hover:text-ink',
                )}
              >
                <FolderOpen size={12} />
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      <section className="mt-5 flex-1">
        {!loaded ? (
          <LoadingRegion
            label="Carregando seus projetos"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {[0, 1, 2, 3, 4, 5].map((key) => (
              <ProjectCardSkeleton key={key} index={key} />
            ))}
          </LoadingRegion>
        ) : visible.length === 0 ? (
          <div className="rounded-surface border border-dashed border-hairline">
            <EmptyState
              // An empty workspace is the brand's best moment for the mascot:
              // nothing to compete with, and the dino says "start" better than
              // a stack-of-layers glyph does.
              icon={query ? <Layers size={22} /> : <CharmDino role="mark" size={52} />}
              title={query ? 'Nenhum projeto corresponde à busca' : 'Nenhum projeto ainda'}
              description={
                query
                  ? 'Tente outro nome, ou limpe a busca para ver tudo.'
                  : 'Crie um projeto e descreva o que você quer construir — a IA monta o primeiro rascunho no canvas.'
              }
              action={
                !query ? (
                  <Button variant="primary" onClick={handleCreate}>
                    <Plus size={14} />
                    Novo projeto
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((project, index) => (
              <li
                key={project.id}
                // Only the first screenful is staggered. Past that the delay
                // stops being a rhythm and becomes a wait, so later cards land
                // with the ninth.
                className="group animate-fade-up stagger-item lift rounded-surface relative border border-hairline bg-panel transition-[border-color,transform] duration-200 hover:border-hairline-strong active:scale-[0.99]"
                style={{ '--i': Math.min(index, 8) } as CSSProperties}
              >
                <Link href={`/editor/${project.id}`} className="block p-4">
                  <div className="rounded-control flex h-16 items-center justify-center border border-hairline bg-panel-raised">
                    <Layers size={18} className="text-ink-faint" />
                  </div>
                  {/* The action buttons sit top-right and are always visible on
                      touch, so the title is padded clear of them rather than
                      running under two 36px targets. */}
                  <h3 className="mt-3 truncate pr-2 text-[13px] font-medium">{project.name}</h3>
                  <p className="mt-1 text-[11px] text-ink-faint">
                    {project.pageCount} página{project.pageCount === 1 ? '' : 's'} ·{' '}
                    {project.nodeCount} camadas · {formatRelativeTime(project.updatedAt)}
                  </p>
                </Link>

                <div className="reveal-on-hover rounded-chip absolute top-2.5 right-2.5 flex gap-2 bg-panel/85 backdrop-blur-sm">
                  <IconButton
                    label="Duplicar projeto"
                    onClick={() => {
                      duplicateProject(project.id);
                      refresh();
                    }}
                  >
                    <Copy size={13} />
                  </IconButton>
                  <IconButton
                    label="Excluir projeto"
                    className="hover:text-critical"
                    onClick={() => {
                      if (
                        window.confirm(`Excluir “${project.name}”? Isso não pode ser desfeito.`)
                      ) {
                        deleteProject(project.id);
                        refresh();
                      }
                    }}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-12 flex items-start gap-2 border-t border-hairline pt-5 text-[11px] text-ink-faint">
        <CharmDino role="mark" size={16} className="mt-px shrink-0 opacity-70" />
        <span>
          Projetos e chaves de API ficam neste navegador. Nada sai da sua máquina a não ser que você
          conecte um provedor de modelo na nuvem ou um servidor de sincronização.
        </span>
      </footer>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </main>
  );
}
