# AI providers and the design agent

## Supported out of the box

| Provider           | Locality  | Key                  |
| ------------------ | --------- | -------------------- |
| Claude (Anthropic) | cloud     | `ANTHROPIC_API_KEY`  |
| OpenAI             | cloud     | `OPENAI_API_KEY`     |
| Gemini (Google)    | cloud     | `GOOGLE_API_KEY`     |
| DeepSeek           | cloud     | `DEEPSEEK_API_KEY`   |
| OpenRouter         | cloud     | `OPENROUTER_API_KEY` |
| Ollama             | **local** | none                 |
| LM Studio          | **local** | none                 |

Only providers with a key configured appear as usable in the picker; the rest
are shown but marked, rather than silently missing.

## Where the model runs

Cloud providers are proxied through the server (`/api/ai` in the web app,
`POST /api/ai/generate` in the API), so keys stay in server environment
variables and never reach the browser.

Local providers are **not** proxied. The agent runs in the browser against
`localhost` directly. Routing localhost through a server would break the moment
the server is not the user's own machine — and the entire point of a local model
is that the design data never leaves the desk.

## The agent loop

```
prompt + document + selection + optional reference images
    ↓
build context      compact outline, not raw JSON
    ↓
stream response    tokens surface in the chat as they arrive
    ↓
extract JSON       tolerant of fences, prose and trailing commas
    ↓
validate           zod schemas; invalid ops are dropped, not fatal
    ↓
dry-run            applied to a copy; integrity checked
    ↓
review             contrast, alt text, labels, tap targets, fixed widths
    ↓
repair             failures fed back to the model, bounded retries
    ↓
apply              through the store, into the user's undo stack
```

Two properties matter:

**Atomicity.** If any operation in a batch fails, nothing is applied. The user's
document is never left in a state that the model produced halfway.

**Reviewability.** Because the model emits operations, an AI edit is a normal
commit. `⌘Z` undoes it. The history panel shows it. A collaborator receives it
the same way they would receive a manual edit.

## `insertBlock`

Asking a model to emit forty nodes for a pricing table wastes tokens and invites
mistakes when the library already has one. The agent accepts a pseudo-operation:

```json
{ "type": "insertBlock", "blockId": "lib:pricing-table", "parentId": "n_abc", "index": 2 }
```

It is expanded locally into a real `insertSubtree` using the registry, before
validation. An unknown `blockId` produces an error listing the available ids,
which the repair pass can act on.

## Writing a provider

```ts
import type { ChatProvider, ChatRequest, ChatChunk } from '@opendesign/ai';

export function myProvider(config: ProviderConfig = {}): ChatProvider {
  return {
    id: 'my-provider',
    label: 'My Provider',
    locality: 'cloud',
    models: [{ id: 'model-1', label: 'Model 1', contextWindow: 128000 }],

    async *stream(request: ChatRequest): AsyncIterable<ChatChunk> {
      const response = await (config.fetch ?? fetch)(url, { /* … */ });
      await assertOk(response, 'my-provider');

      for await (const event of parseSSE(response, 'my-provider')) {
        const delta = /* pull text out of the event */;
        if (delta) yield { delta, done: false };
      }

      yield { delta: '', done: true };
    },
  };
}
```

Requirements:

- **No SDKs.** Use `fetch`. It keeps the package dependency-free and edge-ready,
  and a `fetch` implementation can be injected for tests.
- **Always yield a final `done` chunk.** Consumers rely on it to close streams.
- **Report usage when the API provides it** — the editor surfaces token counts.
- **Throw `ProviderError`** for failures, so the UI can distinguish a missing
  key from a rate limit from a network fault.

Register it with `context.registerAIProvider`. See
[`plugins/plugin-provider-mistral`](../plugins/plugin-provider-mistral) for a
complete example with tests covering streaming, chunk-boundary buffering, auth
headers and error propagation.

## Context budgeting

`buildDocumentContext` produces the block sent to the model: token names, page
list, the current page outline, and the selection expanded in full detail.
`estimateTokens` gives a rough count for budgeting.

The outline truncates aggressively — depth, children per node, and total lines
are all capped, with explicit `… N more omitted` markers so the model knows
something was elided and can ask for a specific subtree.

The estimate is deliberately not a real tokenizer. It only decides how hard to
truncate, and shipping a 2 MB BPE table for that would be a bad trade.
