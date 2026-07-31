'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, FileCode, X } from 'lucide-react';
import type { ExporterContribution, GeneratedFile, PluginRegistry } from '@opendesign/core';
import { useDocument, type Editor } from '@opendesign/editor';
import { Badge, Button } from '@/components/ui/primitives';
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

  useEffect(() => {
    if (registry) setExporters(registry.getExporters());
  }, [registry]);

  useEffect(() => {
    if (!registry) return;
    let cancelled = false;

    const run = async () => {
      const exporter = registry.getExporter(targetId);
      if (!exporter) return;

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
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [registry, targetId, document]);

  // The backdrop covers the whole editor, so without this the only way out is
  // finding one small button — which is a trap, not a dialog.
  //
  // The handler is bound once and reads the callback through a ref: `onClose`
  // is an inline arrow at every call site, so keying the effect on it would
  // detach and reattach the listener on each render — and a key pressed while
  // a render is in flight would land in that gap and be swallowed. The export
  // preview re-renders as soon as generation resolves, which is exactly when
  // someone reaches for Escape.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[#121211]/35 p-6 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Exportar"
        className="animate-fade-up flex h-[min(720px,88vh)] w-[min(1100px,94vw)] flex-col overflow-hidden rounded-[28px] border border-hairline bg-panel lift"
      >
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-hairline px-4">
          <div className="flex items-center gap-2">
            <FileCode size={14} className="text-brand-soft" />
            <h2 className="text-[13px] font-medium">Exportar</h2>
            {files.length > 0 && (
              <Badge>
                {files.length} arquivos · {formatBytes(totalBytes)}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={copy} disabled={!active}>
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copiado' : 'Copiar arquivo'}
            </Button>
            <Button size="sm" variant="primary" onClick={download} disabled={files.length === 0}>
              <Download size={12} />
              Baixar
            </Button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar exportação"
              className="grid h-7 w-7 place-items-center rounded-full text-ink-muted hover:bg-panel-raised hover:text-ink"
            >
              <X size={14} />
            </button>
          </div>
        </header>

        <div className="flex shrink-0 gap-1 border-b border-hairline px-4 py-2">
          {exporters.map((exporter) => (
            <button
              key={exporter.id}
              type="button"
              onClick={() => setTargetId(exporter.id)}
              title={exporter.description}
              className={cn(
                'rounded-full px-3 py-1 text-[12px] transition-colors',
                targetId === exporter.id
                  ? 'bg-brand/14 text-brand-soft'
                  : 'text-ink-muted hover:bg-panel-raised hover:text-ink',
              )}
            >
              {exporter.label}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1">
          <nav className="w-64 shrink-0 overflow-y-auto border-r border-hairline py-2">
            {files.map((file) => (
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
            ))}
          </nav>

          <div className="min-w-0 flex-1 overflow-auto bg-shell">
            {error ? (
              <p className="p-4 text-[12px] text-critical">{error}</p>
            ) : (
              <pre className="p-4 font-mono text-[11.5px] leading-relaxed whitespace-pre text-ink-muted">
                {active?.contents ?? ''}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
