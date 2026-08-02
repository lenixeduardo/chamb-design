import { NextResponse } from 'next/server';
import {
  DOCUMENT_SCHEMA_VERSION,
  createId,
  defaultTokens,
  validateDocumentIntegrity,
  type SceneNode,
} from '@opendesign/core';
import { TwentyFirstClient, generateHeroSection, twentyFirstKeyFromEnv } from '@opendesign/mcp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The 21st.dev bridge.
 *
 * Same shape as `/api/ai`, for the same reason: the key may come from the
 * user's browser (pasted in the dialog, stored only there) or from a server
 * environment variable in a deployment that supplies its own. It is forwarded
 * to 21st.dev and never logged or stored.
 *
 * This route exists rather than calling the MCP server from the browser
 * because the endpoint is not CORS-open to arbitrary origins, and because a
 * key that reaches the network from a page is a key in every extension's
 * reach.
 */

const KEY_HEADER = 'x-od-21st-key';

interface HeroRequestBody {
  request: string;
  searchQuery?: string;
  /** Escape hatch for a self-hosted or mirrored MCP endpoint. */
  url?: string;
}

/** Whether this deployment can generate without the user supplying a key. */
export function GET() {
  return NextResponse.json({ configured: Boolean(twentyFirstKeyFromEnv()) });
}

export async function POST(request: Request) {
  let body: HeroRequestBody;
  try {
    body = (await request.json()) as HeroRequestBody;
  } catch {
    return NextResponse.json({ error: 'corpo JSON inválido' }, { status: 400 });
  }

  if (!body.request?.trim()) {
    return NextResponse.json({ error: 'descreva o que você quer na hero' }, { status: 400 });
  }

  const apiKey = request.headers.get(KEY_HEADER)?.trim() || twentyFirstKeyFromEnv();

  // No key is not an error: generation degrades to the built-in hero block,
  // and the client is told which one it got. A modal that refuses to proceed
  // without a key would make the whole template flow depend on an account.
  const client = apiKey
    ? new TwentyFirstClient({ apiKey, ...(body.url ? { url: body.url } : {}) })
    : null;

  try {
    const hero = await generateHeroSection({
      request: body.request,
      client,
      createId,
      ...(body.searchQuery ? { searchQuery: body.searchQuery } : {}),
    });

    // The subtree is about to be inserted into a document in someone's
    // browser. Checking it here means a malformed tree fails as a 502 with a
    // reason, rather than as a corrupted project the editor refuses to open.
    const problems = validateSubtree(hero.nodes, hero.rootId);
    if (problems.length > 0) {
      return NextResponse.json(
        { error: 'a hero gerada não passou na validação', details: problems.slice(0, 10) },
        { status: 502 },
      );
    }

    return NextResponse.json({
      hero: {
        nodes: hero.nodes,
        rootId: hero.rootId,
        source: hero.source,
        warnings: hero.warnings,
        ...(hero.tool ? { tool: hero.tool } : {}),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'falha ao gerar a hero' },
      { status: 502 },
    );
  }
}

/** Reuses the document validator by wrapping the subtree in a throwaway page. */
function validateSubtree(nodes: SceneNode[], rootId: string): string[] {
  const byId = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const root = byId[rootId];
  if (!root) return [`rootId ${rootId} is not part of the returned nodes`];

  const result = validateDocumentIntegrity({
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    id: 'check',
    name: 'check',
    pages: [
      {
        id: 'page',
        name: 'check',
        path: '/',
        rootId,
        canvas: { width: 1440, height: 900 },
      },
    ],
    nodes: { ...byId, [rootId]: { ...root, parent: null } },
    tokens: defaultTokens(),
    themes: [],
    assets: [],
    components: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return result.ok ? [] : result.errors;
}
