'use client';

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignStartHorizontal,
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
} from 'lucide-react';
import type { AlignMode, SceneNode, StyleMap } from '@opendesign/core';
import { flattenTokens } from '@opendesign/design-system';
import { MOTION_PRESETS } from '@opendesign/renderer';
import { useDocument, useEditorState, useSelectedNodes, type Editor } from '@opendesign/editor';
import {
  Badge,
  EmptyState,
  Field,
  IconButton,
  Panel,
  SegmentedControl,
  Select,
  TextInput,
} from '@/components/ui/primitives';

/**
 * The inspector.
 *
 * Every control writes through `editor.setStyle`, which targets the *active
 * breakpoint*. Editing at `lg` therefore creates a responsive override rather
 * than clobbering the mobile layout — the single most common way responsive
 * editing goes wrong in tools that treat breakpoints as separate canvases.
 */
export function Inspector({ editor }: { editor: Editor }) {
  const nodes = useSelectedNodes(editor);
  const state = useEditorState(editor);
  const document = useDocument(editor);

  if (nodes.length === 0) {
    return (
      <Panel title="Design">
        <EmptyState
          title="Nada selecionado"
          description="Escolha uma camada no canvas ou no painel de camadas para editar as propriedades."
        />
      </Panel>
    );
  }

  const primary = nodes[0]!;
  const style: StyleMap =
    state.activeBreakpoint === 'base'
      ? primary.style
      : { ...primary.style, ...(primary.responsive?.[state.activeBreakpoint] ?? {}) };

  const spacingTokens = flattenTokens(document.tokens)
    .filter((token) => token.namespace === 'spacing')
    .map((token) => ({ label: token.path.replace('spacing.', ''), value: `{${token.path}}` }));

  const colorTokens = flattenTokens(document.tokens)
    .filter((token) => token.namespace === 'color')
    .map((token) => ({ label: token.path.replace('color.', ''), value: `{${token.path}}` }));

  const radiusTokens = flattenTokens(document.tokens)
    .filter((token) => token.namespace === 'radius')
    .map((token) => ({ label: token.path.replace('radius.', ''), value: `{${token.path}}` }));

  const sizeTokens = flattenTokens(document.tokens)
    .filter((token) => token.namespace === 'size')
    .map((token) => ({ label: token.path.replace('size.', ''), value: `{${token.path}}` }));

  const set = (patch: StyleMap, mergeKey?: string) =>
    editor.setStyle(patch, mergeKey ? { mergeKey } : {});

  return (
    <Panel title="Design">
      <div className="space-y-5 px-3 pb-6">
        <header className="flex items-center justify-between gap-2 pt-1">
          <p className="min-w-0 truncate text-[12px] font-medium">
            {nodes.length === 1 ? primary.name : `${nodes.length} layers`}
          </p>
          <Badge>{nodes.length === 1 ? primary.type : 'multiple'}</Badge>
        </header>

        {state.activeBreakpoint !== 'base' && (
          <p className="rounded-md border border-caution/25 bg-caution/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-caution">
            Editing the <b>{state.activeBreakpoint}</b> override. Base styles stay untouched.
          </p>
        )}

        <Section title="Layout">
          <Field label="Exibição">
            <Select
              value={style.display ?? 'block'}
              onChange={(value) => set({ display: value as StyleMap['display'] })}
              options={[
                { label: 'Bloco', value: 'block' },
                { label: 'Flex', value: 'flex' },
                { label: 'Flex inline', value: 'inline-flex' },
                { label: 'Grid', value: 'grid' },
                { label: 'Oculto', value: 'none' },
              ]}
            />
          </Field>

          {(style.display === 'flex' || style.display === 'inline-flex') && (
            <>
              <Field label="Direção">
                <SegmentedControl
                  value={style.direction ?? 'row'}
                  onChange={(value) => set({ direction: value })}
                  options={[
                    { label: 'Row', value: 'row' as const },
                    { label: 'Coluna', value: 'column' as const },
                  ]}
                />
              </Field>
              <Field label="Justificar">
                <Select
                  value={style.justify ?? 'start'}
                  onChange={(value) => set({ justify: value as StyleMap['justify'] })}
                  options={['start', 'center', 'end', 'between', 'around', 'evenly'].map((v) => ({
                    label: v,
                    value: v,
                  }))}
                />
              </Field>
              <Field label="Alinhar">
                <Select
                  value={style.align ?? 'stretch'}
                  onChange={(value) => set({ align: value as StyleMap['align'] })}
                  options={['start', 'center', 'end', 'stretch', 'baseline'].map((v) => ({
                    label: v,
                    value: v,
                  }))}
                />
              </Field>
            </>
          )}

          {style.display === 'grid' && (
            <Field label="Colunas">
              <TextInput
                type="number"
                min={1}
                value={typeof style.gridColumns === 'number' ? style.gridColumns : ''}
                onChange={(event) => set({ gridColumns: Number(event.target.value) || 1 })}
              />
            </Field>
          )}

          <Field label="Espaço">
            <TokenSelect
              value={style.gap}
              tokens={spacingTokens}
              onChange={(value) => set({ gap: value })}
            />
          </Field>

          <Field label="Padding">
            <TokenSelect
              value={style.padding?.top}
              tokens={spacingTokens}
              onChange={(value) =>
                set({ padding: { top: value, right: value, bottom: value, left: value } })
              }
            />
          </Field>
        </Section>

        <Section title="Tamanho">
          <Field label="Largura">
            <SizeInput value={style.width} onChange={(width) => set({ width })} />
          </Field>
          <Field label="Altura">
            <SizeInput value={style.height} onChange={(height) => set({ height })} />
          </Field>
          <Field label="Largura máx.">
            <TextInput
              placeholder="auto"
              value={typeof style.maxWidth === 'string' ? style.maxWidth : (style.maxWidth ?? '')}
              onChange={(event) => set({ maxWidth: event.target.value || undefined })}
            />
          </Field>
        </Section>

        <Section title="Aparência">
          <Field label="Preenchim.">
            <TokenSelect
              value={style.background}
              tokens={colorTokens}
              allowCustom
              onChange={(value) => set({ background: value })}
            />
          </Field>
          <Field label="Texto">
            <TokenSelect
              value={style.color}
              tokens={colorTokens}
              allowCustom
              onChange={(value) => set({ color: value })}
            />
          </Field>
          <Field label="Raio">
            <TokenSelect
              value={typeof style.radius === 'object' ? undefined : style.radius}
              tokens={radiusTokens}
              onChange={(value) => set({ radius: value })}
            />
          </Field>
          <Field label="Opacidade">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={style.opacity ?? 1}
              onChange={(event) =>
                set({ opacity: Number(event.target.value) }, `opacity:${primary.id}`)
              }
              className="w-full accent-brand"
            />
          </Field>
        </Section>

        <Section title="Tipografia">
          <Field label="Tamanho">
            <TokenSelect
              value={style.font?.size}
              tokens={sizeTokens}
              onChange={(value) => set({ font: { ...style.font, size: value } })}
            />
          </Field>
          <Field label="Peso">
            <Select
              value={String(style.font?.weight ?? 400)}
              onChange={(value) => set({ font: { ...style.font, weight: Number(value) } })}
              options={[300, 400, 500, 600, 700, 800].map((weight) => ({
                label: String(weight),
                value: String(weight),
              }))}
            />
          </Field>
          <Field label="Alinhar">
            <Select
              value={style.font?.align ?? 'left'}
              onChange={(value) =>
                set({ font: { ...style.font, align: value as 'left' | 'center' | 'right' } })
              }
              options={['left', 'center', 'right', 'justify'].map((v) => ({ label: v, value: v }))}
            />
          </Field>
        </Section>

        {nodes.length > 1 && (
          <Section title="Organizar">
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ['left', AlignStartHorizontal],
                  ['center-x', AlignCenterHorizontal],
                  ['right', AlignEndHorizontal],
                  ['top', AlignStartHorizontal],
                  ['center-y', AlignCenterVertical],
                  ['bottom', AlignEndHorizontal],
                ] as [AlignMode, typeof AlignStartHorizontal][]
              ).map(([mode, Icon]) => (
                <IconButton
                  key={mode}
                  label={`Alinhar ${mode}`}
                  onClick={() => editor.alignSelection(mode)}
                >
                  <Icon size={14} />
                </IconButton>
              ))}
              <IconButton
                label="Distribuir na horizontal"
                onClick={() => editor.distributeSelection('x')}
              >
                <AlignHorizontalJustifyCenter size={14} />
              </IconButton>
              <IconButton
                label="Distribuir na vertical"
                onClick={() => editor.distributeSelection('y')}
              >
                <AlignVerticalJustifyCenter size={14} />
              </IconButton>
            </div>
            <p className="text-[11px] leading-relaxed text-ink-faint">
              O alinhamento usa a geometria da tela, então respeita auto-layout e quebra de linha.
            </p>
          </Section>
        )}

        {nodes.length === 1 && <ContentSection editor={editor} node={primary} />}

        <Section title="Movimento">
          <Field label="Predefin.">
            <Select
              value={primary.motion ? findPresetName(primary) : 'none'}
              onChange={(value) => {
                const preset = MOTION_PRESETS[value];
                editor.store.transact(
                  [
                    {
                      type: 'setNodeFields',
                      nodeId: primary.id,
                      fields: { motion: value === 'none' ? undefined : preset },
                    },
                  ],
                  { label: 'Definir movimento' },
                );
              }}
              options={[
                { label: 'Nenhum', value: 'none' },
                ...Object.keys(MOTION_PRESETS).map((name) => ({ label: name, value: name })),
              ]}
            />
          </Field>
        </Section>
      </div>
    </Panel>
  );
}

function findPresetName(node: SceneNode): string {
  const match = Object.entries(MOTION_PRESETS).find(
    ([, preset]) =>
      preset.trigger === node.motion?.trigger && preset.duration === node.motion?.duration,
  );
  return match?.[0] ?? 'none';
}

function ContentSection({ editor, node }: { editor: Editor; node: SceneNode }) {
  const hasText = ['text', 'heading', 'button', 'link'].includes(node.type);
  const hasSrc = ['image', 'video', 'embed'].includes(node.type);

  if (!hasText && !hasSrc) return null;

  return (
    <Section title="Conteúdo">
      {hasText && (
        <Field label="Texto">
          <TextInput
            value={typeof node.props.text === 'string' ? node.props.text : ''}
            onChange={(event) => editor.setProps({ text: event.target.value })}
          />
        </Field>
      )}
      {hasSrc && (
        <>
          <Field label="Origem">
            <TextInput
              value={typeof node.props.src === 'string' ? node.props.src : ''}
              onChange={(event) => editor.setProps({ src: event.target.value })}
            />
          </Field>
          {node.type === 'image' && (
            <Field label="Alt" hint="Obrigatório para acessibilidade e SEO">
              <TextInput
                value={typeof node.props.alt === 'string' ? node.props.alt : ''}
                onChange={(event) => editor.setProps({ alt: event.target.value })}
              />
            </Field>
          )}
        </>
      )}
      {(node.type === 'link' || node.type === 'button') && (
        <Field label="Link">
          <TextInput
            value={typeof node.props.href === 'string' ? node.props.href : ''}
            onChange={(event) => editor.setProps({ href: event.target.value })}
          />
        </Field>
      )}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[10px] font-medium tracking-[0.12em] text-ink-faint uppercase">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

/**
 * Token-first value picker.
 *
 * Tokens come first in the list and raw values are possible but deliberately a
 * second step — nudging toward values that retheme correctly, without blocking
 * the one-off hex a designer legitimately needs.
 */
function TokenSelect({
  value,
  tokens,
  onChange,
  allowCustom,
}: {
  value: string | number | undefined;
  tokens: { label: string; value: string }[];
  onChange: (value: string | undefined) => void;
  allowCustom?: boolean;
}) {
  const current = typeof value === 'string' ? value : value !== undefined ? String(value) : '';
  const isToken = current.startsWith('{');

  return (
    <div className="flex gap-1">
      <Select
        value={isToken ? current : ''}
        onChange={(next) => onChange(next || undefined)}
        options={[{ label: allowCustom && current ? 'personalizado' : '—', value: '' }, ...tokens]}
      />
      {allowCustom && (
        <TextInput
          className="w-20"
          placeholder="#hex"
          value={isToken ? '' : current}
          onChange={(event) => onChange(event.target.value || undefined)}
        />
      )}
    </div>
  );
}

function SizeInput({
  value,
  onChange,
}: {
  value: StyleMap['width'];
  onChange: (value: StyleMap['width']) => void;
}) {
  const keyword = value === 'fill' || value === 'hug' || value === 'auto' ? value : 'custom';

  return (
    <div className="flex gap-1">
      <Select
        value={keyword}
        onChange={(next) => onChange(next === 'custom' ? 0 : (next as 'fill' | 'hug' | 'auto'))}
        options={[
          { label: 'Fill', value: 'fill' },
          { label: 'Hug', value: 'hug' },
          { label: 'Auto', value: 'auto' },
          { label: 'Fixed', value: 'custom' },
        ]}
      />
      {keyword === 'custom' && (
        <TextInput
          className="w-20"
          type="number"
          value={typeof value === 'number' ? value : ''}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      )}
    </div>
  );
}
