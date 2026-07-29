import { definePlugin, type ComponentContribution, type OpenDesignPlugin } from '@opendesign/core';
import {
  buildTree,
  color,
  column,
  pad,
  radius,
  row,
  space,
  type NodeSpec,
} from '@opendesign/components';

/**
 * Example: a component plugin.
 *
 * Everything here uses the published `@opendesign/core` and
 * `@opendesign/components` APIs — no private imports, no patched internals.
 * Copy this directory, change the ids, and you have a working component pack.
 *
 * The charts render as real nodes rather than a canvas or an SVG library call,
 * which means they inherit the project's tokens, respond to theme changes, and
 * survive every export target without a runtime dependency.
 */

function parseSeries(input: unknown, fallback: number[]): number[] {
  if (typeof input !== 'string') return fallback;
  const values = input
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));
  return values.length > 0 ? values : fallback;
}

function parseLabels(input: unknown, count: number): string[] {
  if (typeof input !== 'string') return Array.from({ length: count }, (_, i) => `#${i + 1}`);
  const labels = input.split(',').map((label) => label.trim());
  return Array.from({ length: count }, (_, i) => labels[i] ?? `#${i + 1}`);
}

function chartFrame(title: string, subtitle: string, body: NodeSpec): NodeSpec {
  return {
    type: 'frame',
    name: title,
    style: {
      ...column(5),
      width: 'fill',
      padding: pad(6),
      radius: radius('xl'),
      background: color('card'),
      border: { width: 1, style: 'solid', color: color('border') },
    },
    children: [
      {
        type: 'frame',
        name: 'Header',
        style: column(1),
        children: [
          {
            type: 'text',
            name: 'Title',
            props: { text: title },
            style: { color: color('foreground'), font: { size: '{size.sm}', weight: 600 } },
          },
          {
            type: 'text',
            name: 'Subtitle',
            props: { text: subtitle },
            style: { color: color('muted-foreground'), font: { size: '{size.xs}' } },
          },
        ],
      },
      body,
    ],
  };
}

export const barChart: ComponentContribution = {
  id: 'charts:bar',
  name: 'Bar chart',
  category: 'Charts',
  keywords: ['analytics', 'columns', 'series', 'comparison'],
  description: 'Vertical bars with labels, driven entirely by design tokens.',
  props: [
    { name: 'title', type: 'string', defaultValue: 'Revenue by month' },
    { name: 'subtitle', type: 'string', defaultValue: 'Last six months' },
    { name: 'series', type: 'string', defaultValue: '18,32,27,44,39,58' },
    { name: 'labels', type: 'string', defaultValue: 'Jan,Feb,Mar,Apr,May,Jun' },
  ],
  create: ({ createId, props }) => {
    const series = parseSeries(props?.series, [18, 32, 27, 44, 39, 58]);
    const labels = parseLabels(props?.labels, series.length);
    const max = Math.max(...series, 1);

    return buildTree(
      chartFrame(
        (props?.title as string) ?? 'Revenue by month',
        (props?.subtitle as string) ?? 'Last six months',
        {
          type: 'frame',
          name: 'Plot',
          style: {
            display: 'flex',
            direction: 'row',
            align: 'end',
            gap: space(3),
            width: 'fill',
            height: 180,
          },
          children: series.map((value, index) => ({
            type: 'frame',
            name: labels[index] ?? `Bar ${index + 1}`,
            style: { ...column(2), justify: 'end', align: 'center', width: 'fill', height: 'fill' },
            children: [
              {
                type: 'frame',
                name: 'Bar',
                style: {
                  width: 'fill',
                  height: `${Math.max(Math.round((value / max) * 100), 3)}%`,
                  radius: { top: radius('sm') },
                  background:
                    index === series.length - 1
                      ? color('accent')
                      : 'color-mix(in srgb, var(--color-accent) 30%, transparent)',
                },
                motion: {
                  engine: 'css',
                  trigger: 'in-view',
                  from: { opacity: 0, y: 12 },
                  to: { opacity: 1, y: 0 },
                  duration: 420,
                  delay: index * 50,
                },
              },
              {
                type: 'text',
                name: 'Label',
                props: { text: labels[index] ?? '' },
                style: {
                  color: color('muted-foreground'),
                  font: { size: '{size.xs}', align: 'center' },
                },
              },
            ],
          })),
        },
      ),
      createId,
    );
  },
};

export const sparklineChart: ComponentContribution = {
  id: 'charts:sparkline',
  name: 'Sparkline',
  category: 'Charts',
  keywords: ['trend', 'inline', 'micro', 'kpi'],
  description: 'Compact trend indicator for stat tiles.',
  props: [
    { name: 'value', type: 'string', defaultValue: '12,480' },
    { name: 'label', type: 'string', defaultValue: 'Sessions this week' },
    { name: 'series', type: 'string', defaultValue: '4,9,6,11,8,14,19' },
  ],
  create: ({ createId, props }) => {
    const series = parseSeries(props?.series, [4, 9, 6, 11, 8, 14, 19]);
    const max = Math.max(...series, 1);

    return buildTree(
      {
        type: 'frame',
        name: 'Sparkline',
        style: {
          ...column(3),
          padding: pad(5),
          radius: radius('lg'),
          background: color('card'),
          border: { width: 1, style: 'solid', color: color('border') },
        },
        children: [
          {
            type: 'text',
            name: 'Label',
            props: { text: (props?.label as string) ?? 'Sessions this week' },
            style: {
              color: color('muted-foreground'),
              font: {
                size: '{size.xs}',
                weight: 500,
                letterSpacing: '0.08em',
                transform: 'uppercase',
              },
            },
          },
          {
            type: 'text',
            name: 'Value',
            props: { text: (props?.value as string) ?? '12,480' },
            style: {
              color: color('foreground'),
              font: { size: '{size.2xl}', weight: 600, letterSpacing: '-0.02em' },
            },
          },
          {
            type: 'frame',
            name: 'Trend',
            style: {
              display: 'flex',
              direction: 'row',
              align: 'end',
              gap: 2,
              width: 'fill',
              height: 40,
            },
            children: series.map((value, index) => ({
              type: 'frame',
              name: `Point ${index + 1}`,
              style: {
                width: 'fill',
                height: `${Math.max(Math.round((value / max) * 100), 6)}%`,
                radius: radius('sm'),
                background: 'color-mix(in srgb, var(--color-accent) 45%, transparent)',
              },
            })),
          },
        ],
      },
      createId,
    );
  },
};

export const donutChart: ComponentContribution = {
  id: 'charts:donut',
  name: 'Donut chart',
  category: 'Charts',
  keywords: ['pie', 'share', 'breakdown', 'proportion'],
  description: 'Proportional breakdown rendered with a conic gradient and a legend.',
  props: [
    { name: 'title', type: 'string', defaultValue: 'Traffic sources' },
    { name: 'series', type: 'string', defaultValue: '48,27,15,10' },
    { name: 'labels', type: 'string', defaultValue: 'Organic,Direct,Referral,Social' },
  ],
  create: ({ createId, props }) => {
    const series = parseSeries(props?.series, [48, 27, 15, 10]);
    const labels = parseLabels(props?.labels, series.length);
    const total = series.reduce((sum, value) => sum + value, 0) || 1;

    // A conic gradient keeps this a single node with zero JavaScript, which is
    // what lets it survive the static HTML export intact.
    let cursor = 0;
    const stops = series.map((value, index) => {
      const start = (cursor / total) * 360;
      cursor += value;
      const end = (cursor / total) * 360;
      const alpha = 90 - index * 20;
      return `color-mix(in srgb, var(--color-accent) ${alpha}%, transparent) ${start}deg ${end}deg`;
    });

    return buildTree(
      chartFrame((props?.title as string) ?? 'Traffic sources', `${total} visits`, {
        type: 'frame',
        name: 'Plot',
        style: { ...row(6), align: 'center' },
        children: [
          {
            type: 'frame',
            name: 'Ring',
            style: {
              width: 132,
              height: 132,
              radius: radius('full'),
              background: `conic-gradient(${stops.join(', ')})`,
            },
            children: [
              {
                type: 'frame',
                name: 'Hole',
                style: {
                  width: 76,
                  height: 76,
                  margin: { top: 28, left: 28 },
                  radius: radius('full'),
                  background: color('card'),
                },
              },
            ],
          },
          {
            type: 'frame',
            name: 'Legend',
            style: column(2),
            children: series.map((value, index) => ({
              type: 'frame',
              name: labels[index] ?? '',
              style: row(2),
              children: [
                {
                  type: 'frame',
                  name: 'Swatch',
                  style: {
                    width: 10,
                    height: 10,
                    radius: radius('sm'),
                    background: `color-mix(in srgb, var(--color-accent) ${90 - index * 20}%, transparent)`,
                  },
                },
                {
                  type: 'text',
                  name: 'Label',
                  props: { text: `${labels[index]} · ${Math.round((value / total) * 100)}%` },
                  style: { color: color('muted-foreground'), font: { size: '{size.xs}' } },
                },
              ],
            })),
          },
        ],
      }),
      createId,
    );
  },
};

export const CHART_COMPONENTS = [barChart, sparklineChart, donutChart];

export const chartsPlugin: OpenDesignPlugin = definePlugin({
  id: 'community.charts',
  name: 'Charts',
  version: '0.1.0',
  description: 'Bar, sparkline and donut charts built from design tokens.',
  author: 'OpenDesign community',
  activate(context) {
    for (const chart of CHART_COMPONENTS) context.registerComponent(chart);
    context.log(`registered ${CHART_COMPONENTS.length} chart blocks`);
  },
});

export default chartsPlugin;
