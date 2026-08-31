import { JSDOM } from 'jsdom';
const dom = new JSDOM();
(globalThis as any).DOMParser = dom.window.DOMParser;
const { exportHtml } = await import('../src/deck/exportHtml');
const { importHtml } = await import('../src/deck/importHtml');
const { sampleDeck } = await import('../src/deck/sampleDeck');
const back = importHtml(exportHtml(sampleDeck), 'rt.html');
console.log('warnings:', back.warnings);
sampleDeck.slides.forEach((s,i)=>{
  const b = back.deck.slides[i];
  const src = (s.props.title ?? s.props.eyebrow ?? '').slice(0,44);
  const got = (b.props.title ?? b.props.eyebrow ?? '').slice(0,44);
  console.log(`${s.id} ${s.type.padEnd(9)} -> ${b.type.padEnd(8)} | "${src}" -> "${got}"  ${src===got?'':'  <-- HEADING CHANGED'}`);
});
const twice = importHtml(exportHtml(back.deck), 'rt2.html');
const a = JSON.stringify(back.deck.slides.map(s=>[s.type,s.props]));
const b = JSON.stringify(twice.deck.slides.map(s=>[s.type,s.props]));
console.log('\nsecond pass stable:', a===b, '| slides', back.deck.slides.length, twice.deck.slides.length, '| warn', twice.warnings);
if (a!==b) back.deck.slides.forEach((s,i)=>{ const t=twice.deck.slides[i]; if(JSON.stringify(s.props)!==JSON.stringify(t?.props)) console.log(' DIFF',s.id,s.type,'->',t?.type,'\n   A',JSON.stringify(s.props).slice(0,200),'\n   B',JSON.stringify(t?.props).slice(0,200)); });
