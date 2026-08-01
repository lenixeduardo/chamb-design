import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Credential and base-URL resolution for the three server routes that talk to a
 * model provider.
 *
 * Two headers arrive from the browser: the user's own key, and an optional base
 * URL so someone can point a provider at their own gateway or at a model server
 * on their network. The base URL is the dangerous one — it decides *where* the
 * server opens a connection, and the key travels with it.
 *
 * Two rules follow from that, and this module exists so all three routes get
 * both:
 *
 *   1. **A request may never redirect a credential it did not supply.** If the
 *      key came from a server environment variable, the base URL header is
 *      refused outright. Otherwise an anonymous caller could send nothing but
 *      `x-od-base-url` and have a deployment post its own `ANTHROPIC_API_KEY`
 *      to a host of their choosing.
 *   2. **The server must not be a probe for its own network.** Link-local
 *      addresses (cloud metadata lives at 169.254.169.254) are refused for
 *      every provider. Loopback and private ranges are refused for cloud
 *      providers and allowed only for local ones — reaching an Ollama or an
 *      image server on the LAN is the whole point of those.
 */

/** Header carrying a user-supplied key. Never echoed back in a response. */
export const KEY_HEADER = 'x-od-api-key';
export const BASE_URL_HEADER = 'x-od-base-url';

/**
 * How long a provider call may take before the server hangs up.
 *
 * Generous on purpose: a full design generation streams for a while, and image
 * models are slower still. The point is not to be strict, it is that an
 * unbounded connection is a free way to exhaust a deployment.
 */
export const PROVIDER_TIMEOUT_MS = Number(process.env.OPENDESIGN_PROVIDER_TIMEOUT_MS ?? 120_000);

export interface CredentialRequest {
  headers: Headers;
  /** Environment variable this provider's key would come from, if any. */
  envKey: string | undefined;
  /** `local` providers may be pointed at a private address; `cloud` ones may not. */
  locality: 'cloud' | 'local';
}

export interface ResolvedCredentials {
  apiKey: string | undefined;
  baseUrl: string | undefined;
  /** True when the key came from the server's environment, not the request. */
  fromEnv: boolean;
}

export class CredentialError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CredentialError';
  }
}

export async function resolveCredentials({
  headers,
  envKey,
  locality,
}: CredentialRequest): Promise<ResolvedCredentials> {
  const headerKey = headers.get(KEY_HEADER)?.trim();
  const envValue = envKey ? process.env[envKey] : undefined;

  // The user's own key wins: they chose it explicitly, and on a shared
  // deployment it is the only one they should be spending.
  const apiKey = headerKey || envValue || undefined;
  const fromEnv = !headerKey && Boolean(envValue);

  const rawBaseUrl = headers.get(BASE_URL_HEADER)?.trim();
  if (!rawBaseUrl) {
    return { apiKey, baseUrl: undefined, fromEnv };
  }

  if (fromEnv) {
    throw new CredentialError(
      'não é possível redirecionar a chave do servidor para outro endereço — envie sua própria chave em Ajustes para usar um endpoint personalizado',
      403,
    );
  }

  return { apiKey, baseUrl: await assertReachableBaseUrl(rawBaseUrl, locality), fromEnv };
}

/**
 * Validates a caller-supplied base URL and returns it normalised.
 *
 * DNS is resolved here rather than trusting the hostname, because
 * `metadata.example.com` resolving to 169.254.169.254 is exactly the shape this
 * check exists to stop. It is not a complete defence — nothing that resolves
 * once can be — but it closes the direct path.
 */
export async function assertReachableBaseUrl(
  raw: string,
  locality: 'cloud' | 'local',
): Promise<string> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CredentialError(`endpoint inválido: ${raw}`, 400);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new CredentialError(`endpoint precisa usar http ou https: ${raw}`, 400);
  }

  // A cloud provider over plain http would send the key in the clear. The only
  // http worth allowing is a model server on your own machine or network.
  if (url.protocol === 'http:' && locality === 'cloud') {
    throw new CredentialError(`endpoint de provedor na nuvem precisa usar https: ${raw}`, 400);
  }

  for (const address of await resolveAddresses(url.hostname)) {
    const scope = classifyAddress(address);
    if (scope === 'link-local') {
      throw new CredentialError(`endpoint aponta para um endereço interno: ${url.hostname}`, 400);
    }
    if (scope === 'private' && locality === 'cloud') {
      throw new CredentialError(`endpoint aponta para um endereço interno: ${url.hostname}`, 400);
    }
  }

  return url.toString();
}

async function resolveAddresses(hostname: string): Promise<string[]> {
  // Strip the brackets Node's URL keeps around an IPv6 literal.
  const literal = hostname.replace(/^\[|\]$/g, '');
  if (isIP(literal)) return [literal];

  try {
    const results = await lookup(hostname, { all: true });
    return results.map((result) => result.address);
  } catch {
    // A hostname that does not resolve cannot be reached either. Let the
    // provider call fail with its own message rather than inventing one here.
    return [];
  }
}

export type AddressScope = 'public' | 'private' | 'link-local';

/**
 * Classifies an IP literal by how much trust reaching it implies.
 *
 * `link-local` is separated from `private` because the two need different
 * answers: a self-hoster genuinely wants to reach 192.168.x.x, and nobody
 * genuinely wants a web request to reach 169.254.169.254.
 */
export function classifyAddress(address: string): AddressScope {
  const version = isIP(address);

  if (version === 4) {
    const octets = address.split('.').map(Number);
    const [a, b] = octets as [number, number, number, number];

    if (a === 169 && b === 254) return 'link-local';
    if (a === 127) return 'private';
    if (a === 10) return 'private';
    if (a === 192 && b === 168) return 'private';
    if (a === 172 && b >= 16 && b <= 31) return 'private';
    // Carrier-grade NAT and the "this network" block are not the public
    // internet either.
    if (a === 100 && b >= 64 && b <= 127) return 'private';
    if (a === 0) return 'private';
    return 'public';
  }

  if (version === 6) {
    const normalized = address.toLowerCase();
    if (normalized === '::1') return 'private';
    if (normalized === '::') return 'private';
    if (normalized.startsWith('fe80:')) return 'link-local';
    // Unique local addresses: fc00::/7.
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return 'private';
    // IPv4-mapped (::ffff:169.254.169.254) inherits the v4 verdict.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
    if (mapped?.[1]) return classifyAddress(mapped[1]);
    return 'public';
  }

  return 'public';
}

/**
 * A signal that aborts when the client goes away *or* when the provider has had
 * long enough — whichever happens first.
 */
export function providerSignal(request: Request): AbortSignal {
  return AbortSignal.any([request.signal, AbortSignal.timeout(PROVIDER_TIMEOUT_MS)]);
}
