'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Blocks } from 'lucide-react';
import type { ComponentContribution, PluginRegistry } from '@opendesign/core';
import type { Editor } from '@opendesign/editor';
import { EmptyState, Panel } from '@/components/ui/primitives';
import { BlockListSkeleton, PrimitiveGridSkeleton, Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const PRIMITIVES = [
  { type: 'frame', label: 'Frame' },
  { type: 'stack', label: 'Pilha' },
  { type: 'grid', label: 'Grid' },
  { type: 'text', label: 'Texto' },
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
            aria-label="Buscar blocos"
            className="rounded-chip h-9 w-full border border-hairline bg-shell pr-3 pl-8 text-[16px] transition-colors placeholder:text-ink-faint focus:border-brand focus:outline-none sm:h-7 sm:rounded-md sm:pl-7 sm:text-[12px]"
          />
        </div>

        {/* The registry is loaded asynchronously, and until it resolves this
            panel used to render its "nothing matches" empty state — telling the
            user their library is empty when it had simply not arrived. */}
        {!registry ? (
          <div className="mt-4 space-y-4">
            <Skeleton className="skeleton-line h-2.5 w-20" />
            <PrimitiveGridSkeleton />
            <Skeleton className="skeleton-line h-2.5 w-24" />
            <BlockListSkeleton />
          </div>
        ) : (
          <>
            {!query && (
              <section className="mt-4">
                <h3 className="mb-2 text-[10px] font-medium tracking-[0.12em] text-ink-faint uppercase">
                  Primitivos
                </h3>
                <div className="grid grid-cols-3 gap-1.5">
                  {PRIMITIVES.map((primitive) => (
                    <button
                      key={primitive.type}
                      type="button"
                      onClick={() => editor.insertPrimitive(primitive.type)}
                      className="min-h-9 rounded-md border border-hairline bg-shell px-2 py-2 text-[11px] text-ink-muted transition-colors hover:border-brand/40 hover:text-ink active:bg-panel-raised sm:min-h-0"
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
                            'w-full rounded-lg border border-hairline bg-shell px-2.5 py-2.5 text-left',
                            'transition-colors hover:border-brand/40 hover:bg-panel-raised active:bg-panel-raised',
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
          </>
        )}
      </div>
    </Panel>
  );
}
