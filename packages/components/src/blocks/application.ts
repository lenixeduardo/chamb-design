import type { ComponentContribution } from '@opendesign/core';
import { buildTree, color, column, pad, radius, row, space, type NodeSpec } from '../builder.js';

/** Application surfaces: dashboards, tables, charts and a CRM pipeline. */

export const statGrid: ComponentContribution = {
  id: 'lib:stat-grid',
  name: 'Stat grid',
  category: 'Dashboard',
  keywords: ['kpi', 'metrics', 'overview'],
  props: [{ name: 'columns', type: 'number', defaultValue: 4 }],
  create: ({ createId, props }) => {
    const columns = typeof props?.columns === 'number' ? props.columns : 4;
    const stats = [
      { label: 'Revenue', value: '$48,120', delta: '+12.4%', positive: true },
      { label: 'Active users', value: '8,942', delta: '+4.1%', positive: true },
      { label: 'Churn', value: '1.8%', delta: '-0.3%', positive: true },
      { label: 'Open tickets', value: '37', delta: '+9', positive: false },
    ].slice(0, columns);

    return buildTree(
      {
        type: 'frame',
        name: 'Stat grid',
        style: { display: 'grid', gridColumns: 1, gap: space(4), width: 'fill' },
        responsive: { sm: { gridColumns: 2 }, lg: { gridColumns: columns } },
        children: stats.map((stat) => ({
          type: 'frame',
          name: stat.label,
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
              props: { text: stat.label },
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
              type: 'frame',
              name: 'Value row',
              style: { ...row(3), align: 'baseline' },
              children: [
                {
                  type: 'text',
                  name: 'Value',
                  props: { text: stat.value },
                  style: {
                    color: color('foreground'),
                    font: { size: '{size.3xl}', weight: 600, letterSpacing: '-0.02em' },
                  },
                },
                {
                  type: 'text',
                  name: 'Delta',
                  props: { text: stat.delta },
                  style: {
                    color: stat.positive ? color('success.500') : color('danger.500'),
                    font: { size: '{size.sm}', weight: 500 },
                  },
                },
              ],
            },
          ],
        })),
      },
      createId,
    );
  },
};

export const dataTable: ComponentContribution = {
  id: 'lib:data-table',
  name: 'Data table',
  category: 'Dashboard',
  keywords: ['table', 'list', 'rows', 'grid'],
  props: [
    { name: 'title', type: 'string', defaultValue: 'Recent orders' },
    { name: 'columns', type: 'string', defaultValue: 'Customer,Plan,Status,MRR' },
  ],
  create: ({ createId, props }) => {
    const columns = String(props?.columns ?? 'Customer,Plan,Status,MRR')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    const rows = [
      ['Northwind Labs', 'Team', 'Active', '$1,240'],
      ['Kestrel Studio', 'Free', 'Trialing', '$0'],
      ['Lumen Health', 'Team', 'Active', '$860'],
      ['Vireo Robotics', 'Enterprise', 'Past due', '$4,300'],
    ];

    const cell = (text: string, header = false): NodeSpec => ({
      type: 'text',
      name: header ? 'Header cell' : 'Cell',
      props: { text },
      style: {
        color: header ? color('muted-foreground') : color('foreground'),
        font: header
          ? { size: '{size.xs}', weight: 500, letterSpacing: '0.06em', transform: 'uppercase' }
          : { size: '{size.sm}' },
      },
    });

    const gridTemplate = `repeat(${columns.length}, minmax(0, 1fr))`;

    return buildTree(
      {
        type: 'frame',
        name: 'Data table',
        style: {
          ...column(0),
          width: 'fill',
          radius: radius('xl'),
          overflow: 'hidden',
          background: color('card'),
          border: { width: 1, style: 'solid', color: color('border') },
        },
        children: [
          {
            type: 'frame',
            name: 'Toolbar',
            style: {
              ...row(3),
              justify: 'between',
              padding: pad(4, 5),
              border: { width: 1, style: 'solid', color: color('border') },
            },
            children: [
              {
                type: 'text',
                name: 'Title',
                props: { text: (props?.title as string) ?? 'Recent orders' },
                style: { color: color('foreground'), font: { size: '{size.sm}', weight: 600 } },
              },
              {
                type: 'input',
                name: 'Search',
                props: { placeholder: 'Search…', inputType: 'search' },
                style: {
                  width: 200,
                  padding: pad(2, 3),
                  radius: radius('md'),
                  background: color('background'),
                  color: color('foreground'),
                  border: { width: 1, style: 'solid', color: color('border') },
                  font: { size: '{size.xs}' },
                },
              },
            ],
          },
          {
            type: 'frame',
            name: 'Header row',
            style: {
              display: 'grid',
              gridColumns: gridTemplate,
              gap: space(4),
              padding: pad(3, 5),
              background: color('muted'),
            },
            children: columns.map((label) => cell(label, true)),
          },
          ...rows.map((values, index) => ({
            type: 'frame',
            name: `Row ${index + 1}`,
            style: {
              display: 'grid' as const,
              gridColumns: gridTemplate,
              gap: space(4),
              padding: pad(4, 5),
              ...(index < rows.length - 1
                ? { border: { width: 1, style: 'solid' as const, color: color('border') } }
                : {}),
            },
            children: values.slice(0, columns.length).map((value) => cell(value)),
          })),
        ],
      },
      createId,
    );
  },
};

export const chartCard: ComponentContribution = {
  id: 'lib:chart-card',
  name: 'Chart card',
  category: 'Charts',
  keywords: ['analytics', 'graph', 'trend', 'bar'],
  description: 'Chart shell with a title, summary and a token-driven bar series.',
  props: [
    { name: 'title', type: 'string', defaultValue: 'Weekly signups' },
    { name: 'summary', type: 'string', defaultValue: '1,284 this week' },
    { name: 'series', type: 'string', defaultValue: '32,48,41,66,58,74,92' },
  ],
  create: ({ createId, props }) => {
    const series = String(props?.series ?? '32,48,41,66,58,74,92')
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value));

    const max = Math.max(...series, 1);

    return buildTree(
      {
        type: 'frame',
        name: 'Chart card',
        style: {
          ...column(6),
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
            style: { ...row(3), justify: 'between', align: 'start' },
            children: [
              {
                type: 'frame',
                name: 'Titles',
                style: column(1),
                children: [
                  {
                    type: 'text',
                    name: 'Title',
                    props: { text: (props?.title as string) ?? 'Weekly signups' },
                    style: { color: color('foreground'), font: { size: '{size.sm}', weight: 600 } },
                  },
                  {
                    type: 'text',
                    name: 'Summary',
                    props: { text: (props?.summary as string) ?? '1,284 this week' },
                    style: { color: color('muted-foreground'), font: { size: '{size.xs}' } },
                  },
                ],
              },
            ],
          },
          {
            type: 'frame',
            name: 'Bars',
            style: {
              display: 'flex',
              direction: 'row',
              align: 'end',
              justify: 'between',
              gap: space(2),
              width: 'fill',
              height: 160,
            },
            children: series.map((value, index) => ({
              type: 'frame',
              name: `Bar ${index + 1}`,
              style: {
                width: 'fill',
                height: `${Math.max(Math.round((value / max) * 100), 4)}%`,
                radius: { top: radius('sm'), bottom: radius('sm') },
                background:
                  index === series.length - 1
                    ? color('accent')
                    : 'color-mix(in srgb, var(--color-accent) 32%, transparent)',
              },
              motion: {
                engine: 'css',
                trigger: 'in-view',
                from: { opacity: 0, scale: 0.9 },
                to: { opacity: 1, scale: 1 },
                duration: 400,
                delay: index * 40,
              },
            })),
          },
        ],
      },
      createId,
    );
  },
};

export const crmPipeline: ComponentContribution = {
  id: 'lib:crm-pipeline',
  name: 'CRM pipeline',
  category: 'CRM',
  keywords: ['kanban', 'deals', 'sales', 'board'],
  description: 'Kanban board of deal stages with draggable-looking cards.',
  props: [{ name: 'stages', type: 'string', defaultValue: 'Lead,Qualified,Proposal,Won' }],
  create: ({ createId, props }) => {
    const stages = String(props?.stages ?? 'Lead,Qualified,Proposal,Won')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const deals: Record<string, { name: string; value: string }[]> = {
      Lead: [
        { name: 'Halcyon Media', value: '$4,200' },
        { name: 'Vireo Robotics', value: '$12,000' },
      ],
      Qualified: [{ name: 'Kestrel Studio', value: '$7,600' }],
      Proposal: [
        { name: 'Northwind Labs', value: '$18,400' },
        { name: 'Lumen Health', value: '$9,100' },
      ],
      Won: [{ name: 'Aster Design', value: '$22,000' }],
    };

    return buildTree(
      {
        type: 'frame',
        name: 'CRM pipeline',
        style: {
          display: 'flex',
          direction: 'row',
          gap: space(4),
          width: 'fill',
          overflow: 'auto',
          align: 'start',
        },
        children: stages.map((stage) => ({
          type: 'frame',
          name: stage,
          style: {
            ...column(3),
            minWidth: 260,
            width: 'fill',
            padding: pad(4),
            radius: radius('xl'),
            background: color('muted'),
            border: { width: 1, style: 'solid', color: color('border') },
          },
          children: [
            {
              type: 'frame',
              name: 'Stage header',
              style: { ...row(2), justify: 'between' },
              children: [
                {
                  type: 'text',
                  name: 'Stage name',
                  props: { text: stage },
                  style: {
                    color: color('foreground'),
                    font: { size: '{size.sm}', weight: 600 },
                  },
                },
                {
                  type: 'text',
                  name: 'Count',
                  props: { text: String((deals[stage] ?? []).length) },
                  style: {
                    padding: pad(0, 2),
                    radius: radius('full'),
                    background: color('card'),
                    color: color('muted-foreground'),
                    font: { size: '{size.xs}', weight: 500 },
                  },
                },
              ],
            },
            ...(deals[stage] ?? []).map((deal) => ({
              type: 'frame',
              name: deal.name,
              style: {
                ...column(2),
                padding: pad(4),
                radius: radius('lg'),
                background: color('card'),
                border: { width: 1, style: 'solid' as const, color: color('border') },
                cursor: 'grab',
              },
              motion: { engine: 'css' as const, trigger: 'hover' as const, to: { y: -2 }, duration: 160 },
              children: [
                {
                  type: 'text',
                  name: 'Company',
                  props: { text: deal.name },
                  style: { color: color('foreground'), font: { size: '{size.sm}', weight: 500 } },
                },
                {
                  type: 'text',
                  name: 'Value',
                  props: { text: deal.value },
                  style: { color: color('muted-foreground'), font: { size: '{size.xs}' } },
                },
              ],
            })),
          ],
        })),
      },
      createId,
    );
  },
};
