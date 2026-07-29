import type { ComponentContribution } from '@opendesign/core';
import { buildTree, color, column, pad, radius, row, space, type NodeSpec } from '../builder.js';

const FIELD_STYLE = {
  width: 'fill' as const,
  padding: pad(3, 4),
  radius: radius('md'),
  background: color('background'),
  color: color('foreground'),
  border: { width: 1, style: 'solid' as const, color: color('border') },
  font: { size: '{size.sm}' as const },
  transition: 'border-color 160ms ease, box-shadow 160ms ease',
};

function field(label: string, placeholder: string, type = 'text'): NodeSpec {
  return {
    type: 'frame',
    name: `${label} field`,
    style: column(2),
    children: [
      {
        type: 'text',
        name: 'Label',
        props: { text: label, as: 'label' },
        style: { color: color('foreground'), font: { size: '{size.sm}', weight: 500 } },
      },
      {
        type: type === 'textarea' ? 'textarea' : 'input',
        name: 'Input',
        props: {
          placeholder,
          name: label.toLowerCase().replace(/\s+/g, '-'),
          ...(type === 'textarea' ? { rows: 5 } : { inputType: type }),
        },
        style: FIELD_STYLE,
      },
    ],
  };
}

function submitButton(text: string): NodeSpec {
  return {
    type: 'button',
    name: 'Submit',
    props: { text, buttonType: 'submit' },
    style: {
      display: 'flex',
      justify: 'center',
      align: 'center',
      width: 'fill',
      padding: pad(3, 5),
      radius: radius('md'),
      background: color('accent'),
      color: color('accent-foreground'),
      cursor: 'pointer',
      font: { size: '{size.sm}', weight: 500 },
    },
    motion: { engine: 'css', trigger: 'tap', to: { scale: 0.98 }, duration: 120 },
  };
}

export const contactForm: ComponentContribution = {
  id: 'lib:contact-form',
  name: 'Contact form',
  category: 'Forms',
  keywords: ['form', 'inquiry', 'message', 'support'],
  props: [
    { name: 'title', type: 'string', defaultValue: 'Talk to us' },
    { name: 'subtitle', type: 'string', defaultValue: 'We reply within one business day.' },
    { name: 'submitLabel', type: 'string', defaultValue: 'Send message' },
  ],
  create: ({ createId, props }) =>
    buildTree(
      {
        type: 'frame',
        name: 'Contact form',
        style: {
          ...column(6),
          width: 'fill',
          maxWidth: '520px',
          padding: pad(8, 7),
          radius: radius('2xl'),
          background: color('card'),
          border: { width: 1, style: 'solid', color: color('border') },
        },
        children: [
          {
            type: 'frame',
            name: 'Heading',
            style: column(2),
            children: [
              {
                type: 'heading',
                name: 'Title',
                props: { text: (props?.title as string) ?? 'Talk to us', level: 'h2' },
                style: { color: color('foreground'), font: { size: '{size.xl}', weight: 600 } },
              },
              {
                type: 'text',
                name: 'Subtitle',
                props: {
                  text: (props?.subtitle as string) ?? 'We reply within one business day.',
                },
                style: { color: color('muted-foreground'), font: { size: '{size.sm}' } },
              },
            ],
          },
          field('Name', 'Ada Lovelace'),
          field('Email', 'ada@example.com', 'email'),
          field('Message', 'Tell us what you are building…', 'textarea'),
          submitButton((props?.submitLabel as string) ?? 'Send message'),
        ],
      },
      createId,
    ),
};

export const authForm: ComponentContribution = {
  id: 'lib:auth-form',
  name: 'Sign in form',
  category: 'Forms',
  keywords: ['login', 'auth', 'signin', 'account'],
  props: [
    { name: 'title', type: 'string', defaultValue: 'Welcome back' },
    { name: 'submitLabel', type: 'string', defaultValue: 'Sign in' },
  ],
  create: ({ createId, props }) =>
    buildTree(
      {
        type: 'frame',
        name: 'Sign in',
        style: {
          ...column(6),
          width: 'fill',
          maxWidth: '400px',
          padding: pad(8, 7),
          radius: radius('2xl'),
          background: color('card'),
          border: { width: 1, style: 'solid', color: color('border') },
        },
        children: [
          {
            type: 'heading',
            name: 'Title',
            props: { text: (props?.title as string) ?? 'Welcome back', level: 'h1' },
            style: {
              color: color('foreground'),
              font: { size: '{size.2xl}', weight: 600, align: 'center' },
            },
          },
          field('Email', 'you@example.com', 'email'),
          field('Password', '••••••••', 'password'),
          {
            type: 'frame',
            name: 'Row',
            style: { ...row(3), justify: 'between' },
            children: [
              {
                type: 'text',
                name: 'Remember',
                props: { text: 'Remember me' },
                style: { color: color('muted-foreground'), font: { size: '{size.xs}' } },
              },
              {
                type: 'link',
                name: 'Forgot',
                props: { text: 'Forgot password?', href: '#' },
                style: {
                  color: color('accent'),
                  cursor: 'pointer',
                  font: { size: '{size.xs}', weight: 500 },
                },
              },
            ],
          },
          submitButton((props?.submitLabel as string) ?? 'Sign in'),
          {
            type: 'text',
            name: 'Footer',
            props: { text: 'No account yet? Create one.' },
            style: {
              color: color('muted-foreground'),
              font: { size: '{size.xs}', align: 'center' },
            },
          },
        ],
      },
      createId,
    ),
};

export const newsletterForm: ComponentContribution = {
  id: 'lib:newsletter',
  name: 'Newsletter signup',
  category: 'Forms',
  keywords: ['email', 'subscribe', 'capture'],
  props: [
    { name: 'title', type: 'string', defaultValue: 'Ship notes, once a month' },
    { name: 'submitLabel', type: 'string', defaultValue: 'Subscribe' },
  ],
  create: ({ createId, props }) =>
    buildTree(
      {
        type: 'frame',
        name: 'Newsletter',
        style: { ...column(4), width: 'fill', maxWidth: '480px' },
        children: [
          {
            type: 'heading',
            name: 'Title',
            props: { text: (props?.title as string) ?? 'Ship notes, once a month', level: 'h3' },
            style: { color: color('foreground'), font: { size: '{size.lg}', weight: 600 } },
          },
          {
            type: 'frame',
            name: 'Row',
            style: { display: 'flex', direction: 'column', gap: space(3), width: 'fill' },
            responsive: { sm: { direction: 'row' } },
            children: [
              {
                type: 'input',
                name: 'Email',
                props: { inputType: 'email', placeholder: 'you@example.com', name: 'email' },
                style: { ...FIELD_STYLE, width: 'fill' },
              },
              {
                type: 'button',
                name: 'Submit',
                props: { text: (props?.submitLabel as string) ?? 'Subscribe', buttonType: 'submit' },
                style: {
                  display: 'flex',
                  justify: 'center',
                  align: 'center',
                  padding: pad(3, 5),
                  radius: radius('md'),
                  background: color('accent'),
                  color: color('accent-foreground'),
                  cursor: 'pointer',
                  font: { size: '{size.sm}', weight: 500 },
                },
              },
            ],
          },
          {
            type: 'text',
            name: 'Disclaimer',
            props: { text: 'No spam. Unsubscribe any time.' },
            style: { color: color('muted-foreground'), font: { size: '{size.xs}' } },
          },
        ],
      },
      createId,
    ),
};
