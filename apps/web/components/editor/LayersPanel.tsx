'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Lock,
  Square,
  Type,
  Image as ImageIcon,
  MousePointerClick,
  LayoutGrid,
  Unlock,
} from 'lucide-react';
import type { NodeId, SceneNode } from '@opendesign/core';
import { useActivePage, useDocument, useEditorState, type Editor } from '@opendesign/editor';
import { Panel } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

const ICONS: Record<string, typeof Square> = {
  frame: Square,
  stack: LayoutGrid,
  grid: LayoutGrid,
  text: Type,
  heading: Type,
  image: ImageIcon,
  button: MousePointerClick,
  link: MousePointerClick,
};

/**
 * The layer tree.
 *
 * Collapse state is local to the panel, not the document: which branches a user
 * has open is a per-session view preference and has no business in an undo
 * step or a collaborator's session.
 */
export function LayersPanel({ editor }: { editor: Editor }) {
  const document = useDocument(editor);
  const state = useEditorState(editor);
  const page = useActivePage(editor);
  const [collapsed, setCollapsed] = useState<Set<NodeId>>(new Set());

  if (!page) return null;

  const toggleCollapse = (id: NodeId) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const rows: { node: SceneNode; depth: number }[] = [];

  const visit = (id: NodeId, depth: number) => {
    const node = document.nodes[id];
    if (!node) return;
    rows.push({ node, depth });
    if (collapsed.has(id)) return;
    for (const childId of node.children) visit(childId, depth + 1);
  };

  visit(page.rootId, 0);

  return (
    <Panel title="Camadas">
      <ul className="pb-2">
        {rows.map(({ node, depth }) => {
          const Icon = ICONS[node.type] ?? Square;
          const selected = state.selection.includes(node.id);
          const hasChildren = node.children.length > 0;

          return (
            <li key={node.id}>
              <div
                className={cn(
                  // 36px rows on touch, 28px from `sm` up — the layer tree is
                  // the one list in the editor people scrub through with a
                  // finger, and 28px rows put two targets under one fingertip.
                  'group flex h-9 items-center gap-1 pr-2 text-[12px] transition-colors sm:h-7',
                  selected
                    ? 'bg-brand/14 text-ink'
                    : 'text-ink-muted hover:bg-panel-raised hover:text-ink',
                )}
                style={{ paddingLeft: 6 + depth * 12 }}
                onMouseEnter={() => editor.setHovered(node.id)}
                onMouseLeave={() => editor.setHovered(null)}
              >
                <button
                  type="button"
                  onClick={() => hasChildren && toggleCollapse(node.id)}
                  className={cn(
                    'grid h-7 w-6 shrink-0 place-items-center sm:h-4 sm:w-4',
                    !hasChildren && 'invisible',
                  )}
                  aria-expanded={hasChildren ? !collapsed.has(node.id) : undefined}
                  aria-label={collapsed.has(node.id) ? 'Expandir' : 'Recolher'}
                >
                  {collapsed.has(node.id) ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                </button>

                <Icon size={12} className="shrink-0 opacity-60" />

                <button
                  type="button"
                  onClick={(event) => {
                    if (event.shiftKey) editor.toggleSelection(node.id);
                    else editor.select(node.id);
                  }}
                  onDoubleClick={() => {
                    const name = window.prompt('Renomear camada', node.name);
                    if (name) editor.renameNode(node.id, name);
                  }}
                  className="min-w-0 flex-1 truncate text-left"
                  title={`${node.name} · ${node.type}`}
                >
                  {node.name}
                </button>

                {/* Visibility and lock were hover-only, which on a touch screen
                    meant a layer could be hidden but never shown again.
                    `reveal-on-hover` keeps the quiet desktop behaviour and
                    pins them open wherever there is no hover. */}
                <div className="reveal-on-hover flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => editor.toggleVisibility(node.id)}
                    className="grid h-7 w-7 place-items-center rounded-md hover:bg-hairline sm:h-5 sm:w-5 sm:rounded"
                    aria-pressed={node.hidden}
                    aria-label={node.hidden ? 'Mostrar camada' : 'Ocultar camada'}
                  >
                    {node.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.toggleLock(node.id)}
                    className="grid h-7 w-7 place-items-center rounded-md hover:bg-hairline sm:h-5 sm:w-5 sm:rounded"
                    aria-pressed={node.locked}
                    aria-label={node.locked ? 'Desbloquear camada' : 'Bloquear camada'}
                  >
                    {node.locked ? <Lock size={12} /> : <Unlock size={12} />}
                  </button>
                </div>

                {/* Persistent indicators when the row is not hovered — and never
                    on touch, where the real controls are always on show and
                    these would duplicate them. */}
                {(node.hidden || node.locked) && (
                  <div className="flex shrink-0 items-center gap-1 text-ink-faint group-hover:hidden [@media(hover:none)]:hidden">
                    {node.hidden && <EyeOff size={10} />}
                    {node.locked && <Lock size={10} />}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
