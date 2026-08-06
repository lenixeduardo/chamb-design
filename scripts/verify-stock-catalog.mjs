/**
 * Checks the stock catalog against the live CDN.
 *
 *   node scripts/verify-stock-catalog.mjs
 *
 * The catalog in `packages/assets/src/stock.ts` is a list of permanent paths on
 * `images.unsplash.com`, written by hand. Nothing in the build can tell whether
 * a path is real — a typo produces a page with a hole in it, and a unit test
 * that hit the network to find out would be a unit test that fails on a plane.
 * So the check lives here, out of the test run, and is worth running whenever
 * the catalog changes.
 *
 * Requires network access to the CDN. Node's built-in fetch ignores HTTPS_PROXY
 * unless you ask it to, so behind a proxy run:
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/verify-stock-catalog.mjs
 *
 * Exits non-zero if any photo is unreachable.
 */
import { STOCK_PHOTOS, stockPhotoUrl } from '@opendesign/assets';

const CONCURRENCY = 6;

async function check(photo) {
  const url = stockPhotoUrl(photo, { width: 64, quality: 40 });
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'follow' });
    return {
      photo,
      ok: response.ok,
      status: response.status,
      type: response.headers.get('content-type') ?? '',
    };
  } catch (error) {
    return { photo, ok: false, status: 0, error: String(error.message ?? error) };
  }
}

async function main() {
  const queue = [...STOCK_PHOTOS];
  const results = [];

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let photo = queue.shift(); photo; photo = queue.shift()) {
        results.push(await check(photo));
      }
    }),
  );

  results.sort((a, b) => a.photo.id.localeCompare(b.photo.id));

  const broken = results.filter((result) => !result.ok);
  const notImages = results.filter((result) => result.ok && !result.type.startsWith('image/'));
  const uncredited = STOCK_PHOTOS.filter((photo) => !photo.credit.author);

  for (const result of broken) {
    console.error(`✗ ${result.photo.id}  ${result.status || result.error}`);
  }
  for (const result of notImages) {
    console.error(`✗ ${result.photo.id}  respondeu ${result.type}`);
  }

  console.log(
    `${results.length - broken.length - notImages.length}/${results.length} fotos acessíveis`,
  );
  if (uncredited.length > 0) {
    console.log(`${uncredited.length} sem autor no crédito (a licença não exige, mas ajuda)`);
  }

  if (broken.length > 0 || notImages.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
