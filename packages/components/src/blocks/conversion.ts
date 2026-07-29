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

/** Pricing and FAQ — the two sections that decide whether a visitor converts. */

interface Tier {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  featured?: boolean;
  cta: string;
}

const DEFAULT_TIERS: Tier[] = [
  {
    name: 'Free',
    price: '$0',
    period: '/forever',
    description: 'Everything you need to design solo.',
    features: ['Unlimited projects', 'All export targets', 'Bring your own model key', 'Community support'],
    cta: 'Start free',
  },
  {
    name: 'Team',
    price: '$18',
    period: '/user / month',
    description: 'Realtime collaboration and shared systems.',
    features: [
      'Everything in Free',
      'Realtime multiplayer editing',
      'Shared design system',
      'Branch reviews',
      'Priority support',
    ],
    featured: true,
    cta: 'Start 14-day trial',
  },
  {
    name: 'Self-hosted',
    price: 'Free',
    period: '/MIT licensed',
    description: 'Run the whole platform on your own infrastructure.',
    features: ['Full source code', 'Local model providers', 'SSO via your IdP', 'No usage limits'],
    cta: 'Read the guide',
  },
];

function tierCard(tier: Tier): NodeSpec {
  return {
    type: 'frame',
    name: `${tier.name} tier`,
    style: {
      ...column(6),
      padding: pad(8, 6),
      radius: radius('2xl'),
      background: color('card'),
      border: {
        width: tier.featured ? 2 : 1,
        style: 'solid',
        color: tier.featured ? color('accent') : color('border'),
      },
      ...(tier.featured ? { shadow: shadow('xl') } : {}),
    },
    children: [
      {
        type: 'frame',
        name: 'Header',
        style: column(2),
        children: [
          {
            type: 'frame',
            name: 'Name row',
            style: { ...row(3), justify: 'between' },
            children: [
              {
                type: 'text',
                name: 'Name',
                props: { text: tier.name },
                style: { color: color('foreground'), font: { size: '{size.base}', weight: 600 } },
              },
              ...(tier.featured
                ? [
                    {
                      type: 'text',
                      name: 'Badge',
                      props: { text: 'Most popular', as: 'span' },
                      style: {
                        padding: pad(1, 3),
                        radius: radius('full'),
                        background: 'color-mix(in srgb, var(--color-accent) 16%, transparent)',
                        color: color('accent'),
                        font: { size: '{size.xs}', weight: 500 },
                      },
                    } satisfies NodeSpec,
                  ]
                : []),
            ],
          },
          {
            type: 'text',
            name: 'Description',
            props: { text: tier.description },
            style: {
              color: color('muted-foreground'),
              font: { size: '{size.sm}', lineHeight: '1.6' },
            },
          },
        ],
      },
      {
        type: 'frame',
        name: 'Price',
        style: { ...row(2), align: 'baseline' },
        children: [
          {
            type: 'text',
            name: 'Amount',
            props: { text: tier.price },
            style: {
              color: color('foreground'),
              font: { size: '{size.4xl}', weight: 600, letterSpacing: '-0.03em' },
            },
          },
          {
            type: 'text',
            name: 'Period',
            props: { text: tier.period },
            style: { color: color('muted-foreground'), font: { size: '{size.sm}' } },
          },
        ],
      },
      {
        type: 'button',
        name: 'CTA',
        props: { text: tier.cta },
        style: {
          display: 'flex',
          justify: 'center',
          align: 'center',
          width: 'fill',
          padding: pad(3, 5),
          radius: radius('md'),
          cursor: 'pointer',
          font: { size: '{size.sm}', weight: 500 },
          ...(tier.featured
            ? { background: color('accent'), color: color('accent-foreground') }
            : {
                background: 'transparent',
                color: color('foreground'),
                border: { width: 1, style: 'solid' as const, color: color('border') },
              }),
        },
      },
      {
        type: 'frame',
        name: 'Features',
        style: column(3),
        children: tier.features.map((feature) => ({
          type: 'frame',
          name: feature,
          style: { ...row(3), align: 'start' },
          children: [
            {
              type: 'icon',
              name: 'Check',
              props: { name: 'check' },
              style: { width: 16, height: 16, color: color('accent') },
            },
            {
              type: 'text',
              name: 'Label',
              props: { text: feature },
              style: {
                color: color('muted-foreground'),
                font: { size: '{size.sm}', lineHeight: '1.5' },
              },
            },
          ],
        })),
      },
    ],
  };
}

export const pricingTable: ComponentContribution = {
  id: 'lib:pricing-table',
  name: 'Pricing table',
  category: 'Pricing',
  keywords: ['plans', 'tiers', 'subscription', 'billing'],
  description: 'Three-tier pricing grid with a highlighted plan.',
  props: [
    { name: 'title', type: 'string', defaultValue: 'Pricing that stays out of the way' },
    { name: 'subtitle', type: 'string', defaultValue: 'Open source core, paid only where teams need it.' },
  ],
  create: ({ createId, props }) =>
    buildTree(
      {
        type: 'frame',
        name: 'Pricing',
        style: section({ padding: pad(20, 6), align: 'center', background: color('background') }),
        children: [
          {
            type: 'frame',
            name: 'Content',
            style: container({ ...column(12), align: 'center' }),
            children: [
              {
                type: 'frame',
                name: 'Heading',
                style: { ...column(4), align: 'center', maxWidth: '640px' },
                children: [
                  {
                    type: 'heading',
                    name: 'Title',
                    props: {
                      text: (props?.title as string) ?? 'Pricing that stays out of the way',
                      level: 'h2',
                    },
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
                      text:
                        (props?.subtitle as string) ??
                        'Open source core, paid only where teams need it.',
                    },
                    style: {
                      color: color('muted-foreground'),
                      font: { size: '{size.base}', align: 'center', lineHeight: '1.6' },
                    },
                  },
                ],
              },
              {
                type: 'frame',
                name: 'Tiers',
                style: {
                  display: 'grid',
                  gridColumns: 1,
                  gap: space(6),
                  width: 'fill',
                  align: 'stretch',
                },
                responsive: { lg: { gridColumns: 3 } },
                children: DEFAULT_TIERS.map(tierCard),
              },
            ],
          },
        ],
      },
      createId,
    ),
};

const DEFAULT_FAQ = [
  {
    q: 'Is OpenDesign really free?',
    a: 'The entire platform is MIT licensed and self-hostable. Hosted collaboration is the only paid part, and you can always run it yourself instead.',
  },
  {
    q: 'Which AI models can I use?',
    a: 'Any of them. Claude, GPT, Gemini, DeepSeek, OpenRouter, plus fully local Ollama and LM Studio. Providers are plugins, so adding one is a small file.',
  },
  {
    q: 'What does the exported code look like?',
    a: 'Idiomatic components with Tailwind classes and design tokens — no proprietary runtime, no wrapper divs, nothing you would be embarrassed to commit.',
  },
  {
    q: 'Can I keep my data on my own machine?',
    a: 'Yes. Point the provider at a local model, use the local storage adapter, and no part of your project leaves your network.',
  },
];

export const faqSection: ComponentContribution = {
  id: 'lib:faq',
  name: 'FAQ',
  category: 'FAQ',
  keywords: ['questions', 'accordion', 'support'],
  props: [{ name: 'title', type: 'string', defaultValue: 'Frequently asked questions' }],
  create: ({ createId, props }) =>
    buildTree(
      {
        type: 'frame',
        name: 'FAQ',
        style: section({ padding: pad(20, 6), background: color('background') }),
        children: [
          {
            type: 'frame',
            name: 'Content',
            style: container({
              display: 'grid',
              gridColumns: 1,
              gap: space(10),
              maxWidth: '1000px',
            }),
            responsive: { lg: { gridColumns: '1fr 1.6fr' } },
            children: [
              {
                type: 'heading',
                name: 'Title',
                props: { text: (props?.title as string) ?? 'Frequently asked questions', level: 'h2' },
                style: {
                  color: color('foreground'),
                  font: { size: '{size.3xl}', weight: 600, letterSpacing: '-0.02em' },
                },
              },
              {
                type: 'frame',
                name: 'Questions',
                style: column(0),
                children: DEFAULT_FAQ.map((item) => ({
                  type: 'frame',
                  name: item.q,
                  style: {
                    ...column(2),
                    padding: pad(5, 0),
                    border: { width: 1, style: 'solid', color: color('border') },
                  },
                  children: [
                    {
                      type: 'heading',
                      name: 'Question',
                      props: { text: item.q, level: 'h3' },
                      style: {
                        color: color('foreground'),
                        font: { size: '{size.base}', weight: 500 },
                      },
                    },
                    {
                      type: 'text',
                      name: 'Answer',
                      props: { text: item.a },
                      style: {
                        color: color('muted-foreground'),
                        maxWidth: '620px',
                        font: { size: '{size.sm}', lineHeight: '1.7' },
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
    ),
};
