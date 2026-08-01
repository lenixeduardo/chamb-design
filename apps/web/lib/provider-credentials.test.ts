import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BASE_URL_HEADER,
  CredentialError,
  KEY_HEADER,
  assertReachableBaseUrl,
  classifyAddress,
  resolveCredentials,
} from './provider-credentials';

const lookup = vi.hoisted(() => vi.fn());
vi.mock('node:dns/promises', () => ({ lookup }));

function headers(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

afterEach(() => {
  lookup.mockReset();
  delete process.env.TEST_PROVIDER_KEY;
});

describe('classifyAddress', () => {
  it('separates the cloud metadata range from ordinary private ranges', () => {
    // These two need different answers: a self-hoster wants 192.168.x.x, and
    // nobody wants a web request reaching the metadata service.
    expect(classifyAddress('169.254.169.254')).toBe('link-local');
    expect(classifyAddress('192.168.1.10')).toBe('private');
  });

  it('classifies the private IPv4 ranges', () => {
    expect(classifyAddress('127.0.0.1')).toBe('private');
    expect(classifyAddress('10.0.0.1')).toBe('private');
    expect(classifyAddress('172.16.0.1')).toBe('private');
    expect(classifyAddress('172.31.255.255')).toBe('private');
    expect(classifyAddress('100.64.0.1')).toBe('private');
    expect(classifyAddress('0.0.0.0')).toBe('private');
  });

  it('does not mistake neighbours of the private ranges for private', () => {
    expect(classifyAddress('172.15.0.1')).toBe('public');
    expect(classifyAddress('172.32.0.1')).toBe('public');
    expect(classifyAddress('192.167.1.1')).toBe('public');
    expect(classifyAddress('100.128.0.1')).toBe('public');
    expect(classifyAddress('8.8.8.8')).toBe('public');
  });

  it('classifies IPv6, including the v4-mapped form of the metadata address', () => {
    expect(classifyAddress('::1')).toBe('private');
    expect(classifyAddress('fd00::1')).toBe('private');
    expect(classifyAddress('fe80::1')).toBe('link-local');
    expect(classifyAddress('::ffff:169.254.169.254')).toBe('link-local');
    expect(classifyAddress('::ffff:10.0.0.1')).toBe('private');
    expect(classifyAddress('2606:4700::1111')).toBe('public');
  });
});

describe('assertReachableBaseUrl', () => {
  it('accepts a public https endpoint for a cloud provider', async () => {
    lookup.mockResolvedValue([{ address: '104.18.0.1', family: 4 }]);
    await expect(assertReachableBaseUrl('https://gateway.example.com/v1', 'cloud')).resolves.toBe(
      'https://gateway.example.com/v1',
    );
  });

  it('refuses a hostname that resolves to the metadata address, for every provider', async () => {
    // The hostname looks innocent; only the resolved address gives it away.
    lookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    await expect(
      assertReachableBaseUrl('https://totally-fine.example.com', 'cloud'),
    ).rejects.toThrow(/endereço interno/);
    await expect(
      assertReachableBaseUrl('http://totally-fine.example.com', 'local'),
    ).rejects.toThrow(/endereço interno/);
  });

  it('refuses a private address for a cloud provider but allows it for a local one', async () => {
    lookup.mockResolvedValue([{ address: '192.168.1.50', family: 4 }]);
    await expect(assertReachableBaseUrl('https://models.lan', 'cloud')).rejects.toThrow(
      /endereço interno/,
    );
    await expect(assertReachableBaseUrl('http://models.lan', 'local')).resolves.toBe(
      'http://models.lan/',
    );
  });

  it('allows loopback for a local provider — that is the whole feature', async () => {
    await expect(assertReachableBaseUrl('http://127.0.0.1:11434', 'local')).resolves.toBe(
      'http://127.0.0.1:11434/',
    );
    expect(lookup).not.toHaveBeenCalled();
  });

  it('refuses plain http for a cloud provider, which would send the key in the clear', async () => {
    await expect(assertReachableBaseUrl('http://gateway.example.com', 'cloud')).rejects.toThrow(
      /https/,
    );
  });

  it('refuses a non-http scheme and an unparseable URL', async () => {
    await expect(assertReachableBaseUrl('file:///etc/passwd', 'local')).rejects.toThrow(
      /http ou https/,
    );
    await expect(assertReachableBaseUrl('not a url', 'cloud')).rejects.toThrow(/inválido/);
  });

  it('checks every address a hostname resolves to, not just the first', async () => {
    lookup.mockResolvedValue([
      { address: '104.18.0.1', family: 4 },
      { address: '169.254.169.254', family: 4 },
    ]);
    await expect(
      assertReachableBaseUrl('https://split-horizon.example.com', 'cloud'),
    ).rejects.toThrow(/endereço interno/);
  });
});

describe('resolveCredentials', () => {
  it("prefers the caller's own key over the server's", async () => {
    process.env.TEST_PROVIDER_KEY = 'server-key';
    const resolved = await resolveCredentials({
      headers: headers({ [KEY_HEADER]: 'user-key' }),
      envKey: 'TEST_PROVIDER_KEY',
      locality: 'cloud',
    });
    expect(resolved).toEqual({ apiKey: 'user-key', baseUrl: undefined, fromEnv: false });
  });

  it("falls back to the server's key and marks it as such", async () => {
    process.env.TEST_PROVIDER_KEY = 'server-key';
    const resolved = await resolveCredentials({
      headers: headers({}),
      envKey: 'TEST_PROVIDER_KEY',
      locality: 'cloud',
    });
    expect(resolved).toEqual({ apiKey: 'server-key', baseUrl: undefined, fromEnv: true });
  });

  it("refuses to send the server's own key somewhere the caller picked", async () => {
    // The exfiltration path: send no key at all, only a base URL, and the
    // deployment posts its own credential to your host.
    process.env.TEST_PROVIDER_KEY = 'server-key';
    lookup.mockResolvedValue([{ address: '104.18.0.1', family: 4 }]);

    const attempt = resolveCredentials({
      headers: headers({ [BASE_URL_HEADER]: 'https://attacker.example.com/v1' }),
      envKey: 'TEST_PROVIDER_KEY',
      locality: 'cloud',
    });

    await expect(attempt).rejects.toBeInstanceOf(CredentialError);
    await expect(attempt).rejects.toMatchObject({ status: 403 });
  });

  it('allows a base URL alongside the caller’s own key', async () => {
    process.env.TEST_PROVIDER_KEY = 'server-key';
    lookup.mockResolvedValue([{ address: '104.18.0.1', family: 4 }]);

    const resolved = await resolveCredentials({
      headers: headers({
        [KEY_HEADER]: 'user-key',
        [BASE_URL_HEADER]: 'https://gateway.example.com/v1',
      }),
      envKey: 'TEST_PROVIDER_KEY',
      locality: 'cloud',
    });

    expect(resolved).toEqual({
      apiKey: 'user-key',
      baseUrl: 'https://gateway.example.com/v1',
      fromEnv: false,
    });
  });

  it('leaves a provider with no key and no override untouched', async () => {
    const resolved = await resolveCredentials({
      headers: headers({}),
      envKey: undefined,
      locality: 'local',
    });
    expect(resolved).toEqual({ apiKey: undefined, baseUrl: undefined, fromEnv: false });
  });

  it('surfaces a rejected override as a CredentialError with a 400', async () => {
    lookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    const attempt = resolveCredentials({
      headers: headers({ [KEY_HEADER]: 'user-key', [BASE_URL_HEADER]: 'https://metadata.example' }),
      envKey: 'TEST_PROVIDER_KEY',
      locality: 'cloud',
    });
    await expect(attempt).rejects.toMatchObject({ status: 400 });
  });
});
