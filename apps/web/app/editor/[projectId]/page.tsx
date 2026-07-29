'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import type { DesignDocument } from '@opendesign/core';
import { loadProject } from '@/lib/projects';
import { EditorShell } from '@/components/editor/EditorShell';
import { Button, EmptyState } from '@/components/ui/primitives';

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

  if (status === 'loading') {
    return (
      <div className="grid h-screen place-items-center">
        <p className="animate-pulse-soft text-[13px] text-ink-faint">Opening project…</p>
      </div>
    );
  }

  if (status === 'missing' || !document) {
    return (
      <div className="grid h-screen place-items-center">
        <EmptyState
          title="Project not found"
          description="It may have been deleted, or created in a different browser. Projects are stored locally on the machine that made them."
          action={
            <Link href="/">
              <Button variant="primary">Back to workspace</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return <EditorShell document={document} />;
}
