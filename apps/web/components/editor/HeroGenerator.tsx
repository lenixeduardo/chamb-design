'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { Editor } from '@opendesign/editor';
import { Button } from '@/components/ui/primitives';
import { generateHero } from '@/lib/templates';

/**
 * Generating a hero into an open project.
 *
 * The section arrives through `editor.insertSubtree`, which means it lands at
 * the same insertion point a library block would, inside one undo entry. That
 * is the whole promise of the operations model applied to a third-party
 * generator: an AI section you dislike costs exactly one ⌘Z, same as a block
 * you dragged in by hand.
 */
export function HeroGenerator({ editor }: { editor: Editor }) {
  const [request, setRequest] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  const generate = async () => {
    const prompt = request.trim();
    if (!prompt || busy) return;

    setBusy(true);
    setNote(null);

    try {
      const hero = await generateHero(prompt);
      editor.insertSubtree(hero.nodes, hero.rootId, 'Hero 21st.dev');

      setNote(
        hero.source === '21st.dev'
          ? { tone: 'ok', text: 'Hero gerada pelo 21st.dev e inserida como camadas.' }
          : {
              tone: 'warn',
              text: 'O 21st.dev não pôde ser usado; inserimos a hero padrão da biblioteca.',
            },
      );
      setRequest('');
    } catch (error) {
      setNote({ tone: 'warn', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-4">
      <h3 className="mb-2 text-[10px] font-medium tracking-[0.12em] text-ink-faint uppercase">
        Hero · 21st.dev
      </h3>

      <div className="rounded-lg border border-hairline bg-shell p-2.5">
        <input
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void generate();
          }}
          placeholder="Ex.: SaaS de agendamento para barbearias"
          aria-label="Descreva a hero a gerar"
          className="rounded-chip h-9 w-full border border-hairline bg-panel px-3 text-[16px] text-ink transition-colors placeholder:text-ink-faint focus:border-brand focus:outline-none sm:h-7 sm:text-[12px]"
        />

        <Button
          size="sm"
          className="mt-2 w-full"
          onClick={() => void generate()}
          loading={busy}
          disabled={!request.trim()}
        >
          {!busy && <Sparkles size={12} />}
          Gerar hero
        </Button>

        {note && (
          <p
            className={
              note.tone === 'ok'
                ? 'mt-2 text-[11px] text-positive'
                : 'mt-2 text-[11px] text-caution'
            }
          >
            {note.text}
          </p>
        )}
      </div>
    </section>
  );
}
