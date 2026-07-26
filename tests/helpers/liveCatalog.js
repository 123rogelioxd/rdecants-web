/* Loads the sanitized R Supply OS snapshot and maps it through the SAME
   provider code the storefront uses, so every engine/audit test runs against
   the real contract rather than a fixture that agrees with the code by
   construction. See tests/fixtures/README.md. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mapApiProduct } from '../../assets/js/providers/catalog.js';

const here = dirname(fileURLToPath(import.meta.url));

export const SNAPSHOT_PATH = join(here, '..', 'fixtures', 'rsupplyos-catalog.json');

export function loadRawSnapshot() {
  const parsed = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
  return Array.isArray(parsed?.data) ? parsed.data : parsed;
}

export function loadLiveCatalog() {
  return loadRawSnapshot().map(mapApiProduct).filter(Boolean);
}

/** Look up one snapshot product by its R Supply OS id. */
export function findProduct(products, id) {
  return products.find(p => String(p.id) === String(id)) ?? null;
}
