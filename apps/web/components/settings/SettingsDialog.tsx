'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Cpu,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  KeyRound,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  clearSettings,
  credentialId,
  getCredential,
  maskKey,
  readSettings,
  setCredential,
  writeSettings,
} from '@/lib/settings';
import { Badge, Button } from '@/components/ui/primitives';
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

  // Bound once, reading the callback through a ref. Keying the effect on
  // `onClose` — an inline arrow at every call site — would detach and reattach
  // the listener on each render, and a key pressed while a render is in flight
  // would fall into that gap.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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
          : { status: 'failed', message: data.error ?? 'the provider rejected the request' },
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
    if (!window.confirm('Remove every key and preference stored in this browser?')) return;
    clearSettings();
    setDrafts({});
    setChecks({});
    setVersion((n) => n + 1);
  };

  const cloud = providers.filter((provider) => provider.locality === 'cloud');
  const local = providers.filter((provider) => provider.locality === 'local');

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="animate-fade-up flex h-[min(720px,88vh)] w-[min(620px,94vw)] flex-col overflow-hidden rounded-2xl border border-hairline bg-panel"
      >
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-hairline px-4">
          <div className="flex items-center gap-2">
            <KeyRound size={14} className="text-brand-soft" />
            <h2 className="text-[13px] font-medium">Settings</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="grid h-7 w-7 place-items-center rounded-md text-ink-muted hover:bg-panel-raised hover:text-ink"
          >
            <X size={14} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
          <section className="flex gap-2.5 rounded-xl border border-hairline bg-shell p-3">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-positive" />
            <div className="space-y-1">
              <p className="text-[12px] font-medium text-ink">Your key stays yours</p>
              <p className="text-[11.5px] leading-relaxed text-ink-faint">
                Keys are stored in this browser and attached to the requests that need them, which
                forward straight to the model provider. Nothing is written to a database, and no
                other user of this deployment can see them. On a shared computer, turn off “Remember
                on this device” below.
              </p>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-[10px] font-medium tracking-[0.14em] text-ink-faint uppercase">
              Model providers
            </h3>

            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((key) => (
                  <div
                    key={key}
                    className="h-[86px] animate-pulse-soft rounded-xl border border-hairline bg-shell"
                  />
                ))}
              </div>
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
                On your machine
              </h3>
              <p className="text-[11.5px] leading-relaxed text-ink-faint">
                No key needed. Point these at the port your runtime listens on — the browser talks
                to it directly, so nothing leaves your machine.
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
              Storage
            </h3>
            <label className="flex items-start gap-2.5 rounded-xl border border-hairline bg-shell p-3">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => toggleRemember(event.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 accent-[var(--color-brand,#6366f1)]"
              />
              <span className="space-y-0.5">
                <span className="block text-[12px] text-ink">Remember on this device</span>
                <span className="block text-[11.5px] leading-relaxed text-ink-faint">
                  Off means keys are kept only until this tab closes.
                </span>
              </span>
            </label>
            <Button size="sm" variant="danger" onClick={forgetEverything}>
              <Trash2 size={12} />
              Forget everything in this browser
            </Button>
          </section>
        </div>
      </div>
    </div>
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
    <li className="space-y-2 rounded-xl border border-hairline bg-shell p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] font-medium text-ink">{provider.label}</span>
          {saved ? (
            <Badge tone="positive">key saved · {maskKey(saved)}</Badge>
          ) : provider.configured ? (
            <Badge tone="brand">using this server’s key</Badge>
          ) : (
            <Badge>no key</Badge>
          )}
        </div>
        {source && (
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-[11px] text-ink-faint transition-colors hover:text-brand-soft"
          >
            {source.hint}
            <ExternalLink size={10} />
          </a>
        )}
      </div>

      <div className="flex gap-1.5">
        <div className="relative min-w-0 flex-1">
          <input
            type={revealed ? 'text' : 'password'}
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && draft.trim()) onSave();
            }}
            placeholder={saved ? 'Replace the saved key…' : 'Paste your API key'}
            autoComplete="off"
            spellCheck={false}
            aria-label={`${provider.label} API key`}
            className={cn(
              'h-8 w-full rounded-lg border border-hairline bg-panel pr-8 pl-2.5 font-mono text-[12px] text-ink',
              'placeholder:font-sans placeholder:text-ink-faint',
              'transition-colors focus:border-brand focus:outline-none',
            )}
          />
          <button
            type="button"
            onClick={onReveal}
            aria-label={revealed ? 'Hide key' : 'Show key'}
            className="absolute top-1/2 right-1 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-ink-faint hover:text-ink"
          >
            {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        </div>

        <Button size="sm" variant="primary" disabled={!draft.trim()} onClick={onSave}>
          Save
        </Button>
        {saved && (
          <>
            <Button size="sm" onClick={onCheck} disabled={check.status === 'checking'}>
              {check.status === 'checking' ? (
                <Loader2 size={11} className="animate-spin" />
              ) : check.status === 'ok' ? (
                <Check size={11} className="text-positive" />
              ) : null}
              Test
            </Button>
            <Button size="sm" variant="ghost" onClick={onRemove} aria-label="Remove saved key">
              <Trash2 size={12} />
            </Button>
          </>
        )}
      </div>

      {check.status === 'ok' && (
        <p className="text-[11px] text-positive">Working — this key can generate designs.</p>
      )}
      {check.status === 'failed' && (
        <p className="text-[11px] leading-relaxed text-critical">{check.message}</p>
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
    <li className="space-y-2 rounded-xl border border-hairline bg-shell p-3">
      <div className="flex items-center gap-2">
        <Cpu size={12} className="text-positive" />
        <span className="text-[12.5px] font-medium text-ink">{provider.label}</span>
        {saved && <Badge tone="positive">{saved}</Badge>}
      </div>
      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && draft.trim()) onSave();
          }}
          placeholder={saved ?? LOCAL_DEFAULTS[provider.id] ?? 'http://localhost:11434'}
          spellCheck={false}
          aria-label={`${provider.label} server URL`}
          className={cn(
            'h-8 min-w-0 flex-1 rounded-lg border border-hairline bg-panel px-2.5 font-mono text-[12px] text-ink',
            'placeholder:font-sans placeholder:text-ink-faint',
            'transition-colors focus:border-brand focus:outline-none',
          )}
        />
        <Button size="sm" disabled={!draft.trim()} onClick={onSave}>
          Save
        </Button>
        {saved && (
          <Button size="sm" variant="ghost" onClick={onRemove} aria-label="Reset server URL">
            <Trash2 size={12} />
          </Button>
        )}
      </div>
    </li>
  );
}
