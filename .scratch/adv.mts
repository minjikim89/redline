import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
const dom = new JSDOM();
(globalThis as any).DOMParser = dom.window.DOMParser;
const { importHtml } = await import('../src/deck/importHtml');

const show = (label: string, html: string, name = 'x.html') => {
  const t0 = Date.now();
  let r: any;
  try { r = importHtml(html, name); } catch (e: any) { console.log(`\n### ${label}\n  THREW ${e.message}`); return; }
  const ms = Date.now() - t0;
  console.log(`\n### ${label}  (${ms}ms, ${(html.length/1024).toFixed(0)}KB)`);
  console.log(`  title="${r.deck.title}" sections=${r.sections} slides=${r.deck.slides.length}`);
  console.log(`  types  ${Object.entries(r.recognised).map(([k,v])=>`${k}x${v}`).join(' ')}`);
  console.log(`  warn   ${r.warnings.length ? r.warnings.join(' | ').slice(0,300) : 'none'}`);
  for (const s of r.deck.slides.slice(0, 4)) {
    console.log(`  [${s.id}] ${s.type}/${s.tone ?? '-'} ${JSON.stringify(s.props).slice(0, 420)}`);
  }
};

const page = (...s: string[]) => `<!doctype html><html><head><title>T</title></head><body>${s.map(x=>`<section>${x}</section>`).join('')}</body></html>`;

// 1. table layout
show('TABLE layout', page('<h1>Cover</h1>',
  '<h2>Rules by market</h2><table><tr><th>Market</th><th>Cap</th><th>Investor test</th></tr>'
  + '<tr><td>United States</td><td>$5M</td><td>Income-based</td></tr>'
  + '<tr><td>United Kingdom</td><td>None</td><td>Self-certified</td></tr></table>'));

// 2. only-image section
show('IMAGE only', page('<h1>Cover</h1>', '<img src="chart.png" alt="Revenue by region, 2020 to 2026">'));

// 3. CJK
show('CJK', page('<h1>한국 콘텐츠 리포트</h1><p>이 보고서는 수출 구조를 다룹니다.</p>',
  '<h2>AI 도입 전략</h2><p>국내 기업의 인공지능 도입은 2024년을 기점으로 빠르게 확산되었습니다.</p><div>출처: 정보통신산업진흥원</div>'));

// 4. RTL
show('RTL', page('<h1>تقرير السوق</h1>', '<h2>نمو السوق</h2><p>ينمو سوق التمويل الجماعي بسرعة كبيرة في السنوات الأخيرة حسب التقرير.</p>'));

// 5. short bullets only
show('SHORT BULLETS', page('<h1>Cover</h1>',
  '<h2>What moved</h2><ul><li>Revenue up 12%</li><li>Churn down 3pt</li><li>NPS flat</li><li>Costs up 8%</li></ul>'));

// 6. bare number section
show('BARE NUMBER (first)', page('<div>42</div>'));
show('BARE NUMBER (later)', page('<h1>Cover</h1>', '<div>42</div>'));

// 7. year as figure
show('YEAR looks like figure', page('<h1>Cover</h1>',
  '<h2>National divergence</h2><p>The four rulebooks diverged after the JOBS Act took effect.</p><div>2024</div>'));

// 8. nested sections (reveal.js)
show('NESTED sections', '<html><head><title>R</title></head><body><div class="slides">'
  + '<section><section><h2>Vertical A</h2><p>Body copy that is long enough to be a paragraph.</p></section>'
  + '<section><h2>Vertical B</h2><p>Another paragraph of body copy that runs on a while.</p></section></section>'
  + '</div></body></html>');

// 9. style/script leaking into text
show('STYLE + SCRIPT leak', page('<h1>Cover</h1>',
  '<div><style>.card{color:red;background:#fff;padding:12px}</style>The real body copy of this slide.</div>'
  + '<script>var secret = "do not show me"; alert(1)</script>'));
show('SECTION is only script', page('<h1>Cover</h1>', '<script>var x = 1; function boom(){ return "leak me into the deck" }</script>'));

// 10. onerror / event attributes
show('onerror attrs', page('<h1 onclick="alert(1)">Cover</h1>', '<img src=x onerror="globalThis.__pwn=1"><h2>Body heading here</h2><p>Some paragraph copy long enough to read.</p>'));
console.log('  __pwn =', (globalThis as any).__pwn);

// 11. entities + emoji
show('ENTITIES + EMOJI', page('<h1>Cover &amp; Contents</h1>',
  '<h2>Growth &gt; 20% &mdash; 🚀 momentum</h2><p>Q&amp;A follows the &ldquo;deep dive&rdquo; section 🎬 later today.</p>'));

// 12. duplicate headings
show('DUPLICATE headings', page('<h1>Cover</h1>', '<h2>Findings</h2><p>First body paragraph that is long enough.</p>', '<h2>Findings</h2><p>Second body paragraph that is long enough.</p>'));

// 13. malformed
show('MALFORMED', '<html><body><section><h1>Unclosed<p>text <b>bold <section><h2>Second</h2><p>more copy here that is long.</p>');

// 14. not html at all
show('NOT HTML (json)', JSON.stringify({ a: 1, b: [1,2,3], note: 'this is a json file not a deck' }), 'data.json');
show('NOT HTML (binary-ish)', '%PDF-1.7\n%âãÏÓ\n1 0 obj<</Type/Catalog>>', 'x.pdf');

// 15. svg title steals the doc title
show('SVG title', '<html><head></head><body><section><svg><title>Bar chart</title></svg><h1>Real Heading</h1></section></body></html>', 'MyDeck.html');

// 16. deeply nested
let deep = '<h2>Deep heading</h2>';
let inner = '<p>The body copy buried under a great many wrapper divs.</p>';
for (let i = 0; i < 60; i++) inner = `<div>${inner}</div>`;
show('DEEPLY NESTED', page('<h1>Cover</h1>', deep + inner));

// 17. all-uppercase document
show('ALL UPPERCASE', page('<h1>THE COVER</h1>', '<h2>EVERYTHING HERE IS SHOUTING AT YOU ALL OF THE TIME</h2><p>THIS BODY COPY IS ALSO ENTIRELY IN CAPITAL LETTERS FOR SOME REASON.</p>'));
