/**
 * A picture of every model template, as a person actually receives it.
 *
 *   node scripts/capture-template-screenshots.mjs            # all of them
 *   node scripts/capture-template-screenshots.mjs landing    # just one
 *
 * `docs/screenshots/templates/*.png` existed before this script did — captured
 * by hand, which is why they drifted from the blueprints. This closes that: the
 * page is built through the same call the app makes (`buildTemplate` with the
 * default `imagery: 'stock'`), exported by the real HTML exporter, and shot in
 * a real browser.
 *
 * The difference from `generate-template-examples.mjs` is the imagery: the
 * committed examples are pinned to the drawn placeholders so they render with
 * no network, and these are the photographed pages the app hands you.
 *
 * Environment:
 *   OUT            where the PNGs go (default docs/screenshots/templates)
 *   CHROMIUM_PATH  browser binary, when Playwright's own is not installed
 *   VIEWPORT       "1440x1000"
 *   STOCK_MIRROR   a directory of `<photo-id>.jpg` files served in place of
 *                  the Unsplash CDN. For machines that cannot reach it —
 *                  an offline laptop, or a sandbox whose egress policy blocks
 *                  the host. Nothing about the page changes; only where the
 *                  bytes come from. Unset, the browser goes to the CDN.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { seededRng, setIdRng, validateDocumentIntegrity } from '@opendesign/core';
import { BUILTIN_COMPONENTS } from '@opendesign/components';
import { chambThemes, chambTokens } from '@opendesign/plugin-chamb-brand';
import { TEMPLATE_BLUEPRINTS, buildTemplate } from '@opendesign/templates';
import { htmlExporter } from '@opendesign/exporters';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.OUT ?? path.join(root, 'docs/screenshots/templates');
const [width, height] = (process.env.VIEWPORT ?? '1440x1000').split('x').map(Number);

const only = process.argv.slice(2);
const slugOf = (blueprint) => blueprint.id.replace(/^tpl:/, '');

/** The page on disk, ready for a browser: index.html plus its stylesheet. */
function writePage(blueprint, dir) {
  // Same seed as the examples script, so a screenshot and an example are of
  // the same document rather than of two different id sequences.
  setIdRng(seededRng(100 + TEMPLATE_BLUEPRINTS.indexOf(blueprint)));

  const { document, skipped } = buildTemplate(blueprint, {
    components: BUILTIN_COMPONENTS,
    tokens: chambTokens(),
    themes: chambThemes(),
    activeThemeId: 'chamb-light',
  });

  if (skipped.length > 0) throw new Error(`${blueprint.id}: blocos ausentes ${skipped.join(', ')}`);
  const integrity = validateDocumentIntegrity(document);
  if (!integrity.ok) throw new Error(`${blueprint.id}: ${integrity.errors.slice(0, 3).join('; ')}`);

  fs.mkdirSync(dir, { recursive: true });
  for (const file of htmlExporter.generate(document)) {
    fs.writeFileSync(path.join(dir, file.path), file.contents);
  }

  const photos = Object.values(document.nodes).filter(
    (node) => node.type === 'image' && String(node.props.src).startsWith('https://'),
  ).length;

  return { file: path.join(dir, 'index.html'), photos };
}

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif' };

/** Serves `<photo-id>.<ext>` from a directory instead of going to the CDN. */
async function mirrorStockPhotos(page, dir) {
  const files = new Map(
    fs.readdirSync(dir).map((name) => [name.replace(/\.[a-z]+$/i, ''), path.join(dir, name)]),
  );

  await page.route('https://images.unsplash.com/**', async (route) => {
    const id = new URL(route.request().url()).pathname.replace(/^\//, '');
    const file = files.get(id);
    if (!file) return route.abort();
    await route.fulfill({
      path: file,
      contentType: MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    });
  });

  return files.size;
}

async function main() {
  const blueprints = TEMPLATE_BLUEPRINTS.filter(
    (blueprint) => only.length === 0 || only.includes(slugOf(blueprint)),
  );
  if (blueprints.length === 0) throw new Error(`nenhum template para: ${only.join(', ')}`);

  fs.mkdirSync(OUT, { recursive: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'opendesign-shots-'));

  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  );
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
  });

  try {
    for (const blueprint of blueprints) {
      const slug = slugOf(blueprint);
      const { file, photos } = writePage(blueprint, path.join(work, slug));

      const page = await context.newPage();
      const mirrored = process.env.STOCK_MIRROR
        ? await mirrorStockPhotos(page, process.env.STOCK_MIRROR)
        : 0;

      await page.goto(`file://${file}`, { waitUntil: 'load' });

      // Blocks emit `loading="lazy"`, so a full-page shot taken now would
      // catch the images below the fold still empty. Walk the page first,
      // then wait for every one of them to actually have pixels.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
        window.scrollTo(0, 0);
      });
      await page
        .waitForFunction(
          () => Array.from(document.images).every((img) => img.complete && img.naturalWidth > 0),
          undefined,
          { timeout: 15_000 },
        )
        .catch(() => {
          const source = process.env.STOCK_MIRROR ? 'do espelho local' : 'do CDN';
          console.warn(`  ! ${slug}: alguma imagem ${source} não carregou`);
        });

      const out = path.join(OUT, `${slug}.png`);
      await page.screenshot({ path: out, fullPage: true });
      await page.close();

      const note = mirrored > 0 ? ` (espelho: ${mirrored} arquivos)` : '';
      console.log(`${slug.padEnd(18)} ${photos} fotos  ${path.relative(root, out)}${note}`);
    }
  } finally {
    await context.close();
    await browser.close();
    fs.rmSync(work, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
