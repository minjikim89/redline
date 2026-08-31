import { JSDOM } from 'jsdom';
const dom = new JSDOM();
(globalThis as any).DOMParser = dom.window.DOMParser;
const { importHtml } = await import('../src/deck/importHtml');

const t = (label: string, html: string) => {
  const t0 = Date.now();
  const r = importHtml(html, 'big.html');
  console.log(`${label}: ${(html.length/1024/1024).toFixed(1)}MB parse+import ${Date.now()-t0}ms  sections=${r.sections} slides=${r.deck.slides.length} warn=${r.warnings.length}`);
  console.log('   warnings:', r.warnings.slice(0,2).join(' | ') || 'none');
};

// 500 sections
const s500 = Array.from({length:500},(_,i)=>`<section><h2>Section ${i}</h2><p>Body copy number ${i} that is long enough to count as a paragraph here.</p></section>`).join('');
t('500 sections', `<!doctype html><html><head><title>Big</title></head><body>${s500}</body></html>`);

// 20MB: one section with a huge number of leaf blocks
const many = Array.from({length:40000},(_,i)=>`<p>Paragraph ${i} with a reasonable amount of filler text to push the byte count up nicely.</p>`).join('');
t('20MB / 40k leaf blocks in one section', `<!doctype html><html><head><title>Huge</title></head><body><section>${many}</section></body></html>`);
