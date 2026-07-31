'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Sparkles, Trash2, Upload, Wand2 } from 'lucide-react';
import type { Asset } from '@opendesign/core';
import { findOrphanAssets } from '@opendesign/assets';
import { useDocument, type Editor } from '@opendesign/editor';
import { getIngestor, imageFilesFrom } from '@/lib/assets';
import { getCredential, hasKey, subscribeToSettings } from '@/lib/settings';
import { Badge, Button, EmptyState, Panel, Select, TextInput } from '@/components/ui/primitives';
import { cn, formatBytes } from '@/lib/utils';

interface ImageProviderInfo {
  id: string;
  label: string;
  locality: 'cloud' | 'local';
  configured: boolean;
  models: { id: string; label: string; sizes?: string[] }[];
}

/**
 * The assets panel.
 *
 * Three ways in — drop, paste, generate — all landing in the same pipeline, so
 * a generated image and an uploaded one are indistinguishable downstream. That
 * matters because it means "regenerate" and "replace" work on either.
 */
export function AssetsPanel({ editor }: { editor: Editor }) {
  const document = useDocument(editor);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    editor.setIngestor(getIngestor());
  }, [editor]);

  const ingest = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setError(null);
      setBusy(`Adicionando ${files.length} arquivo${files.length === 1 ? '' : 's'}…`);

      try {
        for (const file of files) await editor.addAssetFromFile(file);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy(null);
      }
    },
    [editor],
  );

  // Paste anywhere in the panel — how screenshots actually get into a design.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = imageFilesFrom(event.clipboardData);
      if (files.length === 0) return;
      event.preventDefault();
      void ingest(files);
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [ingest]);

  const orphans = new Set(findOrphanAssets(document).map((asset) => asset.id));

  return (
    <Panel title="Recursos">
      <div
        className="space-y-3 px-3 pb-6"
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void ingest(imageFilesFrom(event.dataTransfer));
        }}
      >
        <div
          className={cn(
            'rounded-xl border border-dashed px-3 py-5 text-center transition-colors',
            dragging ? 'border-brand bg-brand/8' : 'border-hairline',
          )}
        >
          <Upload size={16} className="mx-auto text-ink-faint" />
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-muted">
            Solte imagens aqui, ou cole um print
          </p>
          <Button
            size="sm"
            className="mt-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={Boolean(busy)}
          >
            Escolher arquivos
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              void ingest(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
          <p className="mt-2 text-[10px] text-ink-faint">{getIngestor().storageLabel}</p>
        </div>

        <GenerateImage editor={editor} onError={setError} />

        {busy && (
          <p className="flex items-center gap-1.5 text-[11px] text-ink-faint">
            <Loader2 size={11} className="animate-spin" />
            {busy}
          </p>
        )}

        {error && (
          <p className="rounded-md border border-critical/25 bg-critical/8 px-2 py-1.5 text-[11px] leading-relaxed text-critical">
            {error}
          </p>
        )}

        {document.assets.length === 0 ? (
          <EmptyState
            icon={<ImageIcon size={18} />}
            title="Nenhum recurso ainda"
            description="Tudo que você adicionar aqui pode ser solto no canvas ou usado para substituir uma imagem existente."
          />
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {document.assets.map((asset) => (
              <AssetTile
                key={asset.id}
                asset={asset}
                unused={orphans.has(asset.id)}
                onPlace={() => editor.placeAssetOnCanvas(asset.id)}
                onReplace={() => editor.replaceImageSource(asset.id)}
                onRemove={() =>
                  editor.store.transact([{ type: 'removeAsset', assetId: asset.id }], {
                    label: `Remover ${asset.name}`,
                  })
                }
              />
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function AssetTile({
  asset,
  unused,
  onPlace,
  onReplace,
  onRemove,
}: {
  asset: Asset;
  unused: boolean;
  onPlace: () => void;
  onReplace: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="group relative overflow-hidden rounded-lg border border-hairline bg-shell">
      <button
        type="button"
        onClick={onPlace}
        title={`Colocar "${asset.name}" no canvas`}
        className="block w-full"
      >
        <span className="grid h-20 place-items-center overflow-hidden bg-panel-raised">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={asset.url}
            alt={asset.alt ?? asset.name}
            className="max-h-20 w-full object-contain"
            loading="lazy"
          />
        </span>
      </button>

      <div className="space-y-0.5 px-2 py-1.5">
        <p className="truncate text-[10.5px] text-ink" title={asset.name}>
          {asset.name}
        </p>
        <p className="flex items-center gap-1 text-[9.5px] text-ink-faint">
          {asset.width ? `${asset.width}×${asset.height}` : asset.kind}
          {asset.size ? ` · ${formatBytes(asset.size)}` : ''}
          {asset.generatedBy && <Sparkles size={8} className="text-brand-soft" />}
        </p>
      </div>

      {unused && (
        <span className="absolute top-1 left-1">
          <Badge tone="caution">sem uso</Badge>
        </span>
      )}

      <div className="absolute top-1 right-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          onClick={onReplace}
          title="Substituir a imagem selecionada por este recurso"
          className="grid h-6 w-6 place-items-center rounded bg-shell/90 text-ink-muted hover:text-ink"
        >
          <ImageIcon size={11} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          title="Remover da biblioteca"
          className="grid h-6 w-6 place-items-center rounded bg-shell/90 text-ink-muted hover:text-critical"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </li>
  );
}

/**
 * Image generation.
 *
 * The provider list comes from the server so an unconfigured key is visible up
 * front, rather than surfacing as a failure after the user has written a prompt.
 */
function GenerateImage({
  editor,
  onError,
}: {
  editor: Editor;
  onError: (message: string | null) => void;
}) {
  const [served, setServed] = useState<ImageProviderInfo[]>([]);
  const [providerId, setProviderId] = useState('');
  const [model, setModel] = useState('');
  const [size, setSize] = useState('1024x1024');
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [credentialVersion, setCredentialVersion] = useState(0);
  const pickedDefault = useRef(false);

  useEffect(() => subscribeToSettings(() => setCredentialVersion((n) => n + 1)), []);

  useEffect(() => {
    fetch('/api/images')
      .then((response) => response.json())
      .then((data: { providers: ImageProviderInfo[] }) => setServed(data.providers ?? []))
      .catch(() => setServed([]));
  }, []);

  // An image provider reuses the text provider's key, so a user who added an
  // OpenAI key for the assistant can generate images with it too.
  const providers = useMemo(
    () =>
      served.map((provider) => ({
        ...provider,
        configured: provider.configured || hasKey(provider.id),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keys are read imperatively
    [served, credentialVersion],
  );

  // Chosen once; after that the picker is the user's, not ours to reset.
  useEffect(() => {
    if (pickedDefault.current || providers.length === 0) return;
    pickedDefault.current = true;

    const usable = providers.find((provider) => provider.configured) ?? providers[0];
    if (!usable) return;
    setProviderId(usable.id);
    setModel(usable.models[0]?.id ?? '');
    setSize(usable.models[0]?.sizes?.[0] ?? '1024x1024');
  }, [providers]);

  const active = providers.find((p) => p.id === providerId);
  const activeModel = active?.models.find((m) => m.id === model);

  const generate = async () => {
    if (!prompt.trim() || generating) return;

    setGenerating(true);
    onError(null);

    try {
      const credential = getCredential(providerId);
      const response = await fetch('/api/images', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(credential?.apiKey ? { 'x-od-api-key': credential.apiKey } : {}),
          ...(credential?.baseUrl ? { 'x-od-base-url': credential.baseUrl } : {}),
        },
        body: JSON.stringify({ prompt, providerId, model, size }),
      });

      const payload = (await response.json()) as {
        images?: { base64: string; mimeType: string; revisedPrompt?: string }[];
        error?: string;
        hint?: string;
      };

      if (!response.ok || !payload.images) {
        onError([payload.error, payload.hint].filter(Boolean).join(' — ') || 'a geração falhou');
        return;
      }

      // Ingestion happens client-side so the bytes go through the same storage
      // adapter as an upload — including the local-first inline path.
      const ingestor = getIngestor();
      const operations = [];

      for (const [index, image] of payload.images.entries()) {
        const result = await ingestor.ingestBase64(image.base64, {
          name: `${
            prompt
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .split('-')
              .slice(0, 5)
              .join('-') || 'generated'
          }${payload.images.length > 1 ? `-${index + 1}` : ''}.png`,
          mimeType: image.mimeType,
          prompt: image.revisedPrompt ?? prompt,
          generatedBy: providerId,
          alt: prompt,
        });
        operations.push(...result.operations);
      }

      editor.addGeneratedAssets(operations, `Generate "${prompt.slice(0, 40)}"`);
      setPrompt('');
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setGenerating(false);
    }
  };

  if (providers.length === 0) return null;

  return (
    <section className="space-y-2 rounded-xl border border-hairline bg-shell p-2.5">
      <h3 className="flex items-center gap-1.5 text-[10px] font-medium tracking-[0.12em] text-ink-faint uppercase">
        <Wand2 size={10} />
        Gerar
      </h3>

      <TextInput
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void generate();
        }}
        placeholder="Um mascote dinossauro vermelho simpático…"
      />

      <div className="flex gap-1.5">
        <Select
          value={providerId}
          onChange={(next) => {
            setProviderId(next);
            const provider = providers.find((p) => p.id === next);
            setModel(provider?.models[0]?.id ?? '');
            setSize(provider?.models[0]?.sizes?.[0] ?? '1024x1024');
          }}
          options={providers.map((provider) => ({
            label: provider.configured ? provider.label : `${provider.label} (sem chave)`,
            value: provider.id,
          }))}
        />
        <Select
          value={model}
          onChange={(next) => {
            setModel(next);
            const found = active?.models.find((m) => m.id === next);
            setSize(found?.sizes?.[0] ?? '1024x1024');
          }}
          options={(active?.models ?? []).map((m) => ({ label: m.label, value: m.id }))}
        />
      </div>

      {activeModel?.sizes && activeModel.sizes.length > 1 && (
        <Select
          value={size}
          onChange={setSize}
          options={activeModel.sizes.map((value) => ({ label: value, value }))}
        />
      )}

      <Button
        size="sm"
        variant="primary"
        className="w-full"
        onClick={() => void generate()}
        disabled={!prompt.trim() || generating}
      >
        {generating ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
        {generating ? 'Gerando…' : 'Gerar'}
      </Button>

      {active && !active.configured && active.locality === 'cloud' && (
        <p className="text-[10.5px] leading-relaxed text-caution">
          {active.label} needs an API key — add yours under Settings, or run a local image server
          and pick it above.
        </p>
      )}
    </section>
  );
}
