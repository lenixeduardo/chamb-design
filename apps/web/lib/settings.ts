'use client';

/**
 * Bring-your-own-key settings.
 *
 * The editor is local-first, so the honest way to let *anyone* generate is to
 * let them paste their own key rather than requiring the person who deployed
 * the app to set a server environment variable. Keys therefore live in the
 * browser and travel with the request that needs them — they are never stored
 * server-side, and a deployment with no keys at all is still fully usable.
 *
 * Two deliberate constraints:
 *
 *   - Keys are held in `localStorage` (or `sessionStorage`, when the user opts
 *     out of remembering) and sent only to `/api/ai` and `/api/images`, which
 *     forward them straight to the model provider. Anything that reads this
 *     module runs in the user's own browser.
 *   - A server environment variable still wins where one is set, so a hosted
 *     deployment that wants to pay for its own key keeps working unchanged.
 */

const STORAGE_KEY = 'opendesign:settings';

/** Which credential a provider draws on. Image providers reuse the text key. */
const CREDENTIAL_ALIASES: Record<string, string> = {
  'openai-images': 'openai',
  'google-images': 'google',
  'local-images': 'local-images',
};

export interface ProviderCredential {
  apiKey?: string;
  /** Override for gateways, proxies and local runtimes. */
  baseUrl?: string;
}

export interface Settings {
  credentials: Record<string, ProviderCredential>;
  /** Last provider/model the user picked, so the choice survives a reload. */
  providerId?: string;
  model?: string;
  /** `session` forgets everything when the tab closes — for shared machines. */
  persist: 'local' | 'session';
}

const EMPTY: Settings = { credentials: {}, persist: 'local' };

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/** Resolves a provider id to the credential slot it reads from. */
export function credentialId(providerId: string): string {
  return CREDENTIAL_ALIASES[providerId] ?? providerId;
}

function parse(raw: string | null): Settings | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      credentials:
        typeof parsed.credentials === 'object' && parsed.credentials !== null
          ? parsed.credentials
          : {},
      persist: parsed.persist === 'session' ? 'session' : 'local',
      ...(parsed.providerId ? { providerId: parsed.providerId } : {}),
      ...(parsed.model ? { model: parsed.model } : {}),
    };
  } catch {
    return null;
  }
}

export function readSettings(): Settings {
  if (!isBrowser()) return EMPTY;
  // Session storage is checked first: when it holds a value the user explicitly
  // asked not to be remembered, and it must shadow anything left in local.
  return (
    parse(window.sessionStorage.getItem(STORAGE_KEY)) ??
    parse(window.localStorage.getItem(STORAGE_KEY)) ??
    EMPTY
  );
}

export function writeSettings(settings: Settings): void {
  if (!isBrowser()) return;

  const serialized = JSON.stringify(settings);
  if (settings.persist === 'session') {
    window.sessionStorage.setItem(STORAGE_KEY, serialized);
    // Moving to session-only must not leave a copy behind on disk.
    window.localStorage.removeItem(STORAGE_KEY);
  } else {
    window.localStorage.setItem(STORAGE_KEY, serialized);
    window.sessionStorage.removeItem(STORAGE_KEY);
  }

  notify();
}

export function clearSettings(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.sessionStorage.removeItem(STORAGE_KEY);
  notify();
}

export function getCredential(providerId: string): ProviderCredential | undefined {
  const credential = readSettings().credentials[credentialId(providerId)];
  if (!credential) return undefined;
  if (!credential.apiKey && !credential.baseUrl) return undefined;
  return credential;
}

export function setCredential(providerId: string, credential: ProviderCredential): void {
  const settings = readSettings();
  const id = credentialId(providerId);
  const apiKey = credential.apiKey?.trim();
  const baseUrl = credential.baseUrl?.trim();

  const next = { ...settings.credentials };
  if (!apiKey && !baseUrl) {
    delete next[id];
  } else {
    next[id] = { ...(apiKey ? { apiKey } : {}), ...(baseUrl ? { baseUrl } : {}) };
  }

  writeSettings({ ...settings, credentials: next });
}

export function setLastModel(providerId: string, model: string): void {
  const settings = readSettings();
  if (settings.providerId === providerId && settings.model === model) return;
  writeSettings({ ...settings, providerId, model });
}

export function hasKey(providerId: string): boolean {
  return Boolean(getCredential(providerId)?.apiKey);
}

/* -------------------------------------------------------------------------- */
/*                                Subscription                                */
/* -------------------------------------------------------------------------- */

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Subscribe to setting changes — including changes made in another tab. */
export function subscribeToSettings(listener: () => void): () => void {
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) listener();
  };
  if (isBrowser()) window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(listener);
    if (isBrowser()) window.removeEventListener('storage', onStorage);
  };
}

/** Shows `sk-…abcd` — enough to recognise a key without revealing it. */
export function maskKey(key: string): string {
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}
