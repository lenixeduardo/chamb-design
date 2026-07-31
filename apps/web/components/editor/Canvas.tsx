'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import {
  DEVICE_PRESETS,
  type NodeId,
  type Rect,
  canvasToScreen,
  unionRects,
} from '@opendesign/core';
import { PageRenderer, motionStylesheet } from '@opendesign/renderer';
import {
  useActivePage,
  useCanvasMeasurement,
  useCanvasSelection,
  useDocument,
  useEditorState,
  type Editor,
} from '@opendesign/editor';

/**
 * The canvas.
 *
 * It composes three independent layers:
 *   1. the renderer output — plain DOM with `data-od-id` attributes;
 *   2. an overlay drawing selection and hover boxes from measured geometry;
 *   3. pointer handlers attached by delegation.
 *
 * The renderer itself has no idea any of this exists, which is what makes the
 * published site and the canvas the same code path.
 */
export function Canvas({ editor }: { editor: Editor }) {
  const state = useEditorState(editor);
  const document = useDocument(editor);
  const page = useActivePage(editor);

  const viewportRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  useCanvasMeasurement(editor, surfaceRef);
  useCanvasSelection(editor, surfaceRef);

  const device = useMemo(
    () =>
      DEVICE_PRESETS.find((preset) => preset.breakpoint === state.activeBreakpoint) ??
      DEVICE_PRESETS[2],
    [state.activeBreakpoint],
  );

  const deviceWidth = device?.width ?? 1440;

  /**
   * Fit the page to the viewport.
   *
   * Screen position is `(canvas - offset) * zoom`, so placing the page's
   * top-left at a padding of `p` means an offset of `-p / zoom`. The extra
   * vertical padding is for the page label, which is drawn *above* the surface
   * and would otherwise sit off the top edge.
   */
  const fit = useCallback(() => {
    const element = viewportRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const padding = 24;
    const zoom = Math.min(2, Math.max(0.1, (rect.width - padding * 2) / deviceWidth));
    editor.setViewport({ offset: { x: -padding / zoom, y: -36 / zoom }, zoom });
  }, [editor, deviceWidth]);

  /**
   * Auto-fit when the page cannot fit as it is.
   *
   * The editor opens at 80% zoom, which on a phone means a 1440px desktop frame
   * rendered 1152px wide inside a 390px viewport — the user's first sight of
   * their design is a corner of it. Fitting only when the page actually
   * overflows leaves a desktop user's default alone.
   */
  /** Zooming from a button should hold the middle of the screen still. */
  const viewportCentre = () => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return rect ? { x: rect.width / 2, y: rect.height / 2 } : { x: 0, y: 0 };
  };

  const fitted = useRef<number | null>(null);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element || fitted.current === deviceWidth) return;

    const available = element.getBoundingClientRect().width;
    if (available === 0) return;

    fitted.current = deviceWidth;
    if (deviceWidth * editor.getState().viewport.zoom > available - 32) fit();
  }, [editor, deviceWidth, fit]);

  /* Wheel: ctrl/⌘ zooms around the cursor, everything else pans. */
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };

      if (event.ctrlKey || event.metaKey) {
        editor.zoomBy(event.deltaY < 0 ? 1.08 : 1 / 1.08, anchor);
      } else {
        editor.panBy({ x: -event.deltaX, y: -event.deltaY });
      }
    };

    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [editor]);

  /* Space-drag and the hand tool pan the viewport. */
  const [spaceHeld, setSpaceHeld] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !event.repeat) setSpaceHeld(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceHeld(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const panning = spaceHeld || state.tool === 'hand';

  useEffect(() => {
    const element = viewportRef.current;
    if (!element || !panning) return;

    let last: { x: number; y: number } | null = null;

    // Touch is handled by the gesture effect below, which also pans with the
    // select tool. Without this filter a hand-tool drag on a phone would be
    // applied twice and the canvas would move at double speed.
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      last = { x: event.clientX, y: event.clientY };
      element.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!last || event.pointerType === 'touch') return;
      editor.panBy({ x: event.clientX - last.x, y: event.clientY - last.y });
      last = { x: event.clientX, y: event.clientY };
    };
    const onPointerUp = (event: PointerEvent) => {
      last = null;
      if (element.hasPointerCapture(event.pointerId))
        element.releasePointerCapture(event.pointerId);
    };

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerUp);

    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerUp);
    };
  }, [editor, panning]);

  /**
   * Touch.
   *
   * Wheel events do not exist on a phone, and the mouse pan path only runs when
   * the hand tool is active — so before this the canvas could not be moved or
   * zoomed by touch at all. One finger pans, two pinch and pan together.
   *
   * A drag has to not become a selection: the browser still synthesises a click
   * at the end of a touch drag, and without the guard below, letting go after
   * panning selected whatever layer happened to be under the finger. The
   * threshold is in CSS pixels of total travel, and the click is swallowed in
   * the capture phase so the editor's own delegated handler never sees it.
   */
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const points = new Map<number, { x: number; y: number }>();
    let travel = 0;
    let lastGap = 0;

    const centre = () => {
      const list = [...points.values()];
      const sum = list.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), {
        x: 0,
        y: 0,
      });
      return { x: sum.x / list.length, y: sum.y / list.length };
    };

    const gap = () => {
      const [a, b] = [...points.values()];
      if (!a || !b) return 0;
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (points.size === 1) travel = 0;
      if (points.size === 2) lastGap = gap();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || !points.has(event.pointerId)) return;

      const previous = points.get(event.pointerId)!;
      const next = { x: event.clientX, y: event.clientY };
      const before = centre();
      points.set(event.pointerId, next);
      travel += Math.abs(next.x - previous.x) + Math.abs(next.y - previous.y);

      const after = centre();
      editor.panBy({ x: after.x - before.x, y: after.y - before.y });

      if (points.size >= 2) {
        const current = gap();
        if (lastGap > 0 && current > 0) {
          const rect = element.getBoundingClientRect();
          editor.zoomBy(current / lastGap, { x: after.x - rect.left, y: after.y - rect.top });
        }
        lastGap = current;
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      points.delete(event.pointerId);
      lastGap = points.size >= 2 ? gap() : 0;
    };

    const onClickCapture = (event: MouseEvent) => {
      if (travel <= 10) return;
      travel = 0;
      event.stopPropagation();
      event.preventDefault();
    };

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerUp);
    element.addEventListener('click', onClickCapture, true);

    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerUp);
      element.removeEventListener('click', onClickCapture, true);
    };
  }, [editor]);

  if (!page) {
    return (
      <div className="canvas-surface grid flex-1 place-items-center text-[13px] text-ink-faint">
        Sem página
      </div>
    );
  }

  const { offset, zoom } = state.viewport;

  return (
    <div
      ref={viewportRef}
      className="canvas-surface relative min-h-0 flex-1 overflow-hidden"
      style={{
        cursor: panning ? 'grab' : 'default',
        // Pointer events for pan and pinch only arrive if the browser is not
        // busy interpreting the same touches as a page scroll.
        touchAction: 'none',
      }}
    >
      {/* Motion primitives, injected once so canvas animations match production. */}
      <style dangerouslySetInnerHTML={{ __html: motionStylesheet() }} />

      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{
          transform: `translate(${-offset.x * zoom}px, ${-offset.y * zoom}px) scale(${zoom})`,
        }}
      >
        <div className="pointer-events-none absolute -top-7 left-0 flex items-center gap-2 text-[11px] whitespace-nowrap text-ink-faint">
          <span className="font-medium text-ink-muted">{page.name}</span>
          <span>
            {device?.label} · {device?.width}px
          </span>
        </div>

        <div
          ref={surfaceRef}
          className="relative bg-white shadow-[0_24px_80px_-24px_rgba(0,0,0,0.7)]"
          style={{ width: device?.width ?? 1440, minHeight: 400 }}
        >
          <PageRenderer
            document={document}
            pageId={page.id}
            styleMode="inline"
            breakpoint={state.activeBreakpoint}
          />
        </div>
      </div>

      <SelectionOverlay editor={editor} />

      {/* Zoom controls.
          The keyboard shortcuts and ⌘-wheel cover this on a desktop, but a
          phone has neither — and the zoom readout was already here, sitting
          inert in the corner where the buttons belong. */}
      <div className="rounded-control absolute right-3 bottom-3 flex items-center gap-0.5 border border-hairline bg-panel/90 p-1 backdrop-blur">
        <button
          type="button"
          aria-label="Reduzir zoom"
          onClick={() => editor.zoomBy(1 / 1.2, viewportCentre())}
          className="grid h-9 w-9 place-items-center rounded-[10px] text-ink-muted transition-colors hover:bg-panel-raised hover:text-ink sm:h-7 sm:w-7"
        >
          <Minus size={13} />
        </button>
        <button
          type="button"
          aria-label="Restaurar zoom para 100%"
          onClick={() => editor.setZoom(1, viewportCentre())}
          className="min-w-[46px] rounded-[10px] px-1 font-mono text-[11px] text-ink-faint transition-colors hover:text-ink"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          aria-label="Aumentar zoom"
          onClick={() => editor.zoomBy(1.2, viewportCentre())}
          className="grid h-9 w-9 place-items-center rounded-[10px] text-ink-muted transition-colors hover:bg-panel-raised hover:text-ink sm:h-7 sm:w-7"
        >
          <Plus size={13} />
        </button>
        <button
          type="button"
          aria-label="Ajustar a página à tela"
          onClick={fit}
          className="grid h-9 w-9 place-items-center rounded-[10px] text-ink-muted transition-colors hover:bg-panel-raised hover:text-ink sm:h-7 sm:w-7"
        >
          <Maximize2 size={12} />
        </button>
      </div>
    </div>
  );
}

/**
 * Selection and hover chrome.
 *
 * Drawn from the editor's measured rectangles rather than from the document, so
 * boxes land exactly where the browser laid the element out — including after
 * auto-layout, wrapping and responsive changes.
 */
function SelectionOverlay({ editor }: { editor: Editor }) {
  const state = useEditorState(editor);
  const document = useDocument(editor);

  const toScreen = (rect: Rect): Rect => {
    const point = canvasToScreen({ x: rect.x, y: rect.y }, state.viewport);
    return {
      x: point.x,
      y: point.y,
      width: rect.width * state.viewport.zoom,
      height: rect.height * state.viewport.zoom,
    };
  };

  const selectionRects = state.selection
    .map((id) => editor.getRect(id))
    .filter((rect): rect is Rect => Boolean(rect));

  const hoverRect =
    state.hoveredId && !state.selection.includes(state.hoveredId)
      ? editor.getRect(state.hoveredId)
      : undefined;

  const bounds = unionRects(selectionRects);

  return (
    <div className="pointer-events-none absolute inset-0">
      {hoverRect && (
        <div className="absolute border border-brand/45" style={rectStyle(toScreen(hoverRect))} />
      )}

      {selectionRects.map((rect, index) => (
        <div
          key={state.selection[index]}
          className="absolute border border-brand"
          style={rectStyle(toScreen(rect))}
        />
      ))}

      {bounds && selectionRects.length > 0 && (
        <>
          {/* Resize handles are visual affordances here; drag behaviour lives in
              the inspector's numeric fields until direct manipulation lands. */}
          {(['nw', 'ne', 'se', 'sw'] as const).map((handle) => {
            const screen = toScreen(bounds);
            const x = handle.includes('w') ? screen.x : screen.x + screen.width;
            const y = handle.includes('n') ? screen.y : screen.y + screen.height;
            return (
              <div
                key={handle}
                className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-brand bg-white"
                style={{ left: x, top: y }}
              />
            );
          })}

          <SelectionLabel
            rect={toScreen(bounds)}
            label={
              state.selection.length === 1
                ? (document.nodes[state.selection[0]!]?.name ?? 'Camada')
                : `${state.selection.length} layers`
            }
          />
        </>
      )}
    </div>
  );
}

function SelectionLabel({ rect, label }: { rect: Rect; label: string }) {
  return (
    <div
      className="absolute rounded-[4px] bg-brand px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-white"
      style={{ left: rect.x, top: rect.y - 18 }}
    >
      {label}
    </div>
  );
}

function rectStyle(rect: Rect) {
  return { left: rect.x, top: rect.y, width: rect.width, height: rect.height };
}

export type { NodeId };
