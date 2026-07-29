import type { ComponentContribution } from '@opendesign/core';
import { buildTree, color, column, pad, radius, row, shadow, space } from '../builder.js';

/**
 * Atoms. Everything larger in the library composes these, so a change to the
 * button here propagates to every hero, pricing table and form in the catalog.
 */

const BUTTON_VARIANTS = {
  primary: {
    background: color('accent'),
    color: color('accent-foreground'),
    border: { style: 'none' as const },
  },
  secondary: {
    background: color('muted'),
    color: color('foreground'),
    border: { width: 1, style: 'solid' as const, color: color('border') },
  },
  ghost: {
    background: 'transparent',
    color: color('foreground'),
    border: { style: 'none' as const },
  },
  outline: {
    background: 'transparent',
    color: color('foreground'),
    border: { width: 1, style: 'solid' as const, color: color('border') },
  },
};

const BUTTON_SIZES = {
  sm: { padding: pad(2, 3), font: { size: '{size.sm}' as const } },
  md: { padding: pad(3, 5), font: { size: '{size.sm}' as const } },
  lg: { padding: pad(4, 6), font: { size: '{size.base}' as const } },
};

export const button: ComponentContribution = {
  id: 'lib:button',
  name: 'Button',
  category: 'Buttons',
  keywords: ['cta', 'action', 'link'],
  description: 'Action button with variant and size props.',
  props: [
    { name: 'text', type: 'string', defaultValue: 'Get started' },
    {
      name: 'variant',
      type: 'enum',
      defaultValue: 'primary',
      options: Object.keys(BUTTON_VARIANTS).map((value) => ({ label: value, value })),
    },
    {
      name: 'size',
      type: 'enum',
      defaultValue: 'md',
      options: Object.keys(BUTTON_SIZES).map((value) => ({ label: value, value })),
    },
    { name: 'href', type: 'string' },
  ],
  create: ({ createId, props }) => {
    const variant = (props?.variant as keyof typeof BUTTON_VARIANTS) ?? 'primary';
    const size = (props?.size as keyof typeof BUTTON_SIZES) ?? 'md';

    return buildTree(
      {
        type: 'button',
        name: 'Button',
        props: {
          text: (props?.text as string) ?? 'Get started',
          ...(props?.href ? { href: props.href } : {}),
        },
        style: {
          display: 'inline-flex',
          justify: 'center',
          align: 'center',
          gap: space(2),
          radius: radius('md'),
          cursor: 'pointer',
          transition: 'all 160ms ease',
          ...BUTTON_SIZES[size],
          ...BUTTON_VARIANTS[variant],
          font: { ...BUTTON_SIZES[size].font, weight: 500 },
        },
        motion: { engine: 'css', trigger: 'tap', to: { scale: 0.97 }, duration: 120 },
      },
      createId,
    );
  },
};

export const card: ComponentContribution = {
  id: 'lib:card',
  name: 'Card',
  category: 'Cards',
  keywords: ['panel', 'surface', 'tile'],
  description: 'Surface with a title, body copy and optional glass treatment.',
  props: [
    { name: 'title', type: 'string', defaultValue: 'Card title' },
    { name: 'body', type: 'string', defaultValue: 'Supporting copy that explains the card.' },
    { name: 'glass', type: 'boolean', defaultValue: false },
  ],
  create: ({ createId, props }) => {
    const glass = Boolean(props?.glass);

    return buildTree(
      {
        type: 'frame',
        name: 'Card',
        style: {
          ...column(3),
          padding: pad(6),
          radius: radius('xl'),
          background: glass
            ? 'color-mix(in srgb, var(--color-card) 60%, transparent)'
            : color('card'),
          border: { width: 1, style: 'solid', color: color('border') },
          shadow: glass ? shadow('glass') : shadow('sm'),
          ...(glass ? { backdropBlur: 16 } : {}),
        },
        children: [
          {
            type: 'heading',
            name: 'Title',
            props: { text: (props?.title as string) ?? 'Card title', level: 'h3' },
            style: { font: { size: '{size.lg}', weight: 600 }, color: color('foreground') },
          },
          {
            type: 'text',
            name: 'Body',
            props: {
              text: (props?.body as string) ?? 'Supporting copy that explains the card.',
            },
            style: {
              font: { size: '{size.sm}', lineHeight: '1.6' },
              color: color('muted-foreground'),
            },
          },
        ],
      },
      createId,
    );
  },
};

export const badge: ComponentContribution = {
  id: 'lib:badge',
  name: 'Badge',
  category: 'Cards',
  keywords: ['tag', 'chip', 'label', 'pill'],
  props: [{ name: 'text', type: 'string', defaultValue: 'New' }],
  create: ({ createId, props }) =>
    buildTree(
      {
        type: 'text',
        name: 'Badge',
        props: { text: (props?.text as string) ?? 'New', as: 'span' },
        style: {
          display: 'inline-flex',
          align: 'center',
          padding: pad(1, 3),
          radius: radius('full'),
          background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
          color: color('accent'),
          border: {
            width: 1,
            style: 'solid',
            color: 'color-mix(in srgb, var(--color-accent) 24%, transparent)',
          },
          font: { size: '{size.xs}', weight: 500, letterSpacing: '0.02em' },
        },
      },
      createId,
    ),
};

export const avatar: ComponentContribution = {
  id: 'lib:avatar',
  name: 'Avatar',
  category: 'Cards',
  keywords: ['user', 'profile', 'picture'],
  props: [
    { name: 'src', type: 'image', defaultValue: '' },
    { name: 'alt', type: 'string', defaultValue: 'User avatar' },
    { name: 'size', type: 'number', defaultValue: 40 },
  ],
  create: ({ createId, props }) => {
    const size = typeof props?.size === 'number' ? props.size : 40;
    return buildTree(
      {
        type: 'image',
        name: 'Avatar',
        props: { src: (props?.src as string) ?? '', alt: (props?.alt as string) ?? 'User avatar' },
        style: {
          width: size,
          height: size,
          radius: radius('full'),
          background: color('muted'),
          overflow: 'hidden',
        },
      },
      createId,
    );
  },
};

export const statTile: ComponentContribution = {
  id: 'lib:stat-tile',
  name: 'Stat tile',
  category: 'Dashboard',
  keywords: ['kpi', 'metric', 'number'],
  props: [
    { name: 'label', type: 'string', defaultValue: 'Monthly revenue' },
    { name: 'value', type: 'string', defaultValue: '$48,120' },
    { name: 'delta', type: 'string', defaultValue: '+12.4%' },
  ],
  create: ({ createId, props }) =>
    buildTree(
      {
        type: 'frame',
        name: 'Stat tile',
        style: {
          ...column(2),
          padding: pad(5),
          radius: radius('lg'),
          background: color('card'),
          border: { width: 1, style: 'solid', color: color('border') },
        },
        children: [
          {
            type: 'text',
            name: 'Label',
            props: { text: (props?.label as string) ?? 'Monthly revenue' },
            style: {
              font: {
                size: '{size.xs}',
                weight: 500,
                letterSpacing: '0.08em',
                transform: 'uppercase',
              },
              color: color('muted-foreground'),
            },
          },
          {
            type: 'frame',
            name: 'Value row',
            style: row(3, { align: 'baseline' }),
            children: [
              {
                type: 'text',
                name: 'Value',
                props: { text: (props?.value as string) ?? '$48,120' },
                style: { font: { size: '{size.3xl}', weight: 600 }, color: color('foreground') },
              },
              {
                type: 'text',
                name: 'Delta',
                props: { text: (props?.delta as string) ?? '+12.4%' },
                style: { font: { size: '{size.sm}', weight: 500 }, color: color('success.500') },
              },
            ],
          },
        ],
      },
      createId,
    ),
};
