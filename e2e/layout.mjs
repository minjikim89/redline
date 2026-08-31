/**
 * Layout regressions that only show up in a real browser.
 *
 * The one that matters: a note parked in the left margin was landing underneath
 * the slide rail, so pressing it hit the rail instead. Nothing threw, nothing
 * looked broken in a screenshot, and dragging a note simply did nothing.
 *
 *   node e2e/layout.mjs        (dev server on 5180, Chrome on 9444)
 */
import { connect } from './driver.mjs';
setTimeout(() => { console.log('  WATCHDOG'); process.exit(1); }, 60_000).unref?.();
const d = await connect(9444);
const log = (n, ok, x='') => console.log(`  ${ok?'PASS':'FAIL'}  ${n}${x?'  — '+x:''}`);
const rect = s => d.$(`JSON.stringify(document.querySelector(${JSON.stringify(s)}).getBoundingClientRect())`).then(JSON.parse);

const BASE = process.env.BASE ?? 'http://localhost:5180';
await d.go(`${BASE}/?slide=6`, 2600);

const rail = await rect('.rail');
const note = await rect('.scribble');
log('a left-margin note clears the rail', note.left >= rail.right - 1,
    `rail ends ${Math.round(rail.right)}, note starts ${Math.round(note.left)}`);
log('a press at the note hits the note', await d.$(`(()=>{
  const e=document.querySelector('.scribble').getBoundingClientRect();
  return !!document.elementFromPoint(e.left+20,e.top+12)?.closest('.scribble');})()`) === true);

await d.clickText('move');

// a point that lies ON the stroke: left edge of its box, at mid height
const s0 = await rect('.mark .stroke');
const gx = Math.round(s0.left + 3), gy = Math.round(s0.top + s0.height / 2);
const hit = await d.$(`(()=>{const t=document.elementFromPoint(${gx},${gy});
  return t?.getAttribute?.('class') ?? t?.className?.baseVal ?? t?.tagName;})()`);
log('the stroke is grabbable where it is drawn', hit === 'hit', `hit=${hit}`);

await d.drag(gx, gy, gx + 90, gy + 40);
const s1 = await rect('.mark .stroke');
log('move mode drags the mark itself', Math.abs(s1.left - s0.left) > 30,
    `${Math.round(s0.left)} -> ${Math.round(s1.left)}`);

await d.clickText('undo'); await d.sleep(400);
const s2 = await rect('.mark .stroke');
log('the mark drag is undoable', Math.abs(s2.left - s0.left) < 8, `back to ${Math.round(s2.left)}`);

// and back in edit mode, the same spot must draw rather than grab
await d.clickText('edit');
const cur = await d.$(`getComputedStyle(document.querySelector('.ink')).pointerEvents`);
log('edit mode takes the surface back', cur === 'auto', `pointer-events=${cur}`);

d.close(); process.exit(0);
