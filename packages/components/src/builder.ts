import type { Breakpoint, MotionSpec, SceneNode, StyleMap } from '@opendesign/core';

/**
 * A tiny declarative builder for block authors.
 *
 * Blocks are node *trees*, but the document stores nodes flat. Writing that
 * flattening by hand — allocating ids, wiring `parent` and `children` both ways
 * — is where block authors make mistakes. `buildTree` does it once, correctly,
 * so a block definition reads like the markup it produces.
 */
export interface NodeSpec {
  type: string;
  name?: string;
  props?: Record<string, unknown>;
  style?: StyleMap;
  responsive?: Partial<Record<Exclude<Breakpoint, 'base'>, StyleMap>>;
  className?: string;
  motion?: MotionSpec;
  children?: NodeSpec[];
}

export interface BuildResult {
  nodes: SceneNode[];
  rootId: string;
}

export function buildTree(spec: NodeSpec, createId: (prefix?: string) => string): BuildResult {
  const nodes: SceneNode[] = [];

  function visit(current: NodeSpec, parent: string | null): string {
    const id = createId();
    const node: SceneNode = {
      id,
      type: current.type,
      name: current.name ?? defaultName(current.type),
      parent,
      children: [],
      props: current.props ?? {},
      style: current.style ?? {},
      ...(current.responsive ? { responsive: current.responsive } : {}),
      ...(current.className ? { className: current.className } : {}),
      ...(current.motion ? { motion: current.motion } : {}),
    };

    // Push before recursing so parents always precede children in the array,
    // which `insertSubtree` relies on.
    nodes.push(node);
    node.children = (current.children ?? []).map((child) => visit(child, id));
    return id;
  }

  const rootId = visit(spec, null);
  return { nodes, rootId };
}

function defaultName(type: string): string {
  const base = type.includes(':') ? (type.split(':')[1] ?? type) : type;
  return base.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/* -------------------------------------------------------------------------- */
/*                             Style shorthands                               */
/* -------------------------------------------------------------------------- */

/** `pad(4)` -> uniform `{spacing.4}`; `pad(6, 4)` -> vertical/horizontal. */
export function pad(vertical: number | string, horizontal = vertical) {
  return {
    top: `{spacing.${vertical}}` as const,
    bottom: `{spacing.${vertical}}` as const,
    left: `{spacing.${horizontal}}` as const,
    right: `{spacing.${horizontal}}` as const,
  };
}

export const space = (step: number | string) => `{spacing.${step}}` as const;
export const color = (name: string) => `{color.${name}}` as const;
export const radius = (name: string) => `{radius.${name}}` as const;
export const shadow = (name: string) => `{shadow.${name}}` as const;
export const fontSize = (name: string) => `{size.${name}}` as const;

/** A vertical flex container — the workhorse of every block. */
export function column(gap: number | string, extra: StyleMap = {}): StyleMap {
  return { display: 'flex', direction: 'column', gap: space(gap), ...extra };
}

/** A horizontal flex container. */
export function row(gap: number | string, extra: StyleMap = {}): StyleMap {
  return { display: 'flex', direction: 'row', align: 'center', gap: space(gap), ...extra };
}

/** Centered content column with a max width — the standard page section shell. */
export function container(extra: StyleMap = {}): StyleMap {
  return {
    width: 'fill',
    maxWidth: '1200px',
    margin: { left: 'auto', right: 'auto' },
    ...extra,
  };
}

/** Section wrapper with generous vertical rhythm that tightens on mobile. */
export function section(extra: StyleMap = {}): StyleMap {
  return {
    display: 'flex',
    direction: 'column',
    width: 'fill',
    padding: pad(16, 6),
    ...extra,
  };
}
