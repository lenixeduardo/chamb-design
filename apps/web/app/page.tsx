'use client';

import { useEffect, useMemo, useState } from 'react';
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
    const document = createProject('Projeto sem título', folder ?? undefined);
    router.push(`/editor/${document.id}`);
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <CharmDino role="logo" size={38} alt="Charm-Design" />
          <div>
            <h1 className="text-[15px] font-semibold tracking-tight">Charm-Design</h1>
            <p className="text-[12px] text-ink-faint">
              O app de design que une velocidade e charme.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="https://github.com/lenixeduardo/chamb-design"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-9 items-center gap-2 rounded-full border border-hairline px-4 text-[13px] text-ink-muted transition-colors hover:border-hairline-strong hover:text-ink"
          >
            <Code2 size={14} />
            Código-fonte
          </a>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-hairline px-4 text-[13px] text-ink-muted transition-colors hover:border-hairline-strong hover:text-ink"
          >
            <Settings size={14} />
            Ajustes
          </button>
          <Button variant="primary" onClick={handleCreate}>
            <Plus size={14} />
            Novo projeto
          </Button>
        </div>
      </header>

      <section className="lift relative mt-10 overflow-hidden rounded-[28px] border border-hairline bg-panel p-8">
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
                line carrying the brand's voice, with the accent on the promise. */}
            <h2 className="display mt-4 max-w-[20ch] text-[40px] leading-[0.95]">
              Descreva uma interface. Ajuste cada pixel.{' '}
              <span className="text-brand italic">Exporte código limpo.</span>
            </h2>
            <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed text-ink-muted">
              Um canvas visual, um design system de verdade e uma camada de IA que edita seu
              documento por operações validadas — então toda alteração da IA é revisável e
              reversível. Traga o Claude, o GPT, o Gemini ou um modelo rodando na sua própria
              máquina.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={handleCreate}>
                Começar um projeto em branco
                <ArrowRight size={14} />
              </Button>
              {ready === false && (
                <Button onClick={() => setSettingsOpen(true)}>
                  <KeyRound size={14} />
                  Adicionar sua chave de API
                </Button>
              )}
            </div>
            {ready === false && (
              <p className="mt-3 max-w-[62ch] text-[12px] leading-relaxed text-ink-faint">
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

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar projetos…"
            className="h-9 w-full rounded-full border border-hairline bg-panel pr-4 pl-9 text-[13px] text-ink transition-colors placeholder:text-ink-faint focus:border-brand focus:outline-none"
          />
        </div>

        {folders.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFolder(null)}
              className={cn(
                'rounded-full border px-3 py-1 text-[12px] transition-colors',
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
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] transition-colors',
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((key) => (
              <div
                key={key}
                className="h-[132px] animate-pulse-soft rounded-2xl border border-hairline bg-panel"
              />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-hairline">
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
            {visible.map((project) => (
              <li
                key={project.id}
                className="group animate-fade-up lift relative rounded-2xl border border-hairline bg-panel transition-colors hover:border-hairline-strong"
              >
                <Link href={`/editor/${project.id}`} className="block p-4">
                  <div className="flex h-16 items-center justify-center rounded-xl border border-hairline bg-panel-raised">
                    <Layers size={18} className="text-ink-faint" />
                  </div>
                  <h3 className="mt-3 truncate text-[13px] font-medium">{project.name}</h3>
                  <p className="mt-1 text-[11px] text-ink-faint">
                    {project.pageCount} página{project.pageCount === 1 ? '' : 's'} ·{' '}
                    {project.nodeCount} camadas · {formatRelativeTime(project.updatedAt)}
                  </p>
                </Link>

                <div className="absolute top-3 right-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
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
