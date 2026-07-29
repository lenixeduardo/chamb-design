'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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

    const onPointerDown = (event: PointerEvent) => {
      last = { x: event.clientX, y: event.clientY };
      element.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!last) return;
      editor.panBy({ x: event.clientX - last.x, y: event.clientY - last.y });
      last = { x: event.clientX, y: event.clientY };
    };
    const onPointerUp = (event: PointerEvent) => {
      last = null;
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
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

  if (!page) {
    return <div className="canvas-surface grid flex-1 place-items-center text-ink-faint">No page</div>;
  }

  const { offset, zoom } = state.viewport;

  return (
    <div
      ref={viewportRef}
      className="canvas-surface relative min-h-0 flex-1 overflow-hidden"
      style={{ cursor: panning ? 'grab' : 'default' }}
    >
      {/* Motion primitives, injected once so canvas animations match production. */}
      <style dangerouslySetInnerHTML={{ __html: motionStylesheet() }} />

      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ transform: `translate(${-offset.x * zoom}px, ${-offset.y * zoom}px) scale(${zoom})` }}
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

      <div className="pointer-events-none absolute right-3 bottom-3 rounded-lg border border-hairline bg-panel/90 px-2 py-1 font-mono text-[11px] text-ink-faint backdrop-blur">
        {Math.round(zoom * 100)}%
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
        <div
          className="absolute border border-brand/45"
          style={rectStyle(toScreen(hoverRect))}
        />
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
                ? (document.nodes[state.selection[0]!]?.name ?? 'Layer')
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
