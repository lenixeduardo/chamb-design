'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Blocks,
  Download,
  Hand,
  Layers,
  Monitor,
  MousePointer2,
  Palette,
  ImageIcon,
  Redo2,
  Settings,
  Smartphone,
  Sparkles,
  Square,
  Tablet,
  Type,
  Undo2,
} from 'lucide-react';
import type { Breakpoint, DesignDocument, PluginRegistry } from '@opendesign/core';
import { Editor, attachKeymap, useEditorState, useHistoryState } from '@opendesign/editor';
import { getRegistry } from '@/lib/registry';
import { createAutosave } from '@/lib/projects';
import { Canvas } from './Canvas';
import { ChatSidebar } from './ChatSidebar';
import { Inspector } from './Inspector';
import { LayersPanel } from './LayersPanel';
import { LibraryPanel } from './LibraryPanel';
import { ThemePanel } from './ThemePanel';
import { AssetsPanel } from './AssetsPanel';
import { ExportDialog } from './ExportDialog';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { Button, IconButton, SegmentedControl } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

type LeftTab = 'layers' | 'library' | 'assets' | 'theme';

/**
 * The editor shell.
 *
 * Owns the single `Editor` instance for this project and wires the three things
 * that outlive any individual panel: the keymap, autosave, and the plugin
 * registry. Panels themselves are stateless with respect to the document —
 * they read through hooks and write through editor commands.
 */
export function EditorShell({ document }: { document: DesignDocument }) {
  const editor = useMemo(() => new Editor(document), [document]);
  const [registry, setRegistry] = useState<PluginRegistry | null>(null);
  const [leftTab, setLeftTab] = useState<LeftTab>('layers');
  const [exporting, setExporting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);

  const state = useEditorState(editor);
  const history = useHistoryState(editor);
  const autosaveRef = useRef(createAutosave());

  useEffect(() => {
    void getRegistry().then(setRegistry);
  }, []);

  // `insertBlock` needs the registry, which loads asynchronously. Rebuilding
  // the Editor once it arrives would discard history, so it is injected.
  useEffect(() => {
    if (registry) editor.setRegistry(registry);
  }, [editor, registry]);

  useEffect(() => attachKeymap(editor), [editor]);

  useEffect(() => {
    const autosave = autosaveRef.current;
    const unsubscribe = editor.store.subscribe((event) => {
      if (event.type === 'change') autosave.schedule(event.document);
    });
    return () => {
      unsubscribe();
      autosave.flush();
    };
  }, [editor]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-hairline bg-panel px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand transition-opacity hover:opacity-85"
            aria-label="Back to workspace"
          >
            <Sparkles size={13} className="text-white" />
          </Link>
          <span className="truncate text-[13px] font-medium">{document.name}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-0.5 rounded-lg border border-hairline p-0.5">
            <IconButton
              label="Select tool (V)"
              active={state.tool === 'select'}
              onClick={() => editor.setTool('select')}
            >
              <MousePointer2 size={13} />
            </IconButton>
            <IconButton
              label="Hand tool (H)"
              active={state.tool === 'hand'}
              onClick={() => editor.setTool('hand')}
            >
              <Hand size={13} />
            </IconButton>
            <IconButton label="Insert frame (F)" onClick={() => editor.insertPrimitive('frame')}>
              <Square size={13} />
            </IconButton>
            <IconButton label="Insert text (T)" onClick={() => editor.insertPrimitive('text')}>
              <Type size={13} />
            </IconButton>
          </div>

          <SegmentedControl<Breakpoint>
            value={state.activeBreakpoint}
            onChange={(breakpoint) => editor.setBreakpoint(breakpoint)}
            options={[
              { label: <Smartphone size={12} />, value: 'base', title: 'Mobile — base styles' },
              { label: <Tablet size={12} />, value: 'md', title: 'Tablet — md override' },
              { label: <Monitor size={12} />, value: 'xl', title: 'Desktop — xl override' },
            ]}
          />

          <div className="flex items-center gap-0.5">
            <IconButton label="Undo (⌘Z)" disabled={!history.canUndo} onClick={() => editor.undo()}>
              <Undo2 size={13} />
            </IconButton>
            <IconButton
              label="Redo (⌘⇧Z)"
              disabled={!history.canRedo}
              onClick={() => editor.redo()}
            >
              <Redo2 size={13} />
            </IconButton>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <IconButton label="Settings — API keys" onClick={() => setSettingsOpen(true)}>
            <Settings size={13} />
          </IconButton>
          <Button size="sm" onClick={() => setExporting(true)}>
            <Download size={12} />
            Export
          </Button>
          <Button
            size="sm"
            variant={chatOpen ? 'primary' : 'secondary'}
            onClick={() => setChatOpen((open) => !open)}
          >
            <Sparkles size={12} />
            AI
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-r border-hairline bg-panel">
          <nav className="flex shrink-0 gap-0.5 border-b border-hairline p-1.5">
            {(
              [
                ['layers', 'Layers', Layers],
                ['library', 'Library', Blocks],
                ['assets', 'Assets', ImageIcon],
                ['theme', 'Theme', Palette],
              ] as const
            ).map(([tab, label, Icon]) => (
              <button
                key={tab}
                type="button"
                onClick={() => setLeftTab(tab)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[10.5px] transition-colors',
                  leftTab === tab
                    ? 'bg-panel-raised text-ink'
                    : 'text-ink-faint hover:text-ink-muted',
                )}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-hidden">
            {leftTab === 'layers' && <LayersPanel editor={editor} />}
            {leftTab === 'library' && <LibraryPanel editor={editor} registry={registry} />}
            {leftTab === 'assets' && <AssetsPanel editor={editor} />}
            {leftTab === 'theme' && <ThemePanel editor={editor} />}
          </div>
        </aside>

        <Canvas editor={editor} />

        <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-l border-hairline bg-panel">
          <Inspector editor={editor} />
        </aside>

        {chatOpen && (
          <aside className="flex w-80 shrink-0 flex-col overflow-hidden border-l border-hairline bg-panel">
            <ChatSidebar editor={editor} registry={registry} />
          </aside>
        )}
      </div>

      {exporting && (
        <ExportDialog editor={editor} registry={registry} onClose={() => setExporting(false)} />
      )}

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
