import type { ComponentContribution } from '@opendesign/core';
import {
  buildTree,
  color,
  column,
  container,
  pad,
  radius,
  row,
  section,
  shadow,
  space,
  type NodeSpec,
} from '../builder.js';

/** Marketing sections: the blocks a landing page is actually made of. */

const eyebrow = (text: string): NodeSpec => ({
  type: 'text',
  name: 'Eyebrow',
  props: { text, as: 'span' },
  style: {
    display: 'inline-flex',
    align: 'center',
    padding: pad(1, 3),
    radius: radius('full'),
    background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
    color: color('accent'),
    font: { size: '{size.xs}', weight: 500, letterSpacing: '0.06em', transform: 'uppercase' },
  },
});

const ctaButton = (text: string, variant: 'primary' | 'ghost'): NodeSpec => ({
  type: 'button',
  name: variant === 'primary' ? 'Primary CTA' : 'Secondary CTA',
  props: { text },
  style: {
    display: 'inline-flex',
    justify: 'center',
    align: 'center',
    padding: pad(3, 6),
    radius: radius('md'),
    cursor: 'pointer',
    transition: 'all 160ms ease',
    font: { size: '{size.sm}', weight: 500 },
    ...(variant === 'primary'
      ? { background: color('accent'), color: color('accent-foreground') }
      : {
          background: 'transparent',
          color: color('foreground'),
          border: { width: 1, style: 'solid' as const, color: color('border') },
        }),
  },
  motion: { engine: 'css', trigger: 'hover', to: { y: -2 }, duration: 200 },
});

export const heroCentered: ComponentContribution = {
  id: 'lib:hero-centered',
  name: 'Hero — centered',
  category: 'Hero',
  keywords: ['landing', 'above the fold', 'headline'],
  description: 'Centered headline, subheadline and a pair of calls to action.',
  props: [
    { name: 'eyebrow', type: 'string', defaultValue: 'Now in public beta' },
    { name: 'title', type: 'string', defaultValue: 'Design at the speed of thought' },
    {
      name: 'subtitle',
      type: 'string',
      defaultValue:
        'Describe what you want, watch it appear on the canvas, then refine every pixel by hand.',
    },
    { name: 'primaryCta', type: 'string', defaultValue: 'Start building' },
    { name: 'secondaryCta', type: 'string', defaultValue: 'View the docs' },
  ],
  create: ({ createId, props }) =>
    buildTree(
      {
        type: 'frame',
        name: 'Hero',
        style: section({ align: 'center', padding: pad(24, 6), background: color('background') }),
        responsive: { md: { padding: pad(32, 10) } },
        children: [
          {
            type: 'frame',
            name: 'Content',
            style: container({ ...column(6), align: 'center', maxWidth: '760px' }),
            children: [
              eyebrow((props?.eyebrow as string) ?? 'Now in public beta'),
              {
                type: 'heading',
                name: 'Headline',
                props: {
                  text: (props?.title as string) ?? 'Design at the speed of thought',
                  level: 'h1',
                },
                style: {
                  color: color('foreground'),
                  font: {
                    size: '{size.4xl}',
                    weight: 600,
                    lineHeight: '1.1',
                    letterSpacing: '-0.03em',
                    align: 'center',
                  },
                },
                responsive: { md: { font: { size: '{size.6xl}' } } },
                motion: {
                  engine: 'css',
                  trigger: 'mount',
                  from: { opacity: 0, y: 16 },
                  to: { opacity: 1, y: 0 },
                  duration: 600,
                },
              },
              {
                type: 'text',
                name: 'Subheadline',
                props: {
                  text:
                    (props?.subtitle as string) ??
                    'Describe what you want, watch it appear on the canvas, then refine every pixel by hand.',
                },
                style: {
                  color: color('muted-foreground'),
                  maxWidth: '560px',
                  font: { size: '{size.lg}', lineHeight: '1.6', align: 'center' },
                },
                motion: {
                  engine: 'css',
                  trigger: 'mount',
                  from: { opacity: 0, y: 12 },
                  to: { opacity: 1, y: 0 },
                  duration: 600,
                  delay: 80,
                },
              },
              {
                type: 'frame',
                name: 'Actions',
                style: { ...row(3), justify: 'center', wrap: true },
                children: [
                  ctaButton((props?.primaryCta as string) ?? 'Start building', 'primary'),
                  ctaButton((props?.secondaryCta as string) ?? 'View the docs', 'ghost'),
                ],
              },
            ],
          },
        ],
      },
      createId,
    ),
};

export const heroSplit: ComponentContribution = {
  id: 'lib:hero-split',
  name: 'Hero — split',
  category: 'Hero',
  keywords: ['landing', 'two column', 'screenshot'],
  description: 'Copy on the left, product visual on the right; stacks on mobile.',
  props: [
    { name: 'title', type: 'string', defaultValue: 'Ship interfaces, not mockups' },
    {
      name: 'subtitle',
      type: 'string',
      defaultValue: 'Every element on the canvas is real code you can export the moment it looks right.',
    },
    { name: 'image', type: 'image', defaultValue: '' },
  ],
  create: ({ createId, props }) =>
    buildTree(
      {
        type: 'frame',
        name: 'Hero split',
        style: section({ padding: pad(20, 6), background: color('background') }),
        children: [
          {
            type: 'frame',
            name: 'Grid',
            style: container({
              display: 'grid',
              gridColumns: 1,
              gap: space(12),
              align: 'center',
            }),
            responsive: { lg: { gridColumns: 2, gap: space(16) } },
            children: [
              {
                type: 'frame',
                name: 'Copy',
                style: column(5),
                children: [
                  {
                    type: 'heading',
                    name: 'Headline',
                    props: {
                      text: (props?.title as string) ?? 'Ship interfaces, not mockups',
                      level: 'h1',
                    },
                    style: {
                      color: color('foreground'),
                      font: {
                        size: '{size.4xl}',
                        weight: 600,
                        lineHeight: '1.1',
                        letterSpacing: '-0.03em',
                      },
                    },
                    responsive: { lg: { font: { size: '{size.5xl}' } } },
                  },
                  {
                    type: 'text',
                    name: 'Subheadline',
                    props: {
                      text:
                        (props?.subtitle as string) ??
                        'Every element on the canvas is real code you can export the moment it looks right.',
                    },
                    style: {
                      color: color('muted-foreground'),
                      maxWidth: '480px',
                      font: { size: '{size.lg}', lineHeight: '1.6' },
                    },
                  },
                  {
                    type: 'frame',
                    name: 'Actions',
                    style: { ...row(3), wrap: true },
                    children: [ctaButton('Start free', 'primary'), ctaButton('Book a demo', 'ghost')],
                  },
                ],
              },
              {
                type: 'frame',
                name: 'Visual',
                style: {
                  width: 'fill',
                  aspectRatio: '4/3',
                  radius: radius('2xl'),
                  overflow: 'hidden',
                  border: { width: 1, style: 'solid', color: color('border') },
                  background: color('muted'),
                  shadow: shadow('xl'),
                },
                children: [
                  {
                    type: 'image',
                    name: 'Screenshot',
                    props: { src: (props?.image as string) ?? '', alt: 'Product screenshot' },
                    style: { width: 'fill', height: 'fill' },
                  },
                ],
                motion: {
                  engine: 'css',
                  trigger: 'in-view',
                  from: { opacity: 0, y: 24, scale: 0.98 },
                  to: { opacity: 1, y: 0, scale: 1 },
                  duration: 700,
                },
              },
            ],
          },
        ],
      },
      createId,
    ),
};

export const featureGrid: ComponentContribution = {
  id: 'lib:feature-grid',
  name: 'Feature grid',
  category: 'Landing Pages',
  keywords: ['features', 'benefits', 'three column'],
  props: [
    { name: 'title', type: 'string', defaultValue: 'Everything you need, nothing you do not' },
    { name: 'columns', type: 'number', defaultValue: 3 },
  ],
  create: ({ createId, props }) => {
    const columns = typeof props?.columns === 'number' ? props.columns : 3;
    const features = [
      { title: 'AI that edits, not guesses', body: 'Prompts turn into precise document operations you can undo.' },
      { title: 'Design tokens everywhere', body: 'Change one token and the whole project follows, exports included.' },
      { title: 'Clean code on the way out', body: 'Export React, Vue, Svelte or plain HTML with no runtime lock-in.' },
      { title: 'Plugin-first architecture', body: 'Blocks, exporters and model providers all use the same public API.' },
      { title: 'Real responsive editing', body: 'Per-breakpoint overrides that mirror how CSS actually cascades.' },
      { title: 'Versioning built in', body: 'Snapshots and branches so experiments never cost you working state.' },
    ].slice(0, Math.max(columns * 2, 3));

    return buildTree(
      {
        type: 'frame',
        name: 'Features',
        style: section({ padding: pad(20, 6), background: color('background') }),
        children: [
          {
            type: 'frame',
            name: 'Content',
            style: container(column(12)),
            children: [
              {
                type: 'heading',
                name: 'Section title',
                props: {
                  text: (props?.title as string) ?? 'Everything you need, nothing you do not',
                  level: 'h2',
                },
                style: {
                  color: color('foreground'),
                  maxWidth: '640px',
                  font: {
                    size: '{size.3xl}',
                    weight: 600,
                    lineHeight: '1.2',
                    letterSpacing: '-0.02em',
                  },
                },
              },
              {
                type: 'frame',
                name: 'Grid',
                style: { display: 'grid', gridColumns: 1, gap: space(6), width: 'fill' },
                responsive: { md: { gridColumns: 2 }, lg: { gridColumns: columns } },
                children: features.map((feature) => ({
                  type: 'frame',
                  name: feature.title,
                  style: {
                    ...column(3),
                    padding: pad(6),
                    radius: radius('xl'),
                    background: color('card'),
                    border: { width: 1, style: 'solid', color: color('border') },
                  },
                  motion: {
                    engine: 'css',
                    trigger: 'in-view',
                    from: { opacity: 0, y: 16 },
                    to: { opacity: 1, y: 0 },
                    duration: 500,
                  },
                  children: [
                    {
                      type: 'icon',
                      name: 'Icon',
                      props: { name: 'sparkles' },
                      style: {
                        width: 36,
                        height: 36,
                        radius: radius('md'),
                        background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
                        color: color('accent'),
                      },
                    },
                    {
                      type: 'heading',
                      name: 'Title',
                      props: { text: feature.title, level: 'h3' },
                      style: {
                        color: color('foreground'),
                        font: { size: '{size.base}', weight: 600 },
                      },
                    },
                    {
                      type: 'text',
                      name: 'Body',
                      props: { text: feature.body },
                      style: {
                        color: color('muted-foreground'),
                        font: { size: '{size.sm}', lineHeight: '1.6' },
                      },
                    },
                  ],
                })),
              },
            ],
          },
        ],
      },
      createId,
    );
  },
};

export const testimonials: ComponentContribution = {
  id: 'lib:testimonials',
  name: 'Testimonials',
  category: 'Landing Pages',
  keywords: ['social proof', 'quotes', 'reviews'],
  props: [{ name: 'title', type: 'string', defaultValue: 'Teams ship faster with OpenDesign' }],
  create: ({ createId, props }) => {
    const quotes = [
      { quote: 'We replaced three tools with one canvas and the handoff meeting disappeared.', name: 'Ana Ribeiro', role: 'Design lead, Northwind' },
      { quote: 'The exported code passed review untouched. That has never happened before.', name: 'Marcus Lee', role: 'Staff engineer, Kestrel' },
      { quote: 'Branching designs like code changed how our team runs experiments.', name: 'Priya Nair', role: 'Head of product, Lumen' },
    ];

    return buildTree(
      {
        type: 'frame',
        name: 'Testimonials',
        style: section({ padding: pad(20, 6), background: color('muted') }),
        children: [
          {
            type: 'frame',
            name: 'Content',
            style: container(column(10)),
            children: [
              {
                type: 'heading',
                name: 'Section title',
                props: {
                  text: (props?.title as string) ?? 'Teams ship faster with OpenDesign',
                  level: 'h2',
                },
                style: {
                  color: color('foreground'),
                  font: { size: '{size.3xl}', weight: 600, letterSpacing: '-0.02em' },
                },
              },
              {
                type: 'frame',
                name: 'Grid',
                style: { display: 'grid', gridColumns: 1, gap: space(6), width: 'fill' },
                responsive: { md: { gridColumns: 3 } },
                children: quotes.map((item) => ({
                  type: 'frame',
                  name: item.name,
                  style: {
                    ...column(5),
                    padding: pad(6),
                    radius: radius('xl'),
                    background: color('card'),
                    border: { width: 1, style: 'solid', color: color('border') },
                  },
                  children: [
                    {
                      type: 'text',
                      name: 'Quote',
                      props: { text: `“${item.quote}”` },
                      style: {
                        color: color('foreground'),
                        font: { size: '{size.base}', lineHeight: '1.6' },
                      },
                    },
                    {
                      type: 'frame',
                      name: 'Author',
                      style: row(3),
                      children: [
                        {
                          type: 'frame',
                          name: 'Avatar',
                          style: {
                            width: 36,
                            height: 36,
                            radius: radius('full'),
                            background: color('muted'),
                          },
                        },
                        {
                          type: 'frame',
                          name: 'Meta',
                          style: column(0),
                          children: [
                            {
                              type: 'text',
                              name: 'Name',
                              props: { text: item.name },
                              style: {
                                color: color('foreground'),
                                font: { size: '{size.sm}', weight: 500 },
                              },
                            },
                            {
                              type: 'text',
                              name: 'Role',
                              props: { text: item.role },
                              style: {
                                color: color('muted-foreground'),
                                font: { size: '{size.xs}' },
                              },
                            },
                          ],
                        },
                      ],
                    },
                  ],
                })),
              },
            ],
          },
        ],
      },
      createId,
    );
  },
};

export const ctaBanner: ComponentContribution = {
  id: 'lib:cta-banner',
  name: 'CTA banner',
  category: 'Landing Pages',
  keywords: ['call to action', 'conversion', 'signup'],
  props: [
    { name: 'title', type: 'string', defaultValue: 'Start designing in the open' },
    { name: 'subtitle', type: 'string', defaultValue: 'Free forever, self-hostable, MIT licensed.' },
    { name: 'cta', type: 'string', defaultValue: 'Create your first project' },
  ],
  create: ({ createId, props }) =>
    buildTree(
      {
        type: 'frame',
        name: 'CTA banner',
        style: section({ padding: pad(20, 6), background: color('background') }),
        children: [
          {
            type: 'frame',
            name: 'Panel',
            style: container({
              ...column(6),
              align: 'center',
              padding: pad(16, 8),
              radius: radius('2xl'),
              background:
                'linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 20%, transparent), color-mix(in srgb, var(--color-accent) 4%, transparent))',
              border: {
                width: 1,
                style: 'solid',
                color: 'color-mix(in srgb, var(--color-accent) 28%, transparent)',
              },
              shadow: shadow('lg'),
            }),
            children: [
              {
                type: 'heading',
                name: 'Title',
                props: { text: (props?.title as string) ?? 'Start designing in the open', level: 'h2' },
                style: {
                  color: color('foreground'),
                  font: {
                    size: '{size.3xl}',
                    weight: 600,
                    align: 'center',
                    letterSpacing: '-0.02em',
                  },
                },
              },
              {
                type: 'text',
                name: 'Subtitle',
                props: {
                  text: (props?.subtitle as string) ?? 'Free forever, self-hostable, MIT licensed.',
                },
                style: {
                  color: color('muted-foreground'),
                  font: { size: '{size.base}', align: 'center' },
                },
              },
              ctaButton((props?.cta as string) ?? 'Create your first project', 'primary'),
            ],
          },
        ],
      },
      createId,
    ),
};

export const logoCloud: ComponentContribution = {
  id: 'lib:logo-cloud',
  name: 'Logo cloud',
  category: 'Landing Pages',
  keywords: ['brands', 'customers', 'trusted by'],
  props: [{ name: 'title', type: 'string', defaultValue: 'Trusted by teams at' }],
  create: ({ createId, props }) =>
    buildTree(
      {
        type: 'frame',
        name: 'Logo cloud',
        style: section({ padding: pad(12, 6), align: 'center', background: color('background') }),
        children: [
          {
            type: 'frame',
            name: 'Content',
            style: container({ ...column(6), align: 'center' }),
            children: [
              {
                type: 'text',
                name: 'Label',
                props: { text: (props?.title as string) ?? 'Trusted by teams at' },
                style: {
                  color: color('muted-foreground'),
                  font: {
                    size: '{size.xs}',
                    weight: 500,
                    letterSpacing: '0.1em',
                    transform: 'uppercase',
                  },
                },
              },
              {
                type: 'frame',
                name: 'Logos',
                style: { ...row(10), justify: 'center', wrap: true, opacity: 0.6 },
                children: ['Northwind', 'Kestrel', 'Lumen', 'Vireo', 'Halcyon'].map((name) => ({
                  type: 'text',
                  name,
                  props: { text: name },
                  style: {
                    color: color('foreground'),
                    font: { size: '{size.lg}', weight: 600, letterSpacing: '-0.01em' },
                  },
                })),
              },
            ],
          },
        ],
      },
      createId,
    ),
};
