'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import type { DesignDocument } from '@opendesign/core';
import { loadProject } from '@/lib/projects';
import { EditorShell } from '@/components/editor/EditorShell';
import { Button, EmptyState } from '@/components/ui/primitives';
import { EditorSkeleton } from '@/components/ui/skeleton';
import { CharmDino } from '@/components/brand/CharmDino';

/**
 * Project route.
 *
 * Documents live in browser storage, so loading happens after hydration. The
 * three states are explicit rather than implied by a spinner that never ends —
 * loading, missing, and ready.
 */
export default function EditorPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const [document, setDocument] = useState<DesignDocument | null>(null);
  const [status, setStatus] = useState<'loading' | 'missing' | 'ready'>('loading');

  useEffect(() => {
    const loaded = loadProject(projectId);
    if (loaded) {
      setDocument(loaded);
      setStatus('ready');
    } else {
      setStatus('missing');
    }
  }, [projectId]);

  // The editor's chrome, not a centred line of text. Reading a document out of
  // storage is quick, but the jump from a blank screen to a full three-panel
  // editor still reads as a page reload; assembling the same shape the editor
  // is about to occupy reads as opening.
  if (status === 'loading') return <EditorSkeleton />;

  if (status === 'missing' || !document) {
    return (
      <div className="animate-page-in grid h-dvh place-items-center p-6">
        <EmptyState
          icon={<CharmDino role="mark" size={48} className="opacity-80" />}
          title="Projeto não encontrado"
          description="Pode ter sido excluído, ou criado em outro navegador. Os projetos ficam guardados localmente na máquina que os criou."
          action={
            <Link href="/">
              <Button variant="primary">Voltar para a área de trabalho</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return <EditorShell document={document} />;
}
