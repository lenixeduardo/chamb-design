const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Deterministic-friendly id generator.
 *
 * Ids are short and URL safe. A custom RNG can be injected so that tests (and
 * AI replay sessions) can reproduce an exact document byte for byte.
 */
export type Rng = () => number;

let rng: Rng = Math.random;

export function setIdRng(next: Rng): void {
  rng = next;
}

export function resetIdRng(): void {
  rng = Math.random;
}

export function createId(prefix = 'n'): string {
  let out = '';
  for (let i = 0; i < 10; i += 1) {
    out += ALPHABET[Math.floor(rng() * ALPHABET.length)] ?? '0';
  }
  return `${prefix}_${out}`;
}

/** Creates a seeded RNG (mulberry32) — used by tests and snapshot replays. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
