import type { ComponentContribution } from '@opendesign/core';
import { buildTree, color, column, container, pad, radius, row, space } from '../builder.js';

export const navbar: ComponentContribution = {
  id: 'lib:navbar',
  name: 'Navbar',
  category: 'Navbar',
  keywords: ['header', 'navigation', 'menu'],
  description: 'Sticky glass navigation bar with brand, links and a call to action.',
  props: [
    { name: 'brand', type: 'string', defaultValue: 'Charm-Design' },
    { name: 'links', type: 'string', defaultValue: 'Product,Templates,Docs,Pricing' },
    { name: 'cta', type: 'string', defaultValue: 'Get started' },
    { name: 'sticky', type: 'boolean', defaultValue: true },
  ],
  create: ({ createId, props }) => {
    const links = String(props?.links ?? 'Product,Templates,Docs,Pricing')
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean);

    return buildTree(
      {
        type: 'frame',
        name: 'Navbar',
        style: {
          display: 'flex',
          align: 'center',
          width: 'fill',
          height: 64,
          padding: pad(0, 6),
          background: 'color-mix(in srgb, var(--color-background) 72%, transparent)',
          backdropBlur: 16,
          border: { width: 1, style: 'solid', color: color('border') },
          ...(props?.sticky === false
            ? {}
            : { position: 'sticky' as const, inset: { top: 0 }, zIndex: 50 }),
        },
        children: [
          {
            type: 'frame',
            name: 'Content',
            style: container({ ...row(6), justify: 'between' }),
            children: [
              {
                type: 'frame',
                name: 'Brand',
                style: row(2),
                children: [
                  {
                    type: 'frame',
                    name: 'Mark',
                    style: {
                      width: 26,
                      height: 26,
                      radius: radius('md'),
                      background: color('accent'),
                    },
                  },
                  {
                    type: 'text',
                    name: 'Wordmark',
                    props: { text: (props?.brand as string) ?? 'Charm-Design' },
                    style: {
                      color: color('foreground'),
                      font: { size: '{size.base}', weight: 600, letterSpacing: '-0.01em' },
                    },
                  },
                ],
              },
              {
                type: 'frame',
                name: 'Links',
                style: { ...row(6), display: 'none' },
                responsive: { md: { display: 'flex' } },
                children: links.map((label) => ({
                  type: 'link',
                  name: label,
                  props: { text: label, href: `#${label.toLowerCase()}` },
                  style: {
                    color: color('muted-foreground'),
                    cursor: 'pointer',
                    transition: 'color 160ms ease',
                    font: { size: '{size.sm}', weight: 500 },
                  },
                })),
              },
              {
                type: 'frame',
                name: 'Actions',
                style: row(3),
                children: [
                  {
                    type: 'button',
                    name: 'CTA',
                    props: { text: (props?.cta as string) ?? 'Get started' },
                    style: {
                      display: 'inline-flex',
                      align: 'center',
                      justify: 'center',
                      padding: pad(2, 4),
                      radius: radius('md'),
                      background: color('accent'),
                      color: color('accent-foreground'),
                      cursor: 'pointer',
                      font: { size: '{size.sm}', weight: 500 },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      createId,
    );
  },
};

export const footer: ComponentContribution = {
  id: 'lib:footer',
  name: 'Footer',
  category: 'Footer',
  keywords: ['bottom', 'sitemap', 'legal'],
  props: [
    { name: 'brand', type: 'string', defaultValue: 'Charm-Design' },
    { name: 'tagline', type: 'string', defaultValue: 'The open source AI design platform.' },
  ],
  create: ({ createId, props }) => {
    const groups = [
      { title: 'Product', items: ['Editor', 'Templates', 'Plugins', 'Changelog'] },
      { title: 'Developers', items: ['Documentation', 'Plugin API', 'Self-hosting', 'GitHub'] },
      { title: 'Company', items: ['About', 'Blog', 'Community', 'Contact'] },
    ];

    return buildTree(
      {
        type: 'frame',
        name: 'Footer',
        style: {
          display: 'flex',
          direction: 'column',
          width: 'fill',
          padding: pad(16, 6),
          background: color('background'),
          border: { width: 1, style: 'solid', color: color('border') },
        },
        children: [
          {
            type: 'frame',
            name: 'Content',
            style: container(column(12)),
            children: [
              {
                type: 'frame',
                name: 'Columns',
                style: { display: 'grid', gridColumns: 1, gap: space(10), width: 'fill' },
                responsive: { md: { gridColumns: 4 } },
                children: [
                  {
                    type: 'frame',
                    name: 'Brand',
                    style: column(3),
                    children: [
                      {
                        type: 'text',
                        name: 'Wordmark',
                        props: { text: (props?.brand as string) ?? 'Charm-Design' },
                        style: {
                          color: color('foreground'),
                          font: { size: '{size.base}', weight: 600 },
                        },
                      },
                      {
                        type: 'text',
                        name: 'Tagline',
                        props: {
                          text: (props?.tagline as string) ?? 'The open source AI design platform.',
                        },
                        style: {
                          color: color('muted-foreground'),
                          maxWidth: '260px',
                          font: { size: '{size.sm}', lineHeight: '1.6' },
                        },
                      },
                    ],
                  },
                  ...groups.map((group) => ({
                    type: 'frame',
                    name: group.title,
                    style: column(3),
                    children: [
                      {
                        type: 'text',
                        name: 'Group title',
                        props: { text: group.title },
                        style: {
                          color: color('foreground'),
                          font: { size: '{size.sm}', weight: 600 },
                        },
                      },
                      ...group.items.map((item) => ({
                        type: 'link',
                        name: item,
                        props: { text: item, href: '#' },
                        style: {
                          color: color('muted-foreground'),
                          cursor: 'pointer',
                          font: { size: '{size.sm}' },
                        },
                      })),
                    ],
                  })),
                ],
              },
              {
                type: 'divider',
                name: 'Rule',
                style: {
                  width: 'fill',
                  border: { width: 1, style: 'solid', color: color('border') },
                },
              },
              {
                type: 'frame',
                name: 'Legal',
                style: { ...row(4), justify: 'between', wrap: true },
                children: [
                  {
                    type: 'text',
                    name: 'Copyright',
                    props: { text: `© ${new Date().getFullYear()} Charm-Design. MIT licensed.` },
                    style: { color: color('muted-foreground'), font: { size: '{size.xs}' } },
                  },
                  {
                    type: 'frame',
                    name: 'Policies',
                    style: row(5),
                    children: ['Privacy', 'Terms', 'Security'].map((item) => ({
                      type: 'link',
                      name: item,
                      props: { text: item, href: '#' },
                      style: {
                        color: color('muted-foreground'),
                        cursor: 'pointer',
                        font: { size: '{size.xs}' },
                      },
                    })),
                  },
                ],
              },
            ],
          },
        ],
      },
      createId,
    );
  },
};

export const appSidebar: ComponentContribution = {
  id: 'lib:app-sidebar',
  name: 'App sidebar',
  category: 'Dashboard',
  keywords: ['navigation', 'admin', 'shell'],
  props: [
    { name: 'brand', type: 'string', defaultValue: 'Acme' },
    { name: 'items', type: 'string', defaultValue: 'Overview,Customers,Deals,Reports,Settings' },
  ],
  create: ({ createId, props }) => {
    const items = String(props?.items ?? 'Overview,Customers,Deals,Reports,Settings')
      .split(',')
      .map((i) => i.trim())
      .filter(Boolean);

    return buildTree(
      {
        type: 'frame',
        name: 'Sidebar',
        style: {
          ...column(6),
          width: 248,
          height: 'fill',
          minHeight: '100vh',
          padding: pad(5, 4),
          background: color('card'),
          border: { width: 1, style: 'solid', color: color('border') },
        },
        children: [
          {
            type: 'frame',
            name: 'Brand',
            style: row(2),
            children: [
              {
                type: 'frame',
                name: 'Mark',
                style: { width: 24, height: 24, radius: radius('md'), background: color('accent') },
              },
              {
                type: 'text',
                name: 'Wordmark',
                props: { text: (props?.brand as string) ?? 'Acme' },
                style: { color: color('foreground'), font: { size: '{size.sm}', weight: 600 } },
              },
            ],
          },
          {
            type: 'frame',
            name: 'Nav',
            style: column(1),
            children: items.map((label, index) => ({
              type: 'link',
              name: label,
              props: { text: label, href: '#' },
              style: {
                display: 'flex',
                align: 'center',
                gap: space(3),
                padding: pad(2, 3),
                radius: radius('md'),
                cursor: 'pointer',
                transition: 'background 160ms ease',
                color: index === 0 ? color('foreground') : color('muted-foreground'),
                ...(index === 0 ? { background: color('muted') } : {}),
                font: { size: '{size.sm}', weight: 500 },
              },
            })),
          },
        ],
      },
      createId,
    );
  },
};
