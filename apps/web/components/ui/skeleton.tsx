import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/**
 * Loading placeholders.
 *
 * The rule this file follows: a skeleton is a *tracing* of the thing that is
 * coming, not a generic grey box. It gets the same height, the same radius and
 * the same grid as the real content, so the layout does not jump when the data
 * lands. Where that is not possible — a code preview whose line lengths are
 * unknowable — the placeholder varies line width deterministically rather than
 * randomly, because a skeleton that reshuffles on every render is a distraction
 * in a component whose entire job is to be calm.
 *
 * Every skeleton here is `aria-hidden` and sits inside a container that is
 * announced as busy. Screen readers get one "loading" message, not forty empty
 * boxes.
 */

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden className={cn('skeleton rounded-lg', className)} style={style} />;
}

/**
 * A run of text lines.
 *
 * The last line is short — that is what makes a block of lines read as a
 * paragraph rather than as a table.
 */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={cn('space-y-1.5', className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className="skeleton-line"
          style={{ width: index === lines - 1 ? '62%' : '100%' }}
        />
      ))}
    </div>
  );
}

/**
 * A live region wrapper.
 *
 * Wraps any skeleton so assistive tech hears the state once, in words, instead
 * of hearing nothing at all — the most common accessibility failure of
 * skeleton screens.
 */
export function LoadingRegion({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                            Composed placeholders                           */
/* -------------------------------------------------------------------------- */

/** Matches the workspace project card, including the 64px thumbnail block. */
export function ProjectCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <div
      aria-hidden
      className="animate-fade-up stagger-item rounded-surface border border-hairline bg-panel p-4"
      style={{ '--i': index } as CSSProperties}
    >
      <Skeleton className="rounded-control h-16 w-full" />
      <Skeleton className="skeleton-line mt-3.5 h-3 w-1/2" />
      <Skeleton className="skeleton-line mt-2 h-2.5 w-3/4" />
    </div>
  );
}

/**
 * The editor, before the document is read.
 *
 * Worth the size: opening a project is the app's longest wait, and a phone
 * showing "Abrindo projeto…" for half a second then snapping into a three-panel
 * editor feels broken in a way that the same half-second spent watching the
 * editor's own shape assemble does not. The panels are hidden below `lg`
 * because the mobile editor does not have them.
 */
export function EditorSkeleton() {
  return (
    <LoadingRegion label="Abrindo projeto" className="flex h-dvh flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-hairline bg-panel px-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-7 rounded-full" />
          <Skeleton className="skeleton-line h-3 w-28" />
        </div>
        <div className="hidden items-center gap-2 lg:flex">
          <Skeleton className="rounded-chip h-8 w-36" />
          <Skeleton className="rounded-chip h-8 w-24" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="rounded-chip h-8 w-8" />
          <Skeleton className="rounded-chip h-8 w-20" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="hidden w-72 shrink-0 flex-col gap-2 border-r border-hairline bg-panel p-3 lg:flex">
          <Skeleton className="rounded-chip h-8 w-full" />
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton key={index} className="h-7 w-full rounded-md" />
          ))}
        </div>

        <div className="canvas-surface grid min-h-0 flex-1 place-items-center p-6">
          <Skeleton className="rounded-surface h-full max-h-[520px] w-full max-w-[680px]" />
        </div>

        <div className="hidden w-72 shrink-0 flex-col gap-3 border-l border-hairline bg-panel p-3 lg:flex">
          <Skeleton className="skeleton-line h-3 w-24" />
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="rounded-chip h-7 w-full" />
          ))}
        </div>
      </div>

      <div className="flex h-14 shrink-0 items-center justify-around border-t border-hairline bg-panel px-3 lg:hidden">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-12 rounded-lg" />
        ))}
      </div>
    </LoadingRegion>
  );
}

/** Rows of blocks, for the library while the plugin registry resolves. */
export function BlockListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <LoadingRegion label="Carregando a biblioteca de blocos" className="space-y-1">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-[46px] w-full rounded-lg" />
      ))}
    </LoadingRegion>
  );
}

/** The 3-up primitives grid, shown alongside `BlockListSkeleton`. */
export function PrimitiveGridSkeleton() {
  return (
    <div aria-hidden className="grid grid-cols-3 gap-1.5">
      {Array.from({ length: 9 }, (_, index) => (
        <Skeleton key={index} className="h-[34px] rounded-md" />
      ))}
    </div>
  );
}

/** One provider card in Settings. */
export function ProviderRowSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <LoadingRegion label="Carregando provedores de modelo" className="space-y-2">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="rounded-surface space-y-2 border border-hairline bg-panel p-3">
          <div className="flex items-center gap-2">
            <Skeleton className="skeleton-line h-3 w-24" />
            <Skeleton className="h-4 w-16 rounded-full" />
          </div>
          <div className="flex gap-1.5">
            <Skeleton className="rounded-chip h-9 flex-1" />
            <Skeleton className="rounded-chip h-9 w-20" />
          </div>
        </div>
      ))}
    </LoadingRegion>
  );
}

/** The two model pickers in the chat composer, before `/api/ai` answers. */
export function ModelPickerSkeleton() {
  return (
    <div aria-hidden className="flex gap-1.5">
      <Skeleton className="rounded-chip h-8 flex-1" />
      <Skeleton className="rounded-chip h-8 flex-1" />
    </div>
  );
}

/**
 * The assistant thinking.
 *
 * Deliberately *not* a full-message skeleton: the agent streams a status line
 * first, so pretending to know how long the answer will be would be a lie the
 * component then has to walk back. Three short lines, and the status text sits
 * above them.
 */
export function ChatThinkingSkeleton() {
  return (
    <div aria-hidden className="space-y-1.5 pt-0.5">
      <Skeleton className="skeleton-line h-2.5 w-[88%]" />
      <Skeleton className="skeleton-line h-2.5 w-[72%]" />
      <Skeleton className="skeleton-line h-2.5 w-[45%]" />
    </div>
  );
}

/** Generated-code preview, before the exporter has run. */
export function CodePreviewSkeleton() {
  // Fixed pseudo-random widths: a code block has ragged lines, but they must
  // not change between renders.
  const widths = [92, 64, 78, 40, 86, 58, 70, 34, 88, 50, 74, 62, 44, 80, 56];

  return (
    <LoadingRegion label="Gerando código" className="space-y-2 p-4">
      {widths.map((width, index) => (
        <Skeleton key={index} className="skeleton-line h-2.5" style={{ width: `${width}%` }} />
      ))}
    </LoadingRegion>
  );
}

/** The export dialog's file list. */
export function FileListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden className="space-y-1.5 p-3">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton
          key={index}
          className="skeleton-line h-2.5"
          style={{ width: `${[86, 62, 74, 50, 90, 68][index % 6]}%` }}
        />
      ))}
    </div>
  );
}

/** Asset tiles, used both for the initial grid and for pending generations. */
export function AssetTileSkeleton({ label }: { label?: string }) {
  return (
    <li className="overflow-hidden rounded-lg border border-hairline bg-shell">
      <Skeleton className="h-20 w-full rounded-none" />
      <div className="space-y-1 px-2 py-1.5">
        {label ? (
          <p className="truncate text-[10.5px] text-ink-faint">{label}</p>
        ) : (
          <Skeleton className="skeleton-line h-2 w-3/4" />
        )}
        <Skeleton className="skeleton-line h-2 w-1/2" />
      </div>
    </li>
  );
}
