import { NextResponse } from 'next/server';
import { exportProject } from '@opendesign/exporters';
import { validateDocumentIntegrity, type DesignDocument } from '@opendesign/core';
import { getRegistry } from '@/lib/registry';

export const runtime = 'nodejs';

/**
 * Server-side export.
 *
 * The editor exports in the browser for instant preview; this endpoint exists
 * for CI, CLI and deploy integrations that need the same output without a
 * browser in the loop. Both call the identical exporter through the registry.
 */

interface ExportRequestBody {
  document: DesignDocument;
  target: string;
  options?: Record<string, unknown>;
}

export async function GET() {
  const registry = await getRegistry();
  return NextResponse.json({
    targets: registry.getExporters().map((exporter) => ({
      id: exporter.id,
      label: exporter.label,
      description: exporter.description,
    })),
  });
}

export async function POST(request: Request) {
  let body: ExportRequestBody;
  try {
    body = (await request.json()) as ExportRequestBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const integrity = validateDocumentIntegrity(body.document);
  if (!integrity.ok) {
    return NextResponse.json(
      { error: 'document failed validation', details: integrity.errors.slice(0, 10) },
      { status: 422 },
    );
  }

  const registry = await getRegistry();

  try {
    const result = await exportProject(registry, body.document, body.target, body.options);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
