import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
const dom = new JSDOM();
(globalThis as any).DOMParser = dom.window.DOMParser;
const { importHtml } = await import('../src/deck/importHtml');
for (const f of process.argv.slice(2)) {
  const r = importHtml(readFileSync(f,'utf8'), f.split('/').pop()!);
  console.log(`\n===== ${f.split('/').pop()}  title="${r.deck.title}" sections=${r.sections} warn=[${r.warnings.join(' | ')}]`);
  for (const s of r.deck.slides) console.log(`  ${s.id} ${s.type}/${s.tone??'-'} ${JSON.stringify(s.props)}`);
}
