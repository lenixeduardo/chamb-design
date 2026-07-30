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
  Sparkles,
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
    const document = createProject('Untitled project', folder ?? undefined);
    router.push(`/editor/${document.id}`);
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand">
            <Sparkles size={17} strokeWidth={2.2} className="text-white" />
          </div>
          <div>
            <h1 className="text-[15px] font-semibold tracking-tight">OpenDesign</h1>
            <p className="text-[12px] text-ink-faint">Design interfaces with AI, in the open.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="https://github.com/opendesign/opendesign"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-hairline px-3 text-[13px] text-ink-muted transition-colors hover:border-hairline-strong hover:text-ink"
          >
            <Code2 size={14} />
            Source
          </a>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-hairline px-3 text-[13px] text-ink-muted transition-colors hover:border-hairline-strong hover:text-ink"
          >
            <Settings size={14} />
            Settings
          </button>
          <Button variant="primary" onClick={handleCreate}>
            <Plus size={14} />
            New project
          </Button>
        </div>
      </header>

      <section className="mt-10 rounded-2xl border border-hairline bg-gradient-to-br from-brand/10 via-transparent to-transparent p-8">
        <Badge tone="brand">MIT licensed · self-hostable</Badge>
        <h2 className="mt-4 max-w-[22ch] text-[30px] leading-[1.1] font-semibold tracking-[-0.03em]">
          Describe an interface. Edit every pixel. Export clean code.
        </h2>
        <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed text-ink-muted">
          A visual canvas, a real design system and a model-agnostic AI layer that edits your
          document through validated operations — so every AI change is reviewable and undoable.
          Bring Claude, GPT, Gemini or a model running on your own machine.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={handleCreate}>
            Start a blank project
            <ArrowRight size={14} />
          </Button>
          {ready === false && (
            <Button onClick={() => setSettingsOpen(true)}>
              <KeyRound size={14} />
              Add your API key
            </Button>
          )}
        </div>
        {ready === false && (
          <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">
            No model is connected yet. Paste your own API key in Settings — it stays in this browser
            — or point the app at Ollama or LM Studio running on your machine.
          </p>
        )}
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
            placeholder="Search projects…"
            className="h-9 w-full rounded-lg border border-hairline bg-panel pr-3 pl-9 text-[13px] text-ink transition-colors placeholder:text-ink-faint focus:border-brand focus:outline-none"
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
              All
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
                className="h-[132px] animate-pulse-soft rounded-xl border border-hairline bg-panel"
              />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-hairline">
            <EmptyState
              icon={<Layers size={22} />}
              title={query ? 'No projects match that search' : 'No projects yet'}
              description={
                query
                  ? 'Try a different name, or clear the search to see everything.'
                  : 'Create a project and describe what you want to build — the AI will lay out the first draft on the canvas.'
              }
              action={
                !query ? (
                  <Button variant="primary" onClick={handleCreate}>
                    <Plus size={14} />
                    New project
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
                className="group animate-fade-up relative rounded-xl border border-hairline bg-panel transition-colors hover:border-hairline-strong"
              >
                <Link href={`/editor/${project.id}`} className="block p-4">
                  <div className="flex h-16 items-center justify-center rounded-lg border border-hairline bg-shell">
                    <Layers size={18} className="text-ink-faint" />
                  </div>
                  <h3 className="mt-3 truncate text-[13px] font-medium">{project.name}</h3>
                  <p className="mt-1 text-[11px] text-ink-faint">
                    {project.pageCount} page{project.pageCount === 1 ? '' : 's'} ·{' '}
                    {project.nodeCount} layers · {formatRelativeTime(project.updatedAt)}
                  </p>
                </Link>

                <div className="absolute top-3 right-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <IconButton
                    label="Duplicate project"
                    onClick={() => {
                      duplicateProject(project.id);
                      refresh();
                    }}
                  >
                    <Copy size={13} />
                  </IconButton>
                  <IconButton
                    label="Delete project"
                    className="hover:text-critical"
                    onClick={() => {
                      if (window.confirm(`Delete “${project.name}”? This cannot be undone.`)) {
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

      <footer className="mt-12 border-t border-hairline pt-5 text-[11px] text-ink-faint">
        Projects and API keys are stored in this browser. Nothing leaves your machine unless you
        connect a cloud model provider or a sync server.
      </footer>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </main>
  );
}
