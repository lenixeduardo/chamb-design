import { z } from 'zod';
import { BREAKPOINTS } from './types.js';
import type { Operation } from './operations.js';

/**
 * Runtime schemas.
 *
 * TypeScript types vanish at runtime, and two of our inputs are fully
 * untrusted: JSON produced by a language model, and documents uploaded or
 * imported by users. Everything crossing those boundaries is parsed here
 * before it reaches `applyOperation`.
 */

const lengthSchema = z.union([z.number(), z.string()]);

const boxSchema = z
  .object({
    top: lengthSchema.optional(),
    right: lengthSchema.optional(),
    bottom: lengthSchema.optional(),
    left: lengthSchema.optional(),
  })
  .strict();

export const styleSchema = z
  .object({
    display: z.enum(['flex', 'inline-flex', 'grid', 'block', 'inline-block', 'none']).optional(),
    direction: z.enum(['row', 'column', 'row-reverse', 'column-reverse']).optional(),
    wrap: z.boolean().optional(),
    justify: z.enum(['start', 'center', 'end', 'between', 'around', 'evenly']).optional(),
    align: z.enum(['start', 'center', 'end', 'stretch', 'baseline']).optional(),
    gap: lengthSchema.optional(),

    gridColumns: z.union([z.number(), z.string()]).optional(),
    gridRows: z.union([z.number(), z.string()]).optional(),
    colSpan: z.number().optional(),
    rowSpan: z.number().optional(),

    padding: boxSchema.optional(),
    margin: boxSchema.optional(),

    width: z.union([lengthSchema, z.enum(['auto', 'fill', 'hug'])]).optional(),
    height: z.union([lengthSchema, z.enum(['auto', 'fill', 'hug'])]).optional(),
    minWidth: lengthSchema.optional(),
    minHeight: lengthSchema.optional(),
    maxWidth: lengthSchema.optional(),
    maxHeight: lengthSchema.optional(),

    position: z.enum(['static', 'relative', 'absolute', 'fixed', 'sticky']).optional(),
    inset: boxSchema.optional(),
    zIndex: z.number().optional(),
    x: z.number().optional(),
    y: z.number().optional(),

    background: z.string().optional(),
    color: z.string().optional(),
    border: z
      .object({
        width: lengthSchema.optional(),
        style: z.enum(['solid', 'dashed', 'dotted', 'none']).optional(),
        color: z.string().optional(),
      })
      .strict()
      .optional(),
    radius: z.union([lengthSchema, boxSchema]).optional(),
    shadow: z.string().optional(),
    opacity: z.number().min(0).max(1).optional(),
    backdropBlur: lengthSchema.optional(),
    overflow: z.enum(['visible', 'hidden', 'auto', 'scroll']).optional(),
    cursor: z.string().optional(),
    aspectRatio: z.string().optional(),

    font: z
      .object({
        family: z.string().optional(),
        size: lengthSchema.optional(),
        weight: z.number().optional(),
        lineHeight: lengthSchema.optional(),
        letterSpacing: lengthSchema.optional(),
        align: z.enum(['left', 'center', 'right', 'justify']).optional(),
        transform: z.enum(['none', 'uppercase', 'lowercase', 'capitalize']).optional(),
        italic: z.boolean().optional(),
        decoration: z.enum(['none', 'underline', 'line-through']).optional(),
      })
      .strict()
      .optional(),

    transition: z.string().optional(),
    transform: z.string().optional(),
  })
  .strict();

export const motionSchema = z
  .object({
    engine: z.enum(['framer-motion', 'gsap', 'css']),
    trigger: z.enum(['mount', 'hover', 'tap', 'in-view', 'scroll']),
    from: z.record(z.string(), z.number()).optional(),
    to: z.record(z.string(), z.number()).optional(),
    duration: z.number().optional(),
    delay: z.number().optional(),
    stagger: z.number().optional(),
    ease: z.string().optional(),
    repeat: z.number().optional(),
  })
  .strict();

export const sceneNodeSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    name: z.string(),
    parent: z.string().nullable(),
    children: z.array(z.string()),
    props: z.record(z.string(), z.unknown()),
    style: styleSchema,
    responsive: z.record(z.string(), styleSchema).optional(),
    className: z.string().optional(),
    constraints: z
      .object({
        horizontal: z.enum(['left', 'right', 'center', 'scale', 'stretch']),
        vertical: z.enum(['top', 'bottom', 'center', 'scale', 'stretch']),
      })
      .optional(),
    motion: motionSchema.optional(),
    locked: z.boolean().optional(),
    hidden: z.boolean().optional(),
    componentId: z.string().optional(),
    overrides: z.record(z.string(), z.unknown()).optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const pageSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    path: z.string().startsWith('/'),
    rootId: z.string().min(1),
    canvas: z.object({
      width: z.number().positive(),
      height: z.number().positive(),
      background: z.string().optional(),
    }),
    meta: z
      .object({
        title: z.string().optional(),
        description: z.string().optional(),
        ogImage: z.string().optional(),
      })
      .optional(),
  })
  .strict();

export const assetSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(['image', 'svg', 'video', 'icon', 'logo', 'font']),
    name: z.string(),
    url: z.string(),
    width: z.number().optional(),
    height: z.number().optional(),
    size: z.number().optional(),
    mimeType: z.string().optional(),
    alt: z.string().optional(),
    prompt: z.string().optional(),
    generatedBy: z.string().optional(),
    createdAt: z.string(),
  })
  .strict();

const breakpointSchema = z.enum(BREAKPOINTS);

export const operationSchema: z.ZodType<Operation> = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('insertSubtree'),
    nodes: z.array(sceneNodeSchema).min(1),
    rootId: z.string(),
    parentId: z.string().nullable(),
    index: z.number().int().min(0),
  }),
  z.object({ type: z.literal('removeSubtree'), nodeId: z.string() }),
  z.object({
    type: z.literal('moveNode'),
    nodeId: z.string(),
    parentId: z.string(),
    index: z.number().int().min(0),
  }),
  z.object({
    type: z.literal('reorderChildren'),
    nodeId: z.string(),
    children: z.array(z.string()),
  }),
  z.object({
    type: z.literal('updateProps'),
    nodeId: z.string(),
    props: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal('updateStyle'),
    nodeId: z.string(),
    style: styleSchema,
    breakpoint: breakpointSchema.optional(),
  }),
  z.object({
    type: z.literal('setNodeFields'),
    nodeId: z.string(),
    fields: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal('addPage'),
    page: pageSchema,
    nodes: z.array(sceneNodeSchema),
    index: z.number().int().min(0),
  }),
  z.object({ type: z.literal('removePage'), pageId: z.string() }),
  z.object({
    type: z.literal('updatePage'),
    pageId: z.string(),
    patch: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal('setToken'),
    path: z.string(),
    value: z.union([z.string(), z.number()]).nullable(),
  }),
  z.object({
    type: z.literal('setThemes'),
    themes: z.array(z.record(z.string(), z.unknown())),
    activeThemeId: z.string(),
  }),
  z.object({ type: z.literal('addAsset'), asset: assetSchema }),
  z.object({ type: z.literal('removeAsset'), assetId: z.string() }),
  z.object({
    type: z.literal('upsertComponent'),
    component: z.record(z.string(), z.unknown()),
    nodes: z.array(sceneNodeSchema).optional(),
  }),
  z.object({ type: z.literal('removeComponent'), componentId: z.string() }),
  z.object({
    type: z.literal('setDocumentFields'),
    fields: z.record(z.string(), z.unknown()),
  }),
]) as unknown as z.ZodType<Operation>;

export const documentSchema = z.object({
  schemaVersion: z.number().int().positive(),
  id: z.string(),
  name: z.string(),
  pages: z.array(pageSchema).min(1),
  nodes: z.record(z.string(), sceneNodeSchema),
  tokens: z.record(z.string(), z.unknown()),
  themes: z.array(z.record(z.string(), z.unknown())),
  activeThemeId: z.string(),
  assets: z.array(assetSchema),
  components: z.array(z.record(z.string(), z.unknown())),
  createdAt: z.string(),
  updatedAt: z.string(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  errors: string[];
}

/**
 * Parses a batch of model-produced operations.
 *
 * Invalid ops are dropped rather than failing the whole batch: a model that
 * emitted nine good edits and one malformed one should still land the nine.
 * The rejected ones come back as `errors` and are fed to the fixing pass.
 */
export function parseOperations(input: unknown): ValidationResult<Operation[]> {
  if (!Array.isArray(input)) {
    return { ok: false, errors: ['expected an array of operations'] };
  }

  const value: Operation[] = [];
  const errors: string[] = [];

  input.forEach((candidate, index) => {
    const result = operationSchema.safeParse(candidate);
    if (result.success) {
      value.push(result.data);
    } else {
      const issues = result.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
      errors.push(`operation[${index}] rejected — ${issues}`);
    }
  });

  return { ok: errors.length === 0, value, errors };
}

/** Structural integrity checks that a per-op schema cannot express. */
export function validateDocumentIntegrity(document: unknown): ValidationResult<true> {
  const parsed = documentSchema.safeParse(document);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    };
  }

  const doc = parsed.data;
  const errors: string[] = [];

  for (const [id, node] of Object.entries(doc.nodes)) {
    if (node.id !== id) errors.push(`node "${id}" has mismatched id "${node.id}"`);

    for (const childId of node.children) {
      const child = doc.nodes[childId];
      if (!child) {
        errors.push(`node "${id}" references missing child "${childId}"`);
      } else if (child.parent !== id) {
        errors.push(`child "${childId}" does not point back to parent "${id}"`);
      }
    }

    if (node.parent && !doc.nodes[node.parent]) {
      errors.push(`node "${id}" references missing parent "${node.parent}"`);
    }
  }

  for (const page of doc.pages) {
    if (!doc.nodes[page.rootId]) {
      errors.push(`page "${page.id}" references missing root "${page.rootId}"`);
    }
  }

  // Cycle detection — a cycle would hang every walker in the codebase.
  const seen = new Set<string>();
  for (const id of Object.keys(doc.nodes)) {
    let cursor: string | null = id;
    const path = new Set<string>();
    while (cursor) {
      if (path.has(cursor)) {
        errors.push(`cycle detected in ancestor chain of "${id}"`);
        break;
      }
      path.add(cursor);
      if (seen.has(cursor)) break;
      seen.add(cursor);
      cursor = doc.nodes[cursor]?.parent ?? null;
    }
  }

  return errors.length === 0 ? { ok: true, value: true, errors: [] } : { ok: false, errors };
}
