'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Blocks } from 'lucide-react';
import type { ComponentContribution, PluginRegistry } from '@opendesign/core';
import type { Editor } from '@opendesign/editor';
import { EmptyState, Panel } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

const PRIMITIVES = [
  { type: 'frame', label: 'Frame' },
  { type: 'stack', label: 'Pilha' },
  { type: 'grid', label: 'Grid' },
  { type: 'text', label: 'Text' },
  { type: 'heading', label: 'Título' },
  { type: 'button', label: 'Botão' },
  { type: 'image', label: 'Imagem' },
  { type: 'input', label: 'Input' },
  { type: 'divider', label: 'Divisor' },
];

/**
 * The block library.
 *
 * Contents come from the plugin registry, not from an import list — so a
 * community component pack appears here the moment it is installed, in the
 * right category, with no change to this file.
 */
export function LibraryPanel({
  editor,
  registry,
}: {
  editor: Editor;
  registry: PluginRegistry | null;
}) {
  const [query, setQuery] = useState('');
  const [components, setComponents] = useState<ComponentContribution[]>([]);

  useEffect(() => {
    if (registry) setComponents(registry.getComponents());
  }, [registry]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return components;
    return components.filter(
      (component) =>
        component.name.toLowerCase().includes(q) ||
        component.category.toLowerCase().includes(q) ||
        component.keywords?.some((keyword) => keyword.toLowerCase().includes(q)),
    );
  }, [components, query]);

  const byCategory = useMemo(() => {
    const map = new Map<string, ComponentContribution[]>();
    for (const component of filtered) {
      const list = map.get(component.category) ?? [];
      list.push(component);
      map.set(component.category, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <Panel title="Biblioteca">
      <div className="px-3 pb-4">
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-faint"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar blocos…"
            className="h-7 w-full rounded-md border border-hairline bg-shell pr-2 pl-7 text-[12px] transition-colors placeholder:text-ink-faint focus:border-brand focus:outline-none"
          />
        </div>

        {!query && (
          <section className="mt-4">
            <h3 className="mb-2 text-[10px] font-medium tracking-[0.12em] text-ink-faint uppercase">
              Primitives
            </h3>
            <div className="grid grid-cols-3 gap-1.5">
              {PRIMITIVES.map((primitive) => (
                <button
                  key={primitive.type}
                  type="button"
                  onClick={() => editor.insertPrimitive(primitive.type)}
                  className="rounded-md border border-hairline bg-shell px-2 py-2 text-[11px] text-ink-muted transition-colors hover:border-brand/40 hover:text-ink"
                >
                  {primitive.label}
                </button>
              ))}
            </div>
          </section>
        )}

        {byCategory.length === 0 ? (
          <EmptyState
            icon={<Blocks size={18} />}
            title="Nenhum bloco corresponde"
            description="Tente outro termo, ou instale um plugin de componentes para ampliar a biblioteca."
          />
        ) : (
          byCategory.map(([category, list]) => (
            <section key={category} className="mt-4">
              <h3 className="mb-2 text-[10px] font-medium tracking-[0.12em] text-ink-faint uppercase">
                {category}
              </h3>
              <ul className="space-y-1">
                {list.map((component) => (
                  <li key={component.id}>
                    <button
                      type="button"
                      onClick={() => editor.insertComponent(component)}
                      title={component.description ?? component.name}
                      className={cn(
                        'w-full rounded-lg border border-hairline bg-shell px-2.5 py-2 text-left',
                        'transition-colors hover:border-brand/40 hover:bg-panel-raised',
                      )}
                    >
                      <span className="block truncate text-[12px] font-medium text-ink">
                        {component.name}
                      </span>
                      {component.description && (
                        <span className="mt-0.5 block truncate text-[11px] text-ink-faint">
                          {component.description}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </Panel>
  );
}
