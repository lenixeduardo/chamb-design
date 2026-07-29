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
} from '@opendesign/components';

/**
 * Brand-specific blocks.
 *
 * These exist because the generic library is deliberately neutral. The
 * chamb voice needs three things the neutral blocks do not do: a serif italic
 * display line mixed into a sans headline, pill actions with a coloured lift,
 * and inverted dark cards used as punctuation against the cream.
 */

/** Pill button with the signature coloured shadow. */
function pill(text: string, variant: 'primary' | 'outline' = 'primary'): NodeSpec {
  return {
    type: 'button',
    name: variant === 'primary' ? 'Primary action' : 'Secondary action',
    props: { text },
    style: {
      display: 'inline-flex',
      justify: 'center',
      align: 'center',
      padding: pad(4, 6),
      radius: radius('full'),
      cursor: 'pointer',
      transition: 'all 180ms cubic-bezier(0.16, 1, 0.3, 1)',
      font: { size: '{size.sm}', weight: 500 },
      ...(variant === 'primary'
        ? {
            background: color('accent'),
            color: color('accent-foreground'),
            shadow: shadow('signal'),
          }
        : {
            background: color('card'),
            color: color('foreground'),
            border: { width: 1, style: 'solid' as const, color: color('border') },
            shadow: shadow('sm'),
          }),
    },
    motion: { engine: 'css', trigger: 'hover', to: { y: -2 }, duration: 200 },
  };
}

/** The eyebrow: uppercase, wide tracking, tiny. Used everywhere. */
function eyebrow(text: string): NodeSpec {
  return {
    type: 'text',
    name: 'Eyebrow',
    props: { text, as: 'span' },
    style: {
      color: color('muted-foreground'),
      font: {
        size: '{size.xs}',
        weight: 500,
        letterSpacing: '0.18em',
        transform: 'uppercase',
      },
    },
  };
}

export const chambHero: ComponentContribution = {
  id: 'chamb:hero',
  name: 'Hero — chamb',
  category: 'Hero',
  keywords: ['brand', 'cream', 'serif', 'charm'],
  description: 'Sans headline with a serif italic second line, on warm cream.',
  props: [
    { name: 'eyebrow', type: 'string', defaultValue: 'Design com velocidade e charme' },
    { name: 'title', type: 'string', defaultValue: 'Interfaces que as pessoas' },
    { name: 'accent', type: 'string', defaultValue: 'amam de verdade' },
    {
      name: 'subtitle',
      type: 'string',
      defaultValue:
        'Descreva o que você quer, veja aparecer no canvas, e ajuste cada pixel à mão. Código limpo na saída.',
    },
    { name: 'primaryCta', type: 'string', defaultValue: 'Começar agora' },
    { name: 'secondaryCta', type: 'string', defaultValue: 'Ver a documentação' },
  ],
  create: ({ createId, props }) =>
    buildTree(
      {
        type: 'frame',
        name: 'Hero',
        style: section({ align: 'center', padding: pad(20, 6), background: color('background') }),
        responsive: { md: { padding: pad(32, 10) } },
        children: [
          {
            type: 'frame',
            name: 'Content',
            style: container({ ...column(6), align: 'center', maxWidth: '820px' }),
            children: [
              eyebrow((props?.eyebrow as string) ?? 'Design com velocidade e charme'),
              {
                type: 'heading',
                name: 'Headline',
                props: {
                  text: (props?.title as string) ?? 'Interfaces que as pessoas',
                  level: 'h1',
                },
                style: {
                  color: color('foreground'),
                  font: {
                    family: '{font.sans}',
                    size: '{size.4xl}',
                    weight: 600,
                    lineHeight: '1.05',
                    letterSpacing: '-0.035em',
                    align: 'center',
                  },
                },
                responsive: { md: { font: { size: '{size.6xl}' } } },
                motion: {
                  engine: 'css',
                  trigger: 'mount',
                  from: { opacity: 0, y: 14 },
                  to: { opacity: 1, y: 0 },
                  duration: 700,
                },
              },
              {
                // The serif italic line. Mixing families inside one headline is
                // the single move that makes this brand recognisable.
                type: 'heading',
                name: 'Accent line',
                props: { text: (props?.accent as string) ?? 'amam de verdade', level: 'h2' },
                style: {
                  color: color('accent'),
                  margin: { top: '-8px' },
                  font: {
                    family: '{font.display}',
                    size: '{size.5xl}',
                    weight: 300,
                    italic: true,
                    lineHeight: '1.0',
                    letterSpacing: '-0.02em',
                    align: 'center',
                  },
                },
                responsive: { md: { font: { size: '{size.7xl}' } } },
                motion: {
                  engine: 'css',
                  trigger: 'mount',
                  from: { opacity: 0, y: 14 },
                  to: { opacity: 1, y: 0 },
                  duration: 700,
                  delay: 90,
                },
              },
              {
                type: 'text',
                name: 'Subheadline',
                props: {
                  text:
                    (props?.subtitle as string) ??
                    'Descreva o que você quer, veja aparecer no canvas, e ajuste cada pixel à mão.',
                },
                style: {
                  color: color('muted-foreground'),
                  maxWidth: '560px',
                  font: { size: '{size.lg}', lineHeight: '1.6', align: 'center' },
                },
              },
              {
                type: 'frame',
                name: 'Actions',
                style: { ...row(3), justify: 'center', wrap: true },
                children: [
                  pill((props?.primaryCta as string) ?? 'Começar agora', 'primary'),
                  pill((props?.secondaryCta as string) ?? 'Ver a documentação', 'outline'),
                ],
              },
              {
                type: 'text',
                name: 'Social proof',
                props: { text: '★★★★★  2.000+ designers apaixonados' },
                style: {
                  color: color('muted-foreground'),
                  font: { size: '{size.xs}', weight: 500, letterSpacing: '0.06em' },
                },
              },
            ],
          },
        ],
      },
      createId,
    ),
};

export const chambFeatureCards: ComponentContribution = {
  id: 'chamb:feature-cards',
  name: 'Feature cards — chamb',
  category: 'Landing Pages',
  keywords: ['brand', 'features', 'inverted card'],
  description: 'Feature grid where one card inverts to dark as punctuation.',
  props: [
    { name: 'title', type: 'string', defaultValue: 'Tudo que encanta.' },
    { name: 'accent', type: 'string', defaultValue: 'Nada que distrai.' },
  ],
  create: ({ createId, props }) => {
    const features = [
      {
        title: 'IA que edita, não adivinha',
        body: 'Prompts viram operações precisas no documento — reversíveis com ⌘Z.',
        invert: false,
      },
      {
        title: 'Tokens em tudo',
        body: 'Mude uma cor e o projeto inteiro segue, inclusive o código exportado.',
        invert: true,
      },
      {
        title: 'Código limpo na saída',
        body: 'React, Vue, Svelte ou HTML puro. Sem runtime proprietário.',
        invert: false,
      },
    ];

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
                type: 'frame',
                name: 'Heading',
                style: column(0),
                children: [
                  {
                    type: 'heading',
                    name: 'Title',
                    props: { text: (props?.title as string) ?? 'Tudo que encanta.', level: 'h2' },
                    style: {
                      color: color('foreground'),
                      font: {
                        size: '{size.3xl}',
                        weight: 600,
                        letterSpacing: '-0.03em',
                        lineHeight: '1.1',
                      },
                    },
                  },
                  {
                    type: 'heading',
                    name: 'Accent',
                    props: { text: (props?.accent as string) ?? 'Nada que distrai.', level: 'h3' },
                    style: {
                      color: color('accent'),
                      font: {
                        family: '{font.display}',
                        size: '{size.4xl}',
                        weight: 300,
                        italic: true,
                        lineHeight: '1.1',
                        letterSpacing: '-0.02em',
                      },
                    },
                  },
                ],
              },
              {
                type: 'frame',
                name: 'Grid',
                style: { display: 'grid', gridColumns: 1, gap: space(5), width: 'fill' },
                responsive: { md: { gridColumns: 3 } },
                children: features.map((feature) => ({
                  type: 'frame',
                  name: feature.title,
                  style: {
                    ...column(4),
                    padding: pad(8, 6),
                    radius: radius('2xl'),
                    background: feature.invert ? color('contrast') : color('card'),
                    border: {
                      width: 1,
                      style: 'solid' as const,
                      color: feature.invert ? color('contrast') : color('border'),
                    },
                    shadow: feature.invert ? shadow('lg') : shadow('sm'),
                  },
                  motion: {
                    engine: 'css' as const,
                    trigger: 'in-view' as const,
                    from: { opacity: 0, y: 18 },
                    to: { opacity: 1, y: 0 },
                    duration: 600,
                  },
                  children: [
                    {
                      type: 'frame',
                      name: 'Dot',
                      style: {
                        width: 32,
                        height: 32,
                        radius: radius('full'),
                        background: color('accent'),
                        shadow: shadow('signal'),
                      },
                    },
                    {
                      type: 'heading',
                      name: 'Title',
                      props: { text: feature.title, level: 'h4' },
                      style: {
                        color: feature.invert ? color('contrast-foreground') : color('foreground'),
                        font: { size: '{size.lg}', weight: 600, letterSpacing: '-0.01em' },
                      },
                    },
                    {
                      type: 'text',
                      name: 'Body',
                      props: { text: feature.body },
                      style: {
                        color: feature.invert
                          ? 'color-mix(in srgb, var(--color-contrast-foreground) 72%, transparent)'
                          : color('muted-foreground'),
                        font: { size: '{size.sm}', lineHeight: '1.65' },
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

export const chambShowcase: ComponentContribution = {
  id: 'chamb:showcase',
  name: 'Image showcase — chamb',
  category: 'Landing Pages',
  keywords: ['brand', 'image', 'mascot', 'generated'],
  description: 'A generated or uploaded image framed on cream, with copy beside it.',
  props: [
    { name: 'title', type: 'string', defaultValue: 'Sua marca, com personalidade' },
    {
      name: 'body',
      type: 'string',
      defaultValue: 'Gere ilustrações direto no editor e coloque no canvas.',
    },
    { name: 'image', type: 'image', defaultValue: '' },
    { name: 'alt', type: 'string', defaultValue: 'Ilustração da marca' },
  ],
  create: ({ createId, props }) =>
    buildTree(
      {
        type: 'frame',
        name: 'Showcase',
        style: section({ padding: pad(20, 6), background: color('muted') }),
        children: [
          {
            type: 'frame',
            name: 'Grid',
            style: container({
              display: 'grid',
              gridColumns: 1,
              gap: space(10),
              align: 'center',
            }),
            responsive: { lg: { gridColumns: 2, gap: space(16) } },
            children: [
              {
                type: 'frame',
                name: 'Copy',
                style: column(5),
                children: [
                  eyebrow('Assets'),
                  {
                    type: 'heading',
                    name: 'Title',
                    props: {
                      text: (props?.title as string) ?? 'Sua marca, com personalidade',
                      level: 'h2',
                    },
                    style: {
                      color: color('foreground'),
                      font: {
                        size: '{size.3xl}',
                        weight: 600,
                        lineHeight: '1.15',
                        letterSpacing: '-0.03em',
                      },
                    },
                  },
                  {
                    type: 'text',
                    name: 'Body',
                    props: {
                      text:
                        (props?.body as string) ??
                        'Gere ilustrações direto no editor e coloque no canvas.',
                    },
                    style: {
                      color: color('muted-foreground'),
                      maxWidth: '460px',
                      font: { size: '{size.base}', lineHeight: '1.65' },
                    },
                  },
                  pill('Gerar uma imagem', 'primary'),
                ],
              },
              {
                type: 'frame',
                name: 'Frame',
                style: {
                  display: 'flex',
                  justify: 'center',
                  align: 'center',
                  width: 'fill',
                  aspectRatio: '4/3',
                  padding: pad(6),
                  radius: radius('2xl'),
                  background: color('card'),
                  border: { width: 1, style: 'solid', color: color('border') },
                  shadow: shadow('xl'),
                  overflow: 'hidden',
                },
                children: [
                  {
                    type: 'image',
                    name: 'Illustration',
                    props: {
                      src: (props?.image as string) ?? '',
                      alt: (props?.alt as string) ?? 'Ilustração da marca',
                    },
                    style: {
                      width: 'fill',
                      height: 'fill',
                      radius: radius('xl'),
                      overflow: 'hidden',
                    },
                  },
                ],
                motion: {
                  engine: 'css',
                  trigger: 'in-view',
                  from: { opacity: 0, y: 20, scale: 0.98 },
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

export const chambCta: ComponentContribution = {
  id: 'chamb:cta',
  name: 'CTA — chamb',
  category: 'Landing Pages',
  keywords: ['brand', 'conversion', 'inverted'],
  description: 'Inverted dark panel with a serif italic line and a pill action.',
  props: [
    { name: 'title', type: 'string', defaultValue: 'Seu estúdio te espera' },
    { name: 'cta', type: 'string', defaultValue: 'Criar meu primeiro projeto' },
  ],
  create: ({ createId, props }) =>
    buildTree(
      {
        type: 'frame',
        name: 'CTA',
        style: section({ padding: pad(20, 6), background: color('background') }),
        children: [
          {
            type: 'frame',
            name: 'Panel',
            style: container({
              ...column(6),
              align: 'center',
              padding: pad(20, 8),
              radius: radius('2xl'),
              background: color('contrast'),
              shadow: shadow('xl'),
            }),
            children: [
              {
                type: 'heading',
                name: 'Title',
                props: { text: (props?.title as string) ?? 'Seu estúdio te espera', level: 'h2' },
                style: {
                  color: color('contrast-foreground'),
                  font: {
                    family: '{font.display}',
                    size: '{size.4xl}',
                    weight: 300,
                    italic: true,
                    align: 'center',
                    lineHeight: '1.1',
                  },
                },
                responsive: { md: { font: { size: '{size.6xl}' } } },
              },
              {
                type: 'text',
                name: 'Subtitle',
                props: { text: 'Open source, MIT, self-hostable. Sem cartão.' },
                style: {
                  color: 'color-mix(in srgb, var(--color-contrast-foreground) 65%, transparent)',
                  font: { size: '{size.sm}', align: 'center', letterSpacing: '0.02em' },
                },
              },
              pill((props?.cta as string) ?? 'Criar meu primeiro projeto', 'primary'),
            ],
          },
        ],
      },
      createId,
    ),
};

export const CHAMB_BLOCKS = [chambHero, chambFeatureCards, chambShowcase, chambCta];
