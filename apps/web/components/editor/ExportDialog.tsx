'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  File,
  FileCode,
  FileImage,
  FileJson,
  FileText,
  Folder,
  Paintbrush,
} from 'lucide-react';
import type { ExporterContribution, GeneratedFile, PluginRegistry } from '@opendesign/core';
import { useDocument, type Editor } from '@opendesign/editor';
import { Badge, Button } from '@/components/ui/primitives';
import { Overlay, OverlayHeader } from '@/components/ui/overlay';
import { CodePreviewSkeleton, FileListSkeleton, Skeleton } from '@/components/ui/skeleton';
import { cn, formatBytes } from '@/lib/utils';

interface FileTreeNode {
  name: string;
  path: string;
  file?: GeneratedFile;
  children: FileTreeNode[];
}

/** Groups flat generated paths ("app/page.tsx") into a folder/file tree. */
function buildFileTree(files: GeneratedFile[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  for (const file of files) {
    const segments = file.path.split('/').filter(Boolean);
    let level = root;

    segments.forEach((segment, index) => {
      const isLeaf = index === segments.length - 1;
      let node = level.find((entry) => entry.name === segment && Boolean(entry.file) === isLeaf);
      if (!node) {
        node = {
          name: segment,
          path: segments.slice(0, index + 1).join('/'),
          children: [],
          file: isLeaf ? file : undefined,
        };
        level.push(node);
      }
      level = node.children;
    });
  }

  const sort = (nodes: FileTreeNode[]) => {
    nodes.sort((a, b) => {
      if (Boolean(a.file) !== Boolean(b.file)) return a.file ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((node) => sort(node.children));
  };
  sort(root);

  return root;
}

/** Icon that matches a file's extension, so the tree reads like a real file system. */
function FileTypeIcon({ path, size = 12 }: { path: string; size?: number }) {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  const className = 'shrink-0 text-ink-faint';

  switch (extension) {
    case 'html':
    case 'htm':
    case 'js':
    case 'mjs':
    case 'cjs':
    case 'jsx':
    case 'ts':
    case 'tsx':
    case 'vue':
    case 'svelte':
      return <FileCode size={size} className={className} />;
    case 'json':
      return <FileJson size={size} className={className} />;
    case 'css':
    case 'scss':
    case 'less':
      return <Paintbrush size={size} className={className} />;
    case 'md':
    case 'mdx':
    case 'txt':
      return <FileText size={size} className={className} />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
    case 'ico':
      return <FileImage size={size} className={className} />;
    default:
      return <File size={size} className={className} />;
  }
}

function FileTree({
  nodes,
  depth,
  activePath,
  onSelect,
}: {
  nodes: FileTreeNode[];
  depth: number;
  activePath: string | null;
  onSelect: (path: string) => void;
}) {
  return (
    <>
      {nodes.map((node) =>
        node.file ? (
          <button
            key={node.path}
            type="button"
            onClick={() => onSelect(node.file!.path)}
            style={{ paddingLeft: `${12 + depth * 14}px` }}
            className={cn(
              'flex w-full items-center gap-1.5 truncate py-1.5 pr-3 text-left font-mono text-[11px] transition-colors',
              activePath === node.file.path
                ? 'bg-brand/12 text-ink'
                : 'text-ink-muted hover:bg-panel-raised hover:text-ink',
            )}
            title={node.file.path}
          >
            <FileTypeIcon path={node.name} />
            <span className="truncate">{node.name}</span>
          </button>
        ) : (
          <div key={node.path}>
            <div
              style={{ paddingLeft: `${12 + depth * 14}px` }}
              className="flex items-center gap-1.5 py-1.5 pr-3 font-mono text-[11px] text-ink-faint"
            >
              <Folder size={12} className="shrink-0" />
              <span className="truncate">{node.name}</span>
            </div>
            <FileTree nodes={node.children} depth={depth + 1} activePath={activePath} onSelect={onSelect} />
          </div>
        ),
      )}
    </>
  );
}

/**
 * Export preview.
 *
 * Showing the generated files before download is not a nicety — "clean code" is
 * a claim, and the only way to make it checkable is to put the output in front
 * of the person who has to maintain it.
 */
export function ExportDialog({
  editor,
  registry,
  onClose,
}: {
  editor: Editor;
  registry: PluginRegistry | null;
  onClose: () => void;
}) {
  const document = useDocument(editor);
  const [exporters, setExporters] = useState<ExporterContribution[]>([]);
  const [targetId, setTargetId] = useState('react');
  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Generation is a real wait on a large document, and it re-runs on every
  // target switch. Without this the dialog showed an empty file list and an
  // empty code pane — indistinguishable from an exporter that produced nothing.
  const [generating, setGenerating] = useState(true);

  useEffect(() => {
    if (registry) setExporters(registry.getExporters());
  }, [registry]);

  useEffect(() => {
    if (!registry) return;
    let cancelled = false;

    const run = async () => {
      const exporter = registry.getExporter(targetId);
      if (!exporter) return;

      setGenerating(true);
      try {
        const generated = await exporter.generate(document);
        if (cancelled) return;
        setFiles(generated);
        setActivePath(generated[0]?.path ?? null);
        setError(null);
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : String(caught));
        setFiles([]);
      } finally {
        if (!cancelled) setGenerating(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [registry, targetId, document]);

  const active = files.find((file) => file.path === activePath);
  const totalBytes = files.reduce((sum, file) => sum + file.contents.length, 0);
  const tree = useMemo(() => buildFileTree(files), [files]);

  const download = () => {
    // A tar/zip would need a dependency; concatenating with clear delimiters
    // keeps the export dependency-free and is trivially splittable.
    const bundle = files
      .map((file) => `// ===== ${file.path} =====\n${file.contents}`)
      .join('\n\n');

    const blob = new Blob([bundle], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = `${document.name.replace(/\s+/g, '-').toLowerCase()}-${targetId}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    if (!active) return;
    await navigator.clipboard.writeText(active.contents);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Overlay size="lg" label="Exportar" onClose={onClose}>
      <OverlayHeader
        icon={<FileCode size={14} className="shrink-0 text-brand-soft" />}
        title="Exportar"
        actions={
          <>
            {/* The counts belong to the header on a desktop and to the toolbar
                row on a phone, where the title bar has no room for them. */}
            {files.length > 0 && (
              <span className="hidden sm:inline">
                <Badge>
                  {files.length} arquivos · {formatBytes(totalBytes)}
                </Badge>
              </span>
            )}
            <Button size="sm" onClick={copy} disabled={!active}>
              {copied ? <Check size={12} /> : <Copy size={12} />}
              <span className="hidden sm:inline">{copied ? 'Copiado' : 'Copiar arquivo'}</span>
            </Button>
            <Button size="sm" variant="primary" onClick={download} disabled={files.length === 0}>
              <Download size={12} />
              Baixar
            </Button>
          </>
        }
      />

      <div className="touch-pane flex shrink-0 items-center gap-1 overflow-x-auto border-b border-hairline px-3 py-2 sm:px-4">
        {exporters.length === 0
          ? [0, 1, 2].map((key) => <Skeleton key={key} className="rounded-chip h-8 w-20" />)
          : exporters.map((exporter) => (
              <button
                key={exporter.id}
                type="button"
                onClick={() => setTargetId(exporter.id)}
                title={exporter.description}
                aria-pressed={targetId === exporter.id}
                className={cn(
                  'h-8 shrink-0 rounded-chip px-3.5 text-[12px] transition-colors sm:h-7 sm:px-3',
                  targetId === exporter.id
                    ? 'bg-brand/14 text-brand-soft'
                    : 'text-ink-muted hover:bg-panel-raised hover:text-ink',
                )}
              >
                {exporter.label}
              </button>
            ))}
      </div>

      {/* A 256px file column plus a code pane does not fit on a phone, so below
          `sm` the file list becomes a native select — one tap, a full-height
          list of paths, and the code keeps the whole screen. */}
      <div className="shrink-0 border-b border-hairline px-3 py-2 sm:hidden">
        <label className="flex items-center gap-2">
          <span className="sr-only">Arquivo gerado</span>
          <select
            value={activePath ?? ''}
            onChange={(event) => setActivePath(event.target.value)}
            disabled={files.length === 0}
            className="rounded-chip h-9 w-full min-w-0 border border-hairline bg-panel-raised px-3 font-mono text-[12px] text-ink focus:border-brand focus:outline-none disabled:opacity-50"
          >
            {files.length === 0 ? (
              <option value="">{generating ? 'Gerando…' : 'Nenhum arquivo'}</option>
            ) : (
              files.map((file) => (
                <option key={file.path} value={file.path}>
                  {file.path}
                </option>
              ))
            )}
          </select>
          {files.length > 0 && (
            <span className="shrink-0 text-[11px] whitespace-nowrap text-ink-faint">
              {files.length} · {formatBytes(totalBytes)}
            </span>
          )}
        </label>
      </div>

      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Arquivos gerados"
          className="touch-pane hidden w-64 shrink-0 overflow-y-auto border-r border-hairline py-2 sm:block"
        >
          {generating && files.length === 0 ? (
            <FileListSkeleton />
          ) : (
            <FileTree nodes={tree} depth={0} activePath={activePath} onSelect={setActivePath} />
          )}
        </nav>

        <div className="touch-pane min-w-0 flex-1 overflow-auto bg-shell">
          {error ? (
            <p className="animate-fade-up p-4 text-[12px] leading-relaxed text-critical">{error}</p>
          ) : generating && !active ? (
            <CodePreviewSkeleton />
          ) : (
            <pre className="animate-fade-in p-4 font-mono text-[11.5px] leading-relaxed whitespace-pre text-ink-muted">
              {active?.contents ?? ''}
            </pre>
          )}
        </div>
      </div>
    </Overlay>
  );
}
