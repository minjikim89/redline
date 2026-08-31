/** Writes the sample deck out as HTML, and reports how each fixture imports. */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { exportHtml } from '../src/deck/exportHtml';
import { importHtml } from '../src/deck/importHtml';
import { sampleDeck } from '../src/deck/sampleDeck';

const dom = new JSDOM();
(globalThis as any).DOMParser = dom.window.DOMParser;

const out = process.argv[2] ?? './fixtures';
if (!existsSync(out)) mkdirSync(out, { recursive: true });

const html = exportHtml(sampleDeck);
writeFileSync(`${out}/From Screen to Cart.html`, html);
console.log(`wrote  ${out}/From Screen to Cart.html  (${(html.length / 1024).toFixed(1)} KB)`);

for (const f of process.argv.slice(3)) {
  if (!existsSync(f)) { console.log(`missing ${f}`); continue; }
  const r = importHtml(readFileSync(f, 'utf8'), f.split('/').pop()!);
  console.log(`\n${f.split('/').pop()}`);
  console.log(`  title    ${r.deck.title}`);
  console.log(`  sections ${r.sections} -> ${r.deck.slides.length} slides`);
  console.log(`  types    ${Object.entries(r.recognised).map(([k, v]) => `${k}×${v}`).join(' ')}`);
  console.log(`  warnings ${r.warnings.length ? r.warnings.join(' | ') : 'none'}`);
  console.log(`  headings ${r.deck.slides.slice(0, 6).map(s => (s.props.title ?? s.props.eyebrow ?? '?')).map((h: string) => `"${String(h).slice(0, 34)}"`).join(', ')}`);
}
