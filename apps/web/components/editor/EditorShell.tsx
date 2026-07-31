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
  SlidersHorizontal,
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
import { useIsDesktop } from '@/lib/use-media-query';
import { Canvas } from './Canvas';
import { ChatSidebar } from './ChatSidebar';
import { Inspector } from './Inspector';
import { LayersPanel } from './LayersPanel';
import { LibraryPanel } from './LibraryPanel';
import { ThemePanel } from './ThemePanel';
import { AssetsPanel } from './AssetsPanel';
import { ExportDialog } from './ExportDialog';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { CharmDino } from '@/components/brand/CharmDino';
import {
  Button,
  IconButton,
  PanelChromeProvider,
  SegmentedControl,
} from '@/components/ui/primitives';
import { Overlay, OverlayHeader } from '@/components/ui/overlay';
import { cn } from '@/lib/utils';

type LeftTab = 'layers' | 'library' | 'assets' | 'theme';
/** Everything the mobile bottom bar can put in a sheet. */
type MobilePanel = LeftTab | 'inspector';

const PANEL_LABELS: Record<MobilePanel, string> = {
  layers: 'Camadas',
  library: 'Biblioteca',
  assets: 'Recursos',
  theme: 'Tema',
  inspector: 'Design',
};

const LEFT_TABS = [
  ['layers', 'Camadas', Layers],
  ['library', 'Biblioteca', Blocks],
  ['assets', 'Recursos', ImageIcon],
  ['theme', 'Tema', Palette],
] as const;

/**
 * The editor shell.
 *
 * Owns the single `Editor` instance for this project and wires the three things
 * that outlive any individual panel: the keymap, autosave, and the plugin
 * registry. Panels themselves are stateless with respect to the document —
 * they read through hooks and write through editor commands.
 *
 * Two layouts, one instance.
 *
 * The desktop shell docks four surfaces around the canvas, which costs about
 * 930px before the canvas gets a single pixel — on a phone that left the canvas
 * with none, the toolbar overflowing off the right edge, and no way to reach
 * Export. Below `lg` the same panels move into bottom sheets and the canvas
 * gets the whole screen, which is the right trade: on a small screen the canvas
 * *is* the app and everything else is a visit.
 *
 * The layout is a real branch rather than two CSS-hidden trees, because
 * `ChatSidebar` owns a conversation, an in-flight request and an abort
 * controller. Two copies would mean two of each, and the one you could see
 * would not be the one holding your answer.
 */
export function EditorShell({ document }: { document: DesignDocument }) {
  const editor = useMemo(() => new Editor(document), [document]);
  const [registry, setRegistry] = useState<PluginRegistry | null>(null);
  const [leftTab, setLeftTab] = useState<LeftTab>('layers');
  const [exporting, setExporting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Closed until the layout is known. The assistant is docked and open by
  // default on a desktop, but on a phone it is a sheet — and a sheet that opens
  // by itself puts the assistant over the canvas before the user has seen the
  // canvas.
  const [chatOpen, setChatOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel | null>(null);
  const chatDefaulted = useRef(false);

  const isDesktop = useIsDesktop();
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

  // Crossing the breakpoint — a rotation, a tablet leaving split view — has to
  // reconcile the two layouts. A sheet left up on a desktop would stack a modal
  // layers panel on top of the docked one, and the docked assistant reappearing
  // as a sheet on a phone would cover the canvas.
  useEffect(() => {
    if (isDesktop) {
      setMobilePanel(null);
      if (!chatDefaulted.current) {
        chatDefaulted.current = true;
        setChatOpen(true);
      }
    } else {
      setChatOpen(false);
    }
  }, [isDesktop]);

  const panelFor = (panel: MobilePanel) => {
    switch (panel) {
      case 'layers':
        return <LayersPanel editor={editor} />;
      case 'library':
        return <LibraryPanel editor={editor} registry={registry} />;
      case 'assets':
        return <AssetsPanel editor={editor} />;
      case 'theme':
        return <ThemePanel editor={editor} />;
      case 'inspector':
        return <Inspector editor={editor} />;
    }
  };

  const tools = (
    <div className="flex shrink-0 items-center gap-2 rounded-full bg-panel-raised p-1 lg:gap-0.5 lg:p-0.5">
      <IconButton
        label="Ferramenta de seleção (V)"
        active={state.tool === 'select'}
        onClick={() => editor.setTool('select')}
      >
        <MousePointer2 size={14} />
      </IconButton>
      {/* The hand tool exists because a mouse has no other way to pan. A finger
          does — one-finger drag pans the canvas on touch — so on a phone this
          button is a duplicate that costs 44px of a toolbar with none to
          spare. */}
      <IconButton
        label="Ferramenta mão (H)"
        active={state.tool === 'hand'}
        className="hidden lg:inline-flex"
        onClick={() => editor.setTool('hand')}
      >
        <Hand size={14} />
      </IconButton>
      <IconButton label="Inserir frame (F)" onClick={() => editor.insertPrimitive('frame')}>
        <Square size={14} />
      </IconButton>
      <IconButton label="Inserir texto (T)" onClick={() => editor.insertPrimitive('text')}>
        <Type size={14} />
      </IconButton>
    </div>
  );

  const breakpoints = (
    <SegmentedControl<Breakpoint>
      value={state.activeBreakpoint}
      onChange={(breakpoint) => editor.setBreakpoint(breakpoint)}
      options={[
        { label: <Smartphone size={12} />, value: 'base', title: 'Celular — estilos base' },
        { label: <Tablet size={12} />, value: 'md', title: 'Tablet — override md' },
        { label: <Monitor size={12} />, value: 'xl', title: 'Desktop — override xl' },
      ]}
    />
  );

  const undoRedo = (
    <div className="flex shrink-0 items-center gap-2 lg:gap-0.5">
      <IconButton label="Desfazer (⌘Z)" disabled={!history.canUndo} onClick={() => editor.undo()}>
        <Undo2 size={14} />
      </IconButton>
      <IconButton label="Refazer (⌘⇧Z)" disabled={!history.canRedo} onClick={() => editor.redo()}>
        <Redo2 size={14} />
      </IconButton>
    </div>
  );

  return (
    <div className="animate-page-in flex h-dvh flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-hairline bg-panel px-3 lg:h-11 lg:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 lg:flex-none">
          <Link href="/" className="shrink-0" aria-label="Voltar para a área de trabalho">
            <CharmDino role="logo" size={28} />
          </Link>
          <span className="truncate text-[13px] font-medium">{document.name}</span>
        </div>

        {/* The full tool cluster only exists where it fits. On a phone the tools
            move to their own scrollable row below, and the header keeps just the
            two things needed mid-gesture: undo, and the assistant. */}
        <div className="hidden items-center gap-1.5 lg:flex">
          {tools}
          {breakpoints}
          {undoRedo}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="lg:hidden">{undoRedo}</div>
          <IconButton
            label="Ajustes — chaves de API"
            className="hidden lg:inline-flex"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={13} />
          </IconButton>
          <Button size="sm" className="hidden lg:inline-flex" onClick={() => setExporting(true)}>
            <Download size={12} />
            Exportar
          </Button>
          <Button
            size="sm"
            variant={chatOpen ? 'primary' : 'secondary'}
            onClick={() => setChatOpen((open) => !open)}
            aria-expanded={chatOpen}
          >
            <Sparkles size={12} />
            AI
          </Button>
        </div>
      </header>

      {/* Phone toolbar. Scrolls horizontally rather than wrapping: a second row
          appearing when a device is narrow enough would push the canvas down by
          44px on exactly the screens that can least afford it. */}
      <div className="touch-pane flex shrink-0 items-center gap-2 overflow-x-auto border-b border-hairline bg-panel px-3 py-1.5 lg:hidden">
        {tools}
        {breakpoints}
        <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
          <IconButton label="Exportar código" onClick={() => setExporting(true)}>
            <Download size={14} />
          </IconButton>
          <IconButton label="Ajustes — chaves de API" onClick={() => setSettingsOpen(true)}>
            <Settings size={14} />
          </IconButton>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {isDesktop && (
          <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-r border-hairline bg-panel">
            <nav className="flex shrink-0 gap-0.5 border-b border-hairline p-1.5">
              {LEFT_TABS.map(([tab, label, Icon]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setLeftTab(tab)}
                  aria-pressed={leftTab === tab}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1 rounded-full py-1.5 text-[10.5px] transition-colors',
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

            {/* Keyed on the tab so switching plays the entrance rather than
                swapping content in place — the cheapest way to make a tab feel
                like it did something. */}
            <div key={leftTab} className="animate-panel-in min-h-0 flex-1 overflow-hidden">
              {leftTab === 'layers' && <LayersPanel editor={editor} />}
              {leftTab === 'library' && <LibraryPanel editor={editor} registry={registry} />}
              {leftTab === 'assets' && <AssetsPanel editor={editor} />}
              {leftTab === 'theme' && <ThemePanel editor={editor} />}
            </div>
          </aside>
        )}

        <Canvas editor={editor} />

        {isDesktop && (
          <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-l border-hairline bg-panel">
            <Inspector editor={editor} />
          </aside>
        )}

        {isDesktop && chatOpen && (
          <aside className="animate-slide-in-right flex w-80 shrink-0 flex-col overflow-hidden border-l border-hairline bg-panel">
            <ChatSidebar editor={editor} registry={registry} />
          </aside>
        )}
      </div>

      {/* Phone navigation. Five destinations, thumb-height, past the home
          indicator — the panels the desktop shell docks, reachable one tap
          from the canvas. */}
      {!isDesktop && (
        <nav
          aria-label="Painéis do editor"
          className="pb-safe flex shrink-0 items-stretch border-t border-hairline bg-panel"
        >
          {([...LEFT_TABS, ['inspector', 'Design', SlidersHorizontal]] as const).map(
            ([panel, label, Icon]) => (
              <button
                key={panel}
                type="button"
                onClick={() => setMobilePanel(panel as MobilePanel)}
                aria-haspopup="dialog"
                className={cn(
                  'flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[10px] transition-colors',
                  'text-ink-faint active:bg-panel-raised',
                  mobilePanel === panel && 'text-brand-soft',
                )}
              >
                <Icon size={17} />
                {label}
              </button>
            ),
          )}
        </nav>
      )}

      {!isDesktop && mobilePanel && (
        <Overlay
          size="panel"
          label={PANEL_LABELS[mobilePanel]}
          onClose={() => setMobilePanel(null)}
        >
          <OverlayHeader title={PANEL_LABELS[mobilePanel]} />
          <PanelChromeProvider value="sheet">
            <div className="min-h-0 flex-1 overflow-hidden">{panelFor(mobilePanel)}</div>
          </PanelChromeProvider>
        </Overlay>
      )}

      {/* The assistant is a sheet on a phone and a docked column on a desktop,
          but it is the same component either way — closing the sheet does not
          throw away the conversation, it just stops showing it. */}
      {!isDesktop && chatOpen && (
        <Overlay size="md" label="Assistente" onClose={() => setChatOpen(false)}>
          <PanelChromeProvider value="sheet">
            <ChatSidebar editor={editor} registry={registry} onClose={() => setChatOpen(false)} />
          </PanelChromeProvider>
        </Overlay>
      )}

      {exporting && (
        <ExportDialog editor={editor} registry={registry} onClose={() => setExporting(false)} />
      )}

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
