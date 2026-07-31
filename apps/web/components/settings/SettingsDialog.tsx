'use client';

import { useEffect, useState } from 'react';
import { Check, Cpu, ExternalLink, Eye, EyeOff, KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import {
  clearSettings,
  credentialId,
  getCredential,
  maskKey,
  readSettings,
  setCredential,
  writeSettings,
} from '@/lib/settings';
import { Badge, Button, Spinner } from '@/components/ui/primitives';
import { Overlay, OverlayHeader } from '@/components/ui/overlay';
import { ProviderRowSkeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Settings.
 *
 * This dialog is what turns the app from "usable by whoever deployed it" into
 * "usable by anyone": paste a key, generate. The key is stored in this browser
 * and forwarded to the provider on each request — so the surrounding copy has
 * to say exactly that, in plain language, next to the input rather than buried
 * in a doc nobody opens.
 */

interface ProviderInfo {
  id: string;
  label: string;
  locality: 'cloud' | 'local';
  /** Whether the *server* already has a key for this provider. */
  configured: boolean;
  models: { id: string; label: string }[];
}

/** Where to get a key, for the providers that have an obvious front door. */
const KEY_SOURCES: Record<string, { url: string; hint: string }> = {
  anthropic: { url: 'https://console.anthropic.com/settings/keys', hint: 'console.anthropic.com' },
  openai: { url: 'https://platform.openai.com/api-keys', hint: 'platform.openai.com' },
  google: { url: 'https://aistudio.google.com/apikey', hint: 'aistudio.google.com' },
  deepseek: { url: 'https://platform.deepseek.com/api_keys', hint: 'platform.deepseek.com' },
  openrouter: { url: 'https://openrouter.ai/keys', hint: 'openrouter.ai' },
};

const LOCAL_DEFAULTS: Record<string, string> = {
  ollama: 'http://localhost:11434',
  lmstudio: 'http://localhost:1234/v1',
};

type CheckState = { status: 'idle' | 'checking' | 'ok' | 'failed'; message?: string };

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [checks, setChecks] = useState<Record<string, CheckState>>({});
  const [remember, setRemember] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    setRemember(readSettings().persist === 'local');
  }, []);

  useEffect(() => {
    fetch('/api/ai')
      .then((response) => response.json())
      .then((data: { providers: ProviderInfo[] }) => setProviders(data.providers ?? []))
      .catch(() => setProviders([]))
      .finally(() => setLoading(false));
  }, []);

  const save = (provider: ProviderInfo) => {
    const draft = drafts[provider.id] ?? '';
    if (provider.locality === 'local') {
      setCredential(provider.id, { baseUrl: draft });
    } else {
      setCredential(provider.id, { apiKey: draft });
    }
    setDrafts((current) => ({ ...current, [provider.id]: '' }));
    setChecks((current) => ({ ...current, [provider.id]: { status: 'idle' } }));
    setVersion((n) => n + 1);
  };

  const remove = (provider: ProviderInfo) => {
    setCredential(provider.id, {});
    setDrafts((current) => ({ ...current, [provider.id]: '' }));
    setChecks((current) => ({ ...current, [provider.id]: { status: 'idle' } }));
    setVersion((n) => n + 1);
  };

  const check = async (provider: ProviderInfo) => {
    const credential = getCredential(provider.id);
    setChecks((current) => ({ ...current, [provider.id]: { status: 'checking' } }));

    try {
      const response = await fetch('/api/ai/verify', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(credential?.apiKey ? { 'x-od-api-key': credential.apiKey } : {}),
          ...(credential?.baseUrl ? { 'x-od-base-url': credential.baseUrl } : {}),
        },
        body: JSON.stringify({ providerId: provider.id, model: provider.models[0]?.id }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };

      setChecks((current) => ({
        ...current,
        [provider.id]: data.ok
          ? { status: 'ok' }
          : { status: 'failed', message: data.error ?? 'o provedor recusou a requisição' },
      }));
    } catch (error) {
      setChecks((current) => ({
        ...current,
        [provider.id]: {
          status: 'failed',
          message: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  };

  const toggleRemember = (next: boolean) => {
    setRemember(next);
    // Rewriting moves the existing credentials to the other storage, so the
    // toggle takes effect on keys that are already saved, not just new ones.
    writeSettings({ ...readSettings(), persist: next ? 'local' : 'session' });
    setVersion((n) => n + 1);
  };

  const forgetEverything = () => {
    if (!window.confirm('Remover todas as chaves e preferências guardadas neste navegador?'))
      return;
    clearSettings();
    setDrafts({});
    setChecks({});
    setVersion((n) => n + 1);
  };

  const cloud = providers.filter((provider) => provider.locality === 'cloud');
  const local = providers.filter((provider) => provider.locality === 'local');

  return (
    <Overlay size="md" label="Ajustes" onClose={onClose}>
      <OverlayHeader
        icon={<KeyRound size={14} className="shrink-0 text-brand-soft" />}
        title="Ajustes"
      />

      <div className="touch-pane min-h-0 flex-1 space-y-6 overflow-y-auto p-4 pb-safe">
        <section className="rounded-surface flex gap-2.5 border border-hairline bg-panel-raised p-3">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-positive" />
          <div className="space-y-1">
            <p className="text-[12px] font-medium text-ink">Sua chave continua sua</p>
            <p className="text-[11.5px] leading-relaxed text-ink-faint">
              As chaves ficam guardadas neste navegador e são anexadas às requisições que precisam
              delas, que seguem direto para o provedor do modelo. Nada é gravado em banco de dados,
              e nenhum outro usuário desta instalação consegue vê-las. Em um computador
              compartilhado, desligue “Lembrar neste dispositivo” abaixo.
            </p>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-[10px] font-medium tracking-[0.14em] text-ink-faint uppercase">
            Provedores de modelo
          </h3>

          {loading ? (
            <ProviderRowSkeleton rows={3} />
          ) : (
            <ul className="space-y-2">
              {cloud.map((provider) => (
                <ProviderRow
                  key={`${provider.id}-${version}`}
                  provider={provider}
                  draft={drafts[provider.id] ?? ''}
                  revealed={Boolean(revealed[provider.id])}
                  check={checks[provider.id] ?? { status: 'idle' }}
                  onDraft={(value) =>
                    setDrafts((current) => ({ ...current, [provider.id]: value }))
                  }
                  onReveal={() =>
                    setRevealed((current) => ({
                      ...current,
                      [provider.id]: !current[provider.id],
                    }))
                  }
                  onSave={() => save(provider)}
                  onRemove={() => remove(provider)}
                  onCheck={() => void check(provider)}
                />
              ))}
            </ul>
          )}
        </section>

        {local.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-[10px] font-medium tracking-[0.14em] text-ink-faint uppercase">
              Na sua máquina
            </h3>
            <p className="text-[11.5px] leading-relaxed text-ink-faint">
              Não precisa de chave. Aponte para a porta em que seu runtime escuta — o navegador fala
              com ele direto, então nada sai da sua máquina.
            </p>
            <ul className="space-y-2">
              {local.map((provider) => (
                <LocalRow
                  key={`${provider.id}-${version}`}
                  provider={provider}
                  draft={drafts[provider.id] ?? ''}
                  onDraft={(value) =>
                    setDrafts((current) => ({ ...current, [provider.id]: value }))
                  }
                  onSave={() => save(provider)}
                  onRemove={() => remove(provider)}
                />
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-2">
          <h3 className="text-[10px] font-medium tracking-[0.14em] text-ink-faint uppercase">
            Armazenamento
          </h3>
          <label className="rounded-surface flex items-start gap-2.5 border border-hairline bg-panel-raised p-3">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => toggleRemember(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-brand)]"
            />
            <span className="space-y-0.5">
              <span className="block text-[12px] text-ink">Lembrar neste dispositivo</span>
              <span className="block text-[11.5px] leading-relaxed text-ink-faint">
                Desligado, as chaves duram só até esta aba fechar.
              </span>
            </span>
          </label>
          <Button size="sm" variant="danger" onClick={forgetEverything}>
            <Trash2 size={12} />
            Esquecer tudo neste navegador
          </Button>
        </section>
      </div>
    </Overlay>
  );
}

function ProviderRow({
  provider,
  draft,
  revealed,
  check,
  onDraft,
  onReveal,
  onSave,
  onRemove,
  onCheck,
}: {
  provider: ProviderInfo;
  draft: string;
  revealed: boolean;
  check: CheckState;
  onDraft: (value: string) => void;
  onReveal: () => void;
  onSave: () => void;
  onRemove: () => void;
  onCheck: () => void;
}) {
  const saved = getCredential(provider.id)?.apiKey;
  const source = KEY_SOURCES[credentialId(provider.id)];

  return (
    <li className="rounded-surface space-y-2 border border-hairline bg-panel p-3">
      {/* Wraps rather than compressing: at 390px the name, the status badge and
          the "where to get a key" link do not share a line, and squeezing them
          broke provider names across two lines mid-parenthesis. */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[12.5px] font-medium whitespace-nowrap text-ink">
            {provider.label}
          </span>
          {saved ? (
            <Badge tone="positive">chave salva · {maskKey(saved)}</Badge>
          ) : provider.configured ? (
            <Badge tone="brand">usando a chave deste servidor</Badge>
          ) : (
            <Badge>sem chave</Badge>
          )}
        </div>
        {source && (
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex shrink-0 items-center gap-1 py-0.5 text-[11px] whitespace-nowrap text-ink-faint transition-colors hover:text-brand-soft"
          >
            {source.hint}
            <ExternalLink size={10} />
          </a>
        )}
      </div>

      {/* Wraps on a phone: the key field, Salvar, Testar and the delete button
          do not fit on one 360px line, and a horizontally squeezed key field is
          the one control here that has to be readable. */}
      <div className="flex flex-wrap gap-1.5">
        <div className="relative w-full min-w-0 sm:flex-1">
          <input
            type={revealed ? 'text' : 'password'}
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && draft.trim()) onSave();
            }}
            placeholder={saved ? 'Substituir a chave salva…' : 'Cole sua chave de API'}
            autoComplete="off"
            spellCheck={false}
            aria-label={`Chave de API — ${provider.label}`}
            className={cn(
              'h-10 w-full rounded-chip border border-hairline bg-panel-raised pr-10 pl-3.5 font-mono text-[16px] text-ink',
              'sm:h-8 sm:pr-8 sm:text-[12px]',
              'placeholder:font-sans placeholder:text-ink-faint',
              'transition-colors focus:border-brand focus:outline-none',
            )}
          />
          <button
            type="button"
            onClick={onReveal}
            aria-label={revealed ? 'Ocultar chave' : 'Mostrar chave'}
            aria-pressed={revealed}
            className="tap-target absolute top-1/2 right-1.5 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-[9px] text-ink-faint hover:text-ink sm:right-1 sm:h-6 sm:w-6 sm:rounded-md"
          >
            {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>

        <Button size="sm" variant="primary" disabled={!draft.trim()} onClick={onSave}>
          Salvar
        </Button>
        {saved && (
          <>
            <Button size="sm" onClick={onCheck} loading={check.status === 'checking'}>
              {check.status === 'ok' && <Check size={11} className="text-positive" />}
              Testar
            </Button>
            <Button size="sm" variant="ghost" onClick={onRemove} aria-label="Remover chave salva">
              <Trash2 size={12} />
            </Button>
          </>
        )}
      </div>

      {check.status === 'checking' && (
        <p className="flex items-center gap-1.5 text-[11px] text-ink-faint">
          <Spinner size={11} />
          Falando com {provider.label}…
        </p>
      )}
      {check.status === 'ok' && (
        <p className="animate-fade-up text-[11px] text-positive">
          Funcionando — esta chave consegue gerar designs.
        </p>
      )}
      {check.status === 'failed' && (
        <p className="animate-fade-up text-[11px] leading-relaxed text-critical">{check.message}</p>
      )}
    </li>
  );
}

function LocalRow({
  provider,
  draft,
  onDraft,
  onSave,
  onRemove,
}: {
  provider: ProviderInfo;
  draft: string;
  onDraft: (value: string) => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  const saved = getCredential(provider.id)?.baseUrl;

  return (
    <li className="rounded-surface space-y-2 border border-hairline bg-panel p-3">
      <div className="flex items-center gap-2">
        <Cpu size={12} className="text-positive" />
        <span className="text-[12.5px] font-medium text-ink">{provider.label}</span>
        {saved && <Badge tone="positive">{saved}</Badge>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <input
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && draft.trim()) onSave();
          }}
          placeholder={saved ?? LOCAL_DEFAULTS[provider.id] ?? 'http://localhost:11434'}
          spellCheck={false}
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          aria-label={`URL do servidor — ${provider.label}`}
          className={cn(
            'h-10 w-full min-w-0 rounded-chip border border-hairline bg-panel-raised px-3.5 font-mono text-[16px] text-ink',
            'sm:h-8 sm:w-auto sm:flex-1 sm:text-[12px]',
            'placeholder:font-sans placeholder:text-ink-faint',
            'transition-colors focus:border-brand focus:outline-none',
          )}
        />
        <Button size="sm" disabled={!draft.trim()} onClick={onSave}>
          Salvar
        </Button>
        {saved && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onRemove}
            aria-label="Redefinir URL do servidor"
          >
            <Trash2 size={12} />
          </Button>
        )}
      </div>
    </li>
  );
}
