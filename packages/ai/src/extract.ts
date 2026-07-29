/**
 * Getting structured data out of a language model.
 *
 * Even with JSON mode, real responses arrive wrapped in prose, fenced in
 * markdown, or with a trailing comma. Failing the whole generation over that
 * would be a terrible experience, so extraction is deliberately forgiving —
 * while validation downstream stays strict.
 */

export interface ExtractedResponse<T = unknown> {
  /** Prose outside the JSON block — shown in the chat transcript. */
  message: string;
  json?: T;
  error?: string;
}

/** Finds the first balanced JSON object or array, respecting strings. */
export function findJsonBlock(text: string): { json: string; start: number; end: number } | null {
  const openers = ['{', '['];

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (!openers.includes(char)) continue;

    const closer = char === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let j = i; j < text.length; j += 1) {
      const current = text[j]!;

      if (escaped) {
        escaped = false;
        continue;
      }
      if (current === '\\') {
        escaped = true;
        continue;
      }
      if (current === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (current === char) depth += 1;
      else if (current === closer) {
        depth -= 1;
        if (depth === 0) {
          return { json: text.slice(i, j + 1), start: i, end: j + 1 };
        }
      }
    }
  }

  return null;
}

/** Removes trailing commas, which models emit constantly and JSON forbids. */
function repairJson(input: string): string {
  return input.replace(/,\s*([}\]])/g, '$1');
}

export function extractJson<T = unknown>(text: string): ExtractedResponse<T> {
  const fenced = /```(?:json)?\s*\n([\s\S]*?)```/i.exec(text);
  const candidate = fenced?.[1]?.trim();

  if (fenced && candidate) {
    const parsed = tryParse<T>(candidate);
    if (parsed.ok) {
      const message = `${text.slice(0, fenced.index)}${text.slice(
        fenced.index + fenced[0].length,
      )}`.trim();
      return { message, json: parsed.value };
    }
  }

  const block = findJsonBlock(text);
  if (block) {
    const parsed = tryParse<T>(block.json);
    if (parsed.ok) {
      const message = `${text.slice(0, block.start)}${text.slice(block.end)}`.trim();
      return { message, json: parsed.value };
    }
    return { message: text.trim(), error: parsed.error };
  }

  return { message: text.trim(), error: 'no JSON block found in the response' };
}

function tryParse<T>(input: string): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(input) as T };
  } catch {
    try {
      return { ok: true, value: JSON.parse(repairJson(input)) as T };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

/**
 * Pulls operations out of a response.
 *
 * Accepts three shapes models reliably produce: a bare array, `{operations: []}`
 * and `{ops: []}`.
 */
export function extractOperations(text: string): ExtractedResponse<unknown[]> {
  const extracted = extractJson<unknown>(text);
  if (extracted.json === undefined) {
    return extracted.error
      ? { message: extracted.message, error: extracted.error }
      : { message: extracted.message };
  }

  const value = extracted.json;

  if (Array.isArray(value)) {
    return { message: extracted.message, json: value };
  }

  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const list = record.operations ?? record.ops;

    if (Array.isArray(list)) {
      const message =
        typeof record.message === 'string' && record.message.length > 0
          ? record.message
          : extracted.message;
      return { message, json: list };
    }
  }

  return {
    message: extracted.message,
    error: 'expected an array of operations, or an object with an "operations" key',
  };
}
