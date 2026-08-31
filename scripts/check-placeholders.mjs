/** Fails if unsourced placeholder figures would ship. Run before publishing. */
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/deck/sampleDeck.ts', import.meta.url), 'utf8');
const hits = [...src.matchAll(/\[pending\]/g)];
if (hits.length) {
  console.error(`\n✗ ${hits.length} unsourced figure(s) still marked [pending].`);
  console.error('  Replace with researched values + real sources before publishing.\n');
  process.exit(1);
}
console.log('✓ no placeholder sources remain');
