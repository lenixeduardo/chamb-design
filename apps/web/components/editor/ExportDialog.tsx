'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Download, FileCode } from 'lucide-react';
import type { ExporterContribution, GeneratedFile, PluginRegistry } from '@opendesign/core';
import { useDocument, type Editor } from '@opendesign/editor';
import { Badge, Button } from '@/components/ui/primitives';
import { Overlay, OverlayHeader } from '@/components/ui/overlay';
import { CodePreviewSkeleton, FileListSkeleton, Skeleton } from '@/components/ui/skeleton';
import { cn, formatBytes } from '@/lib/utils';

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
            files.map((file) => (
              <button
                key={file.path}
                type="button"
                onClick={() => setActivePath(file.path)}
                className={cn(
                  'block w-full truncate px-3 py-1.5 text-left font-mono text-[11px] transition-colors',
                  activePath === file.path
                    ? 'bg-brand/12 text-ink'
                    : 'text-ink-muted hover:bg-panel-raised hover:text-ink',
                )}
                title={file.path}
              >
                {file.path}
              </button>
            ))
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
