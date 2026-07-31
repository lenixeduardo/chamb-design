/**
 * Mobile screenshot pass over every screen of the web app.
 *
 * Run the app first (`pnpm --filter @opendesign/web build && pnpm --filter
 * @opendesign/web start`), then:
 *
 *   node scripts/capture-mobile-screenshots.mjs
 *
 * Writes PNGs to docs/screenshots/mobile plus an overflow audit listing every
 * element whose box escapes the viewport — the thing a screenshot alone will
 * not tell you, because `overflow: hidden` hides the evidence.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.OUT ?? path.join(root, 'docs/screenshots/mobile');
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORT = { width: 390, height: 844 };

const shot = async (page, name, { full = false } = {}) => {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  console.log('✓', name);
};

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'pt-BR',
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const page = await context.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

// ── 1. Workspace, empty ────────────────────────────────────────────────────
await page.goto(BASE, { waitUntil: 'networkidle' });
await shot(page, '01-workspace-vazio', { full: true });

// ── Seed projects ──────────────────────────────────────────────────────────
// Create one through the UI so the document is genuine, then clone it under
// different names/folders to get a populated list.
await page.getByRole('button', { name: 'Novo projeto' }).first().click();
await page.waitForURL(/\/editor\//);
await page.waitForTimeout(1500);
await shot(page, '05-editor-camadas');

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  const INDEX = 'opendesign:projects';
  const PREFIX = 'opendesign:document:';
  const index = JSON.parse(localStorage.getItem(INDEX) ?? '[]');
  const seed = index[0];
  const doc = JSON.parse(localStorage.getItem(PREFIX + seed.id));
  const extras = [
    { name: 'Landing — Charm', folder: 'Marketing', hours: 3 },
    { name: 'App de finanças', folder: 'Produto', hours: 26 },
    { name: 'Design system interno', folder: 'Produto', hours: 74 },
  ];
  const next = [...index];
  next[0] = { ...seed, name: 'Rascunho da home' };
  localStorage.setItem(PREFIX + seed.id, JSON.stringify({ ...doc, name: 'Rascunho da home' }));
  for (const extra of extras) {
    const id = 'doc_' + Math.random().toString(36).slice(2, 12);
    localStorage.setItem(PREFIX + id, JSON.stringify({ ...doc, id, name: extra.name }));
    next.push({
      ...seed,
      id,
      name: extra.name,
      folder: extra.folder,
      updatedAt: new Date(Date.now() - extra.hours * 3600e3).toISOString(),
    });
  }
  localStorage.setItem(INDEX, JSON.stringify(next));
});
await page.reload({ waitUntil: 'networkidle' });

// ── 2. Workspace with projects ─────────────────────────────────────────────
await shot(page, '02-workspace-projetos', { full: true });

// ── 3. Search with no results ──────────────────────────────────────────────
await page.getByPlaceholder('Buscar projetos…').fill('zzz');
await shot(page, '03-workspace-busca-vazia', { full: true });
await page.getByPlaceholder('Buscar projetos…').fill('');

// ── 4. Settings dialog ─────────────────────────────────────────────────────
await page.getByRole('button', { name: 'Ajustes' }).first().click();
await page.waitForTimeout(500);
await shot(page, '04-ajustes');
const dialog = page.getByRole('dialog', { name: 'Ajustes' });
await dialog.evaluate((el) => {
  const scroller = el.querySelector('[class*="overflow-y-auto"]') ?? el;
  scroller.scrollTop = scroller.scrollHeight;
});
await shot(page, '04b-ajustes-rolado');
await page.getByRole('button', { name: 'Fechar ajustes' }).click();

// ── Editor screens ─────────────────────────────────────────────────────────
const projectId = await page.evaluate(
  () => JSON.parse(localStorage.getItem('opendesign:projects'))[0].id,
);
await page.goto(`${BASE}/editor/${projectId}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

for (const [tab, name] of [
  ['Biblioteca', '06-editor-biblioteca'],
  ['Recursos', '07-editor-recursos'],
  ['Tema', '08-editor-tema'],
]) {
  await page.getByRole('button', { name: tab, exact: false }).first().click();
  await shot(page, name);
}

// Layers tab + a selected node, so the inspector has content.
await page.getByRole('button', { name: 'Camadas', exact: false }).first().click();
await page.waitForTimeout(300);
await page.locator('button, [data-od-id]').filter({ hasText: 'Página' }).first().click({ force: true }).catch(() => {});
await shot(page, '09-editor-selecao');

// Chat closed — how much canvas is actually reachable.
await page.getByRole('button', { name: 'AI' }).first().click();
await shot(page, '10-editor-sem-chat');
await page.getByRole('button', { name: 'AI' }).first().click();

// Export dialog.
await page.getByRole('button', { name: 'Exportar' }).first().click();
await page.waitForTimeout(600);
await shot(page, '11-editor-exportar');
await page.getByRole('button', { name: 'Fechar exportação' }).click();

// Editor with horizontal overflow made visible: full-page shot of the shell.
await page.evaluate(() => {
  document.querySelectorAll('*').forEach((el) => {
    const s = getComputedStyle(el);
    if (s.overflow === 'hidden' || s.overflowX === 'hidden') el.style.overflow = 'visible';
  });
  document.body.style.width = 'max-content';
});
await shot(page, '12-editor-overflow-real', { full: true });

// ── Overflow audit ─────────────────────────────────────────────────────────
const audit = {};
for (const [label, url] of [
  ['workspace', BASE],
  ['editor', `${BASE}/editor/${projectId}`],
]) {
  const p = await context.newPage();
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  audit[label] = await p.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders = [];
    document.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) {
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className?.toString?.() ?? '').slice(0, 90),
          left: Math.round(r.left),
          right: Math.round(r.right),
          text: (el.textContent ?? '').trim().slice(0, 40),
        });
      }
    });
    return {
      viewport: vw,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      offenders: offenders.slice(0, 25),
      offenderCount: offenders.length,
    };
  });
  await p.close();
}
fs.writeFileSync(`${OUT}/../overflow-audit.json`, JSON.stringify(audit, null, 2));
console.log(JSON.stringify(audit, null, 2).slice(0, 4000));

await browser.close();
