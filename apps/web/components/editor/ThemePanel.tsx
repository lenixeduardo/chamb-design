'use client';

import { useMemo, useState } from 'react';
import { Palette } from 'lucide-react';
import { flattenTokens } from '@opendesign/design-system';
import { useDocument, type Editor } from '@opendesign/editor';
import { Field, Panel, SegmentedControl, TextInput } from '@/components/ui/primitives';

/**
 * The design system editor.
 *
 * Editing a token here rewrites every node that references it — that is the
 * payoff of storing `{color.accent}` in the document instead of `#6366f1`.
 * The change goes through the operation system, so it is one undo step.
 */
export function ThemePanel({ editor }: { editor: Editor }) {
  const document = useDocument(editor);
  const [namespace, setNamespace] = useState<'color' | 'spacing' | 'radius' | 'size'>('color');

  const tokens = useMemo(
    () => flattenTokens(document.tokens).filter((token) => token.namespace === namespace),
    [document.tokens, namespace],
  );

  const setToken = (path: string, value: string) => {
    editor.store.transact([{ type: 'setToken', path, value }], {
      label: `Set ${path}`,
      mergeKey: `token:${path}`,
    });
  };

  return (
    <Panel title="Design system">
      <div className="space-y-4 px-3 pb-6">
        <SegmentedControl
          value={namespace}
          onChange={setNamespace}
          options={[
            { label: 'Cor', value: 'color' as const },
            { label: 'Espaço', value: 'spacing' as const },
            { label: 'Raio', value: 'radius' as const },
            { label: 'Type', value: 'size' as const },
          ]}
        />

        <section className="space-y-2">
          <h3 className="text-[10px] font-medium tracking-[0.12em] text-ink-faint uppercase">
            Theme
          </h3>
          <div className="flex gap-1.5">
            {document.themes.map((theme) => (
              <button
                key={theme.id}
                type="button"
                onClick={() =>
                  editor.store.transact(
                    [{ type: 'setThemes', themes: document.themes, activeThemeId: theme.id }],
                    { label: `Switch to ${theme.name}` },
                  )
                }
                className={`flex-1 rounded-md border px-2 py-1.5 text-[11px] transition-colors ${
                  document.activeThemeId === theme.id
                    ? 'border-brand/40 bg-brand/12 text-brand-soft'
                    : 'border-hairline text-ink-muted hover:text-ink'
                }`}
              >
                {theme.name}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-[10px] font-medium tracking-[0.12em] text-ink-faint uppercase">
            <Palette size={10} />
            Tokens
          </h3>

          <div className="space-y-1.5">
            {tokens.map((token) => (
              <Field key={token.path} label={token.path.split('.').slice(1).join('.')}>
                <div className="flex items-center gap-1.5">
                  {namespace === 'color' && String(token.value).startsWith('#') && (
                    <input
                      type="color"
                      value={String(token.value)}
                      onChange={(event) => setToken(token.path, event.target.value)}
                      aria-label={`Cor de ${token.path}`}
                      className="h-6 w-6 shrink-0 cursor-pointer rounded border border-hairline bg-transparent p-0"
                    />
                  )}
                  <TextInput
                    value={String(token.value)}
                    onChange={(event) => setToken(token.path, event.target.value)}
                  />
                </div>
              </Field>
            ))}
          </div>
        </section>

        <p className="text-[11px] leading-relaxed text-ink-faint">
          Tokens become CSS custom properties and a Tailwind <code>@theme</code> block on export —
          so retheming an exported project is still a one-file change.
        </p>
      </div>
    </Panel>
  );
}
