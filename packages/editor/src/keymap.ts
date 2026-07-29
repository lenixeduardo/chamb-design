import type { Editor } from './editor.js';

/**
 * Keyboard shortcuts.
 *
 * Bindings live in data so the command palette, the shortcuts sheet and the
 * actual handler all read from the same source — a shortcut can never be
 * documented as one thing and bound to another.
 */

export interface Binding {
  id: string;
  /** `mod` maps to ⌘ on macOS and Ctrl elsewhere. */
  keys: string;
  label: string;
  section: string;
  run: (editor: Editor) => void;
  /** Skip while the user is typing in a field. */
  allowInInput?: boolean;
}

export const BINDINGS: Binding[] = [
  {
    id: 'undo',
    keys: 'mod+z',
    label: 'Undo',
    section: 'History',
    run: (editor) => editor.undo(),
  },
  {
    id: 'redo',
    keys: 'mod+shift+z',
    label: 'Redo',
    section: 'History',
    run: (editor) => editor.redo(),
  },
  {
    id: 'delete',
    keys: 'Backspace',
    label: 'Delete selection',
    section: 'Edit',
    run: (editor) => editor.deleteSelection(),
  },
  {
    id: 'delete-alt',
    keys: 'Delete',
    label: 'Delete selection',
    section: 'Edit',
    run: (editor) => editor.deleteSelection(),
  },
  {
    id: 'duplicate',
    keys: 'mod+d',
    label: 'Duplicate',
    section: 'Edit',
    run: (editor) => editor.duplicateSelection(),
  },
  {
    id: 'select-all',
    keys: 'mod+a',
    label: 'Select all',
    section: 'Selection',
    run: (editor) => editor.selectAll(),
  },
  {
    id: 'deselect',
    keys: 'Escape',
    label: 'Select parent / deselect',
    section: 'Selection',
    run: (editor) => {
      if (editor.getState().selection.length > 0) editor.selectParent();
      else editor.clearSelection();
    },
  },
  {
    id: 'group',
    keys: 'mod+g',
    label: 'Group selection',
    section: 'Arrange',
    run: (editor) => editor.groupSelection(),
  },
  {
    id: 'ungroup',
    keys: 'mod+shift+g',
    label: 'Ungroup',
    section: 'Arrange',
    run: (editor) => editor.ungroupSelection(),
  },
  {
    id: 'tool-select',
    keys: 'v',
    label: 'Select tool',
    section: 'Tools',
    run: (editor) => editor.setTool('select'),
  },
  {
    id: 'tool-hand',
    keys: 'h',
    label: 'Hand tool',
    section: 'Tools',
    run: (editor) => editor.setTool('hand'),
  },
  {
    id: 'tool-frame',
    keys: 'f',
    label: 'Frame tool',
    section: 'Tools',
    run: (editor) => editor.setTool('frame'),
  },
  {
    id: 'tool-text',
    keys: 't',
    label: 'Text tool',
    section: 'Tools',
    run: (editor) => editor.setTool('text'),
  },
  {
    id: 'zoom-in',
    keys: 'mod+=',
    label: 'Zoom in',
    section: 'View',
    run: (editor) => editor.zoomBy(1.2, { x: 0, y: 0 }),
  },
  {
    id: 'zoom-out',
    keys: 'mod+-',
    label: 'Zoom out',
    section: 'View',
    run: (editor) => editor.zoomBy(1 / 1.2, { x: 0, y: 0 }),
  },
  {
    id: 'zoom-reset',
    keys: 'mod+0',
    label: 'Reset zoom',
    section: 'View',
    run: (editor) => editor.setZoom(1),
  },
  {
    id: 'toggle-grid',
    keys: 'mod+\'',
    label: 'Toggle grid',
    section: 'View',
    run: (editor) => editor.toggleGrid(),
  },
];

const IS_APPLE =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');

/** Normalizes an event into the `mod+shift+k` shape used by `Binding.keys`. */
export function eventToCombo(event: KeyboardEvent): string {
  const parts: string[] = [];
  const mod = IS_APPLE ? event.metaKey : event.ctrlKey;

  if (mod) parts.push('mod');
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');

  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  parts.push(key);

  return parts.join('+');
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  );
}

/**
 * Attaches the keymap. Returns a disposer.
 *
 * `mod+shift+z` must be checked before `mod+z`, so bindings are matched by
 * exact combo rather than by prefix.
 */
export function attachKeymap(
  editor: Editor,
  target: Window | HTMLElement = globalThis.window,
): () => void {
  const byCombo = new Map(BINDINGS.map((binding) => [binding.keys, binding]));

  const handler = (event: Event) => {
    const keyboardEvent = event as KeyboardEvent;
    const binding = byCombo.get(eventToCombo(keyboardEvent));
    if (!binding) return;
    if (!binding.allowInInput && isEditableTarget(keyboardEvent.target)) return;

    keyboardEvent.preventDefault();
    binding.run(editor);
  };

  target.addEventListener('keydown', handler);
  return () => target.removeEventListener('keydown', handler);
}

/** Human-readable form for the shortcuts sheet, e.g. `⌘⇧Z`. */
export function formatCombo(keys: string): string {
  return keys
    .split('+')
    .map((part) => {
      if (part === 'mod') return IS_APPLE ? '⌘' : 'Ctrl';
      if (part === 'shift') return IS_APPLE ? '⇧' : 'Shift';
      if (part === 'alt') return IS_APPLE ? '⌥' : 'Alt';
      if (part === 'Backspace') return '⌫';
      if (part === 'Escape') return 'Esc';
      return part.toUpperCase();
    })
    .join(IS_APPLE ? '' : '+');
}
