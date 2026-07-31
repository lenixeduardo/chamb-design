'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Sparkles, Trash2, Upload, Wand2 } from 'lucide-react';
import type { Asset } from '@opendesign/core';
import { findOrphanAssets } from '@opendesign/assets';
import { useDocument, type Editor } from '@opendesign/editor';
import { getIngestor, imageFilesFrom } from '@/lib/assets';
import { getCredential, hasKey, subscribeToSettings } from '@/lib/settings';
import { Badge, Button, EmptyState, Panel, Select, TextInput } from '@/components/ui/primitives';
import { AssetTileSkeleton, Skeleton } from '@/components/ui/skeleton';
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
  // How many tiles are on their way in — from an upload, a paste or a
  // generation. They are drawn as placeholders at the head of the grid so the
  // work appears where its result will appear, rather than as a status line
  // somewhere else on the panel.
  const [pending, setPending] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    editor.setIngestor(getIngestor());
  }, [editor]);

  const ingest = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setError(null);
      setBusy(`Adicionando ${files.length} arquivo${files.length === 1 ? '' : 's'}…`);
      setPending((count) => count + files.length);

      try {
        // Decremented per file rather than all at once, so a batch of eight
        // images visibly drains one placeholder at a time.
        for (const file of files) {
          await editor.addAssetFromFile(file);
          setPending((count) => Math.max(0, count - 1));
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
        setPending(0);
      } finally {
        setBusy(null);
        setPending(0);
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

        <GenerateImage
          editor={editor}
          onError={setError}
          onGenerating={(generating) => setPending((count) => (generating ? count + 1 : 0))}
        />

        {busy && (
          <p className="flex items-center gap-1.5 text-[11px] text-ink-faint">
            <Loader2 size={11} className="animate-spin" />
            {busy}
          </p>
        )}

        {error && (
          <p className="animate-fade-up rounded-md border border-critical/25 bg-critical/8 px-2 py-1.5 text-[11px] leading-relaxed text-critical">
            {error}
          </p>
        )}

        {document.assets.length === 0 && pending === 0 ? (
          <EmptyState
            icon={<ImageIcon size={18} />}
            title="Nenhum recurso ainda"
            description="Tudo que você adicionar aqui pode ser solto no canvas ou usado para substituir uma imagem existente."
          />
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {Array.from({ length: pending }, (_, index) => (
              <AssetTileSkeleton key={`pending-${index}`} label="Chegando…" />
            ))}
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
  // Assets can be remote URLs, and a lazily-loaded one paints as an empty box
  // until it arrives. The skeleton sits *behind* the image rather than swapping
  // with it, so the browser still gets to decode progressively and the tile
  // never changes size.
  const [loaded, setLoaded] = useState(false);

  return (
    <li className="group animate-fade-up relative overflow-hidden rounded-lg border border-hairline bg-shell">
      <button
        type="button"
        onClick={onPlace}
        title={`Colocar "${asset.name}" no canvas`}
        className="block w-full"
      >
        <span className="relative grid h-20 place-items-center overflow-hidden bg-panel-raised">
          {!loaded && <Skeleton className="absolute inset-0 rounded-none" />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={asset.url}
            alt={asset.alt ?? asset.name}
            className={cn(
              'relative max-h-20 w-full object-contain transition-opacity duration-200',
              loaded ? 'opacity-100' : 'opacity-0',
            )}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            // A broken asset should still reveal its filename and controls
            // rather than shimmering forever.
            onError={() => setLoaded(true)}
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

      <div className="reveal-on-hover absolute top-1 right-1 flex gap-1.5">
        <button
          type="button"
          onClick={onReplace}
          aria-label={`Substituir a imagem selecionada por ${asset.name}`}
          title="Substituir a imagem selecionada por este recurso"
          className="grid h-7 w-7 place-items-center rounded-md bg-shell/90 text-ink-muted backdrop-blur-sm hover:text-ink"
        >
          <ImageIcon size={12} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover ${asset.name} da biblioteca`}
          title="Remover da biblioteca"
          className="grid h-7 w-7 place-items-center rounded-md bg-shell/90 text-ink-muted backdrop-blur-sm hover:text-critical"
        >
          <Trash2 size={12} />
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
  onGenerating,
}: {
  editor: Editor;
  onError: (message: string | null) => void;
  /** Lets the panel draw a placeholder tile where the result will land. */
  onGenerating: (generating: boolean) => void;
}) {
  const [served, setServed] = useState<ImageProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
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
      .catch(() => setServed([]))
      .finally(() => setLoading(false));
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
    onGenerating(true);
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
      onGenerating(false);
    }
  };

  // While the provider list is in flight the section holds its own shape.
  // Returning `null` and then appearing pushed the whole asset grid down a
  // beat after the panel had settled, which on a phone is a tap landing on the
  // wrong tile.
  if (loading) {
    return (
      <section className="space-y-2 rounded-xl border border-hairline bg-shell p-2.5">
        <Skeleton className="skeleton-line h-2.5 w-14" />
        <Skeleton className="h-9 w-full rounded-full sm:h-7" />
        <div className="flex gap-1.5">
          <Skeleton className="h-9 flex-1 rounded-full sm:h-7" />
          <Skeleton className="h-9 flex-1 rounded-full sm:h-7" />
        </div>
        <Skeleton className="h-9 w-full rounded-full sm:h-7" />
      </section>
    );
  }

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
        loading={generating}
        disabled={!prompt.trim()}
      >
        {!generating && <Sparkles size={11} />}
        {generating ? 'Gerando…' : 'Gerar'}
      </Button>

      {active && !active.configured && active.locality === 'cloud' && (
        <p className="text-[10.5px] leading-relaxed text-caution">
          {active.label} precisa de uma chave de API — adicione a sua em Ajustes, ou rode um
          servidor de imagens na sua máquina e selecione-o acima.
        </p>
      )}
    </section>
  );
}
