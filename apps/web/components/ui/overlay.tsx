'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * The overlay shell every dialog in the app sits in.
 *
 * Both dialogs used to reimplement the same three things — a backdrop, an
 * Escape handler and an entrance animation — and both got the same four things
 * wrong: no exit animation (the surface vanished rather than closing), no focus
 * trap (Tab walked into the editor behind it), no focus restore, and no scroll
 * lock (scrolling the dialog scrolled the workspace underneath once it hit an
 * end). On a phone the last one is the loud failure: the page behind a modal
 * moving under your finger is the classic "this is a website pretending to be
 * an app" tell.
 *
 * Below `sm` the surface becomes a bottom sheet pinned to the viewport's real
 * height. A centred 88vh card on a phone leaves two unusable slivers of
 * backdrop and puts the close button where the thumb cannot reach; a sheet puts
 * the content against the bottom edge where the hand already is.
 */

const OverlayContext = createContext<(() => void) | null>(null);

/**
 * Close the enclosing overlay *with* its exit animation.
 *
 * Children should call this rather than the `onClose` they were handed — going
 * direct unmounts the surface on the spot and skips the transition.
 */
export function useOverlayClose(): () => void {
  const close = useContext(OverlayContext);
  if (!close) throw new Error('useOverlayClose must be used inside an <Overlay>');
  return close;
}

/** How long the exit keyframes run; kept in step with `--motion-fast`. */
const EXIT_MS = 130;

/** Nested overlays (Settings opens from inside the chat) must not fight over
 *  the body's overflow, so the lock is refcounted rather than boolean. */
let scrollLocks = 0;

function lockScroll(): () => void {
  if (scrollLocks === 0) {
    document.body.dataset.odScroll = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLocks += 1;

  return () => {
    scrollLocks = Math.max(0, scrollLocks - 1);
    if (scrollLocks === 0) {
      document.body.style.overflow = document.body.dataset.odScroll ?? '';
      delete document.body.dataset.odScroll;
    }
  };
}

/**
 * Who is on top.
 *
 * Settings opens from inside the assistant, so two overlays can be up at once.
 * Both bind their key handler to `window`, and `stopPropagation` does not stop
 * a sibling listener on the same target — the outer one is registered first, so
 * without this stack a single Escape closed the dialog *and* the sheet that
 * opened it. Only the topmost overlay reacts to keys.
 */
const stack: symbol[] = [];

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export type OverlaySize = 'sm' | 'panel' | 'md' | 'lg';

/**
 * Mobile height first, desktop width second.
 *
 * `panel` is the editor's tool sheets: deliberately short, because the point of
 * opening the layers list on a phone is to act on the canvas behind it, and a
 * sheet that covers the canvas hides the thing you are editing.
 */
const SIZES: Record<OverlaySize, string> = {
  sm: 'h-auto max-h-[86dvh] sm:h-auto sm:max-h-[88vh] sm:w-[min(460px,94vw)]',
  panel: 'h-[72dvh] sm:h-[min(640px,84vh)] sm:w-[min(460px,94vw)]',
  md: 'h-[92dvh] sm:h-[min(720px,88vh)] sm:w-[min(620px,94vw)]',
  lg: 'h-[92dvh] sm:h-[min(720px,88vh)] sm:w-[min(1100px,94vw)]',
};

export function Overlay({
  label,
  onClose,
  size = 'md',
  children,
}: {
  /** Accessible name for the dialog. */
  label: string;
  onClose: () => void;
  size?: OverlaySize;
  children: ReactNode;
}) {
  const [leaving, setLeaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef<symbol>(undefined as unknown as symbol);
  if (idRef.current === undefined) idRef.current = Symbol('overlay');

  // Portaled to `document.body` because `position: fixed` is resolved against
  // the nearest transformed ancestor, not the viewport. The workspace and the
  // editor both arrive inside an `animate-page-in` wrapper whose fill-mode
  // leaves a live `transform` on the element — under that ancestor the
  // backdrop's `inset-0` covers the whole page (1261px of it) instead of the
  // viewport, and the dialog opens centred in the page, its footer below the
  // fold. Rendering into `body` takes the overlay out of every ancestor's
  // stacking and containing-block context. `mounted` guards the portal node
  // against server rendering, where `document` does not exist.
  useEffect(() => setMounted(true), []);

  // `onClose` is an inline arrow at every call site, so it is read through a
  // ref: keying effects on it would rebind the key listener each render, and a
  // key pressed while a render was in flight would land in that gap.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const requestClose = useCallback(() => {
    if (timerRef.current) return;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    setLeaving(true);
    timerRef.current = setTimeout(() => closeRef.current(), reduced ? 0 : EXIT_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => lockScroll(), []);

  /* Focus: move into the dialog on open, restore to the opener on close.

     Depends on `mounted`: the surface does not exist until the portal has been
     rendered, so running this against the first (null) render would focus
     nothing and never run again. Capturing `opener` here rather than on the
     first mount is the same element in practice — nothing else can take focus
     between the click that opened the dialog and this effect.
  */
  useEffect(() => {
    if (!mounted) return;
    const opener = document.activeElement as HTMLElement | null;
    const surface = surfaceRef.current;

    // The first focusable is usually the close button, which is a poor landing
    // spot — focus the surface itself and let Tab take it from there.
    surface?.focus({ preventScroll: true });

    return () => opener?.focus?.({ preventScroll: true });
  }, [mounted]);

  /* Escape, and a Tab that cannot leave. */
  useEffect(() => {
    const id = idRef.current;
    stack.push(id);

    const onKeyDown = (event: KeyboardEvent) => {
      // Anything below the top of the stack is covered by another overlay and
      // has no business reading the keyboard.
      if (stack[stack.length - 1] !== id) return;

      if (event.key === 'Escape') {
        event.stopPropagation();
        requestClose();
        return;
      }

      if (event.key !== 'Tab') return;
      const surface = surfaceRef.current;
      if (!surface) return;

      const focusable = [...surface.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === surface)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      const index = stack.lastIndexOf(id);
      if (index !== -1) stack.splice(index, 1);
    };
  }, [requestClose]);

  const surface = (
    <OverlayContext.Provider value={requestClose}>
      <div
        className={cn(
          'fixed inset-0 z-50 flex items-end justify-center bg-[#121211]/35 backdrop-blur-sm',
          'sm:items-center sm:p-6',
          leaving ? 'animate-fade-out' : 'animate-fade-in',
        )}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) requestClose();
        }}
      >
        <div
          ref={surfaceRef}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
          className={cn(
            'lift flex w-full flex-col overflow-hidden border border-hairline bg-panel outline-none',
            // Phone: a sheet that stops short of the status bar, so the surface
            // behind it stays visible as context. Tablet and up: a centred card.
            'rounded-t-sheet sm:rounded-sheet',
            SIZES[size],
            leaving
              ? 'animate-sheet-out sm:animate-dialog-out'
              : 'animate-sheet-in sm:animate-dialog-in',
          )}
        >
          {/* Grab handle. Purely an affordance — the sheet is not draggable —
              but it is the signal that tells a thumb this panel is dismissible
              downward rather than a new screen. */}
          <div aria-hidden className="flex justify-center pt-2 pb-1 sm:hidden">
            <span className="h-1 w-9 rounded-full bg-hairline-strong" />
          </div>
          {children}
        </div>
      </div>
    </OverlayContext.Provider>
  );

  // `mounted` is false on the server and on the first client render; nothing
  // may touch `document.body` before hydration completes.
  if (!mounted) return null;
  return createPortal(surface, document.body);
}

/**
 * A dialog's title bar.
 *
 * Exists so the close button is identical everywhere and is a real 44px target
 * on touch, which the two hand-rolled 28px ones were not.
 */
export function OverlayHeader({
  icon,
  title,
  actions,
}: {
  icon?: ReactNode;
  title: string;
  actions?: ReactNode;
}) {
  const close = useOverlayClose();

  return (
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline px-3 py-2 sm:h-12 sm:px-4 sm:py-0">
      <div className="flex min-w-0 items-center gap-2">
        {icon}
        <h2 className="truncate text-[13px] font-medium">{title}</h2>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {actions}
        <button
          type="button"
          onClick={close}
          aria-label={`Fechar ${title.toLowerCase()}`}
          className="rounded-chip grid h-9 w-9 shrink-0 place-items-center text-ink-muted transition-colors hover:bg-panel-raised hover:text-ink sm:h-8 sm:w-8"
        >
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden fill="none">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}
