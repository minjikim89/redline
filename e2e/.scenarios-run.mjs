/**
 * Exhaustive browser checks for Redline, driven over CDP.
 *
 *   npx vite --port 5183 --strictPort
 *   "…/Google Chrome" --headless=new --remote-debugging-port=9335 about:blank
 *   node e2e/scenarios.mjs            # everything
 *   node e2e/scenarios.mjs C F        # just those phases
 */
import { connect, suite, assert, eq } from './driver.mjs';

const PORT = 9335;
const BASE = 'http://localhost:5183/';
const only = process.argv.slice(2).map(s => s.toUpperCase());
const want = p => only.length === 0 || only.includes(p);

/* ---------- a second CDP channel: console capture, drags, wheel ---------- */
async function rawCdp(port) {
  const targets = await (await fetch(`http://localhost:${port}/json/list`)).json();
  const tab = targets.find(t => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const waiting = new Map();
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise(res => {
    const n = ++id; waiting.set(n, res); ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__errs = [];
      const fmt = a => a.map(x => { try { return typeof x === 'string' ? x : (x && x.message) || JSON.stringify(x); } catch { return String(x); } }).join(' ').slice(0, 300);
      for (const k of ['error', 'warn']) { const o = console[k].bind(console); console[k] = (...a) => { window.__errs.push(k + ': ' + fmt(a)); o(...a); }; }
      window.addEventListener('error', e => window.__errs.push('pageerror: ' + (e.message || e.error)));
      window.addEventListener('unhandledrejection', e => window.__errs.push('rejection: ' + ((e.reason && e.reason.message) || e.reason)));
    `,
  });
  return { send, close: () => ws.close() };
}

const cdp = await rawCdp(PORT);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** A real press-move-release, so drag handlers see what a hand produces. */
async function drag(x1, y1, x2, y2, steps = 14) {
  const ev = (type, x, y) => cdp.send('Input.dispatchMouseEvent', {
    type, x: Math.round(x), y: Math.round(y), button: 'left',
    buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'mouse',
  });
  await ev('mousePressed', x1, y1);
  for (let i = 1; i <= steps; i++) {
    await ev('mouseMoved', x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps);
    await sleep(12);
  }
  await ev('mouseReleased', x2, y2);
  await sleep(350);
}

/** ⌘ + wheel, the gesture every canvas uses to zoom. */
async function cmdWheel(x, y, deltaY) {
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel', x, y, deltaX: 0, deltaY, modifiers: 4, pointerType: 'mouse',
  });
  await sleep(250);
}
const d = await connect(PORT);
const t = suite();
const allErrs = [];

/** Navigate and expose the live store + tool implementations to the page. */
async function nav(q = '?deck=1', settle = 2200) {
  // Sessions persist across reloads now; the checks assume a seeded start, so
  // every nav ignores the saved session unless a scenario asks for it.
  const fq = q.includes('fresh') || q.includes('keep')
    ? q.replace('&keep', '')
    : q ? `${q}&fresh=1` : '?fresh=1';
  await d.go(BASE + fq, settle);
  await d.$(`(async()=>{window.__s=await import('/src/annotations/store.ts');
              window.__t=await import('/src/webmcp/tools.ts');return 1})()`);
}
const state = () => d.$(`JSON.parse(JSON.stringify(window.__s.getState()))`);
const props = id => d.$(`JSON.parse(JSON.stringify(window.__s.getSlide(${JSON.stringify(id)})?.props ?? null))`);
const readSlide = id => d.$(`window.__t.callable.read_slide({slideId:${JSON.stringify(id)}}).then(r=>JSON.parse(JSON.stringify(r)))`);
const errs = async label => {
  const e = await d.$('window.__errs || []');
  const noisy = (e || []).filter(x => !/Download the React DevTools|WebMCP|modelContext/i.test(x));
  if (noisy.length) allErrs.push({ label, errs: noisy });
  return noisy;
};
const mod = async (key, shift = false) => {
  // ⌘-chorded key, dispatched with the modifier bit set
  const raw = { key, code: `Key${key.toUpperCase()}`, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
    nativeVirtualKeyCode: key.toUpperCase().charCodeAt(0), modifiers: 4 | (shift ? 8 : 0) };
  await d.$(`(()=>{const ev=k=>new KeyboardEvent(k,{key:${JSON.stringify(key)},metaKey:true,shiftKey:${shift},bubbles:true,cancelable:true});
    window.dispatchEvent(ev('keydown'));window.dispatchEvent(ev('keyup'));return 1})()`);
  void raw;
  await d.sleep(220);
};
/** Press a bare key at the window, the way the app listens for it. */
const bare = async key => {
  await d.$(`(()=>{const ev=k=>new KeyboardEvent(k,{key:${JSON.stringify(key)},bubbles:true,cancelable:true});
    window.dispatchEvent(ev('keydown'));window.dispatchEvent(ev('keyup'));return 1})()`);
  await d.sleep(200);
};
const modeOn = () => d.$(`[...document.querySelectorAll('.modes button')].find(b=>b.classList.contains('on'))?.innerText ?? null`);
/** Centre of an annotatable region inside the artboard, in viewport px. */
const elBox = id => d.$(`(()=>{const e=document.querySelector('.slide [data-el-id="'+${JSON.stringify(id)}+'"]');
  if(!e)return null;const r=e.getBoundingClientRect();
  return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),left:Math.round(r.left),top:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)};})()`);
const goSlide = async n => { await d.$(`document.querySelectorAll('.thumbs .thumb')[${n - 1}].click()`); await d.sleep(400); };

/* =========================== A · entry =========================== */
if (want('A')) {
  console.log('\nA · entry');

  await t.check('start screen shows before entering', async () => {
    await nav('');
    assert(await d.count('.start-card'), 'no start card');
    eq(await d.count('.app'), 0, 'app rendered before entry');
    const e = await errs('start'); eq(e.length, 0, `console: ${e}`);
  });

  await t.check('"Open the sample briefing" enters the deck', async () => {
    await d.clickText('Open the sample briefing');
    await d.sleep(500);
    assert(await d.count('.app'), 'did not enter');
    return await d.text('.brand');
  });

  await t.check('drop zone accepts an HTML file', async () => {
    await nav('');
    const html = `<section><h1>Dropped Deck</h1><p>a standfirst</p></section><section><h2>Second</h2><p>body</p></section>`;
    await d.$(`(()=>{const inp=document.querySelector('.st-drop input[type=file]');
      const f=new File([${JSON.stringify(html)}],'dropped.html',{type:'text/html'});
      const dt=new DataTransfer();dt.items.add(f);inp.files=dt.files;
      inp.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`);
    await d.sleep(700);
    const r = await d.text('.st-report');
    assert(r, 'no import report');
    return r.split('\n').slice(0, 2).join(' / ');
  });

  await t.check('drop zone rejects a non-HTML file', async () => {
    await nav('');
    await d.$(`(()=>{const inp=document.querySelector('.st-drop input[type=file]');
      const f=new File(['x,y'],'sheet.csv',{type:'text/csv'});
      const dt=new DataTransfer();dt.items.add(f);inp.files=dt.files;
      inp.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`);
    await d.sleep(500);
    const e = await d.text('.st-err');
    assert(e && /not an HTML file/.test(e), `expected a refusal, got ${JSON.stringify(e)}`);
    eq(await d.count('.st-report'), 0, 'report shown for a rejected file');
    return e;
  });

  await t.check('"no file handy? try one" imports the shipped sample', async () => {
    await nav('');
    await d.clickText('no file handy');
    await d.sleep(1200);
    const r = await d.text('.st-report');
    assert(r, 'no report');
    await d.clickText('Open it →');
    await d.sleep(600);
    assert(await d.count('.app'), 'did not open the imported deck');
    return (await d.text('.brand'))?.replace('\n', ' · ');
  });

  await t.check('?import=<url> runs the same parser', async () => {
    await nav('?import=' + encodeURIComponent(BASE + 'exported-deck-sample.html'), 2600);
    const r = await d.text('.st-report');
    assert(r, 'no report from ?import');
    return r.split('\n')[0];
  });

  await t.check('?import=<unreachable url> reports instead of throwing', async () => {
    await nav('?import=' + encodeURIComponent('http://localhost:1/nope.html'), 3000);
    const e = await d.text('.st-err');
    assert(e, `no error message shown (report=${await d.text('.st-report')})`);
    eq(await d.count('.st-report'), 0, 'a report was shown for a failed fetch');
    return e;
  });

  await t.check('?import= of a non-deck page refuses instead of pretending', async () => {
    await nav('?import=' + encodeURIComponent(BASE + 'no-such-deck.html'), 2600);
    // The SPA fallback serves the app page itself — nothing readable. The
    // report must say so and must NOT offer to open a junk deck.
    const w = await d.text('.st-r-fatal');
    assert(w, 'an unreadable page produced no refusal');
    eq(await d.count('.st-go'), 0, 'still offered to open it');
    return w.slice(0, 60);
  });

  for (const [q, expect] of [['?slide=3', 2], ['?slide=0', 0], ['?slide=99', 11],
    ['?slide=-2', 0], ['?slide=abc', 0], ['?slide=3.5', 2], ['?slide=1e9', 11]]) {
    await t.check(`${q} deep-links sensibly`, async () => {
      await nav(q);
      assert(await d.count('.app'), `${q} did not enter the deck — blank page`);
      const i = await d.$(`[...document.querySelectorAll('.thumbs .thumb')].findIndex(b=>b.classList.contains('on'))`);
      const e = await errs(q);
      eq(e.length, 0, `console: ${e}`);
      eq(i, expect, `${q} landed on the wrong slide`);
      return `slide index ${i}`;
    });
  }

  await t.check('?blank=1 opens with an empty queue', async () => {
    await nav('?blank=1&deck=1');
    const s = await state();
    eq(s.annotations.length, 0, 'blank deck came with notes');
    return await d.text('.queue');
  });
}


/* =========================== B · modes =========================== */
if (want('B')) {
  console.log('\nB · modes and shortcuts');

  await t.check('E / P / V switch mode', async () => {
    await nav('?deck=1');
    eq(await modeOn(), '✎ edit', 'did not open in edit');
    await bare('p'); eq(await modeOn(), '◯ note', 'P did not select note');
    await bare('v'); eq(await modeOn(), '✥ move', 'V did not select move');
    await bare('e'); eq(await modeOn(), '✎ edit', 'E did not select edit');
    await bare('P'); eq(await modeOn(), '◯ note', 'shift-P did not select note');
    return 'E/P/V all bind';
  });

  await t.check('the toolbar buttons switch mode', async () => {
    await d.clickText('✥ move'); eq(await modeOn(), '✥ move', 'move button');
    await d.clickText('◯ note'); eq(await modeOn(), '◯ note', 'note button');
    await d.clickText('✎ edit'); eq(await modeOn(), '✎ edit', 'edit button');
    return 'ok';
  });

  // The claim under test: in edit mode a press on text takes the caret, and a
  // press on open space starts a mark. Both, on several slide shapes.
  for (const [n, elId] of [[1, 'title'], [3, 'card.0.head'], [8, 'panel.0.metric.0.value'],
    [9, 'event.2018.text'], [12, 'left.ref.0.text']]) {
    await t.check(`slide ${n}: pressing text puts the caret in it`, async () => {
      await nav('?blank=1&deck=1');
      await goSlide(n);
      const b = await elBox(elId);
      assert(b, `no ${elId} on slide ${n}`);
      await d.clickAt(b.x, b.y);
      const focus = await d.$(`document.activeElement?.dataset?.elId ?? document.activeElement?.tagName`);
      const caret = await d.$(`(()=>{const s=getSelection();return s&&s.rangeCount?s.anchorNode?.textContent?.slice(0,24):null})()`);
      eq(focus, elId, 'focus did not land on the text');
      assert(caret, 'no caret placed');
      return `caret in “${caret}”`;
    });
  }

  for (const n of [1, 6, 9]) {
    await t.check(`slide ${n}: pressing open space starts a mark`, async () => {
      await nav('?blank=1&deck=1');
      await goSlide(n);
      const c = await d.box('.canvas');
      // just inside the artboard's bottom-left gutter, away from any text
      await d.circle(c.left + 60, c.top + c.h - 40, 34, 20, 18);
      const drafted = await d.count('.scribble-edit');
      eq(drafted, 1, 'no draft note appeared from a drag on empty space');
      await d.esc();
      return 'draft opened';
    });
  }

  await t.check('in move mode a press on text does NOT take the caret', async () => {
    await nav('?blank=1&deck=1');
    await bare('v');
    const b = await elBox('title');
    await d.clickAt(b.x, b.y);
    const ce = await d.$(`document.activeElement?.isContentEditable === true`);
    eq(ce, false, 'move mode still focused the text');
    eq(await d.count('.slide [contenteditable]'), 0, 'text is still contenteditable outside edit mode');
    return 'ok';
  });

  await t.check('in note mode a press on text starts a mark, not a caret', async () => {
    await nav('?blank=1&deck=1');
    await bare('p');
    const b = await elBox('title');
    await d.circle(b.x, b.y, 60, 22, 18);
    eq(await d.count('.scribble-edit'), 1, 'no draft from circling text in note mode');
    const hit = await d.text('.se-hit');
    await d.esc();
    return hit;
  });
}

/* =========================== C · editing =========================== */
if (want('C')) {
  console.log('\nC · direct text editing');

  /** Click the region, select all of it, type `text`, commit with Enter. */
  async function retype(elId, text) {
    const b = await elBox(elId);
    assert(b, `no region ${elId}`);
    await d.clickAt(b.x, b.y);
    await d.$(`document.execCommand('selectAll')`);
    if (text) await d.type(text);
    else await d.$(`document.execCommand('delete')`);
    await d.enter();
    await d.sleep(250);
  }

  await t.check('retyping a headline lands in the model and in read_slide', async () => {
    await nav('?blank=1&deck=1');
    await goSlide(3);
    await retype('title', 'Rewritten by hand');
    const p = await props('s03');
    eq(p.title, 'Rewritten by hand', 'model not updated');
    const r = await readSlide('s03');
    eq(r.ok, true, `read_slide failed: ${JSON.stringify(r)}`);
    eq(r.props.title, 'Rewritten by hand', 'read_slide is stale');
    return 'model and tool agree';
  });

  await t.check('⌘Z undoes a text edit, ⇧⌘Z redoes it', async () => {
    const before = (await props('s03')).title;
    await mod('z');
    const after = (await props('s03')).title;
    assert(after !== before, `undo did nothing (still ${JSON.stringify(after)})`);
    await mod('z', true);
    eq((await props('s03')).title, before, 'redo did not restore');
    return `${JSON.stringify(after)} → ${JSON.stringify(before)}`;
  });

  await t.check('an empty string is accepted, not dropped', async () => {
    await nav('?blank=1&deck=1');
    await goSlide(3);
    await retype('title', '');
    eq((await props('s03')).title, '', 'empty edit did not reach the model');
    await mod('z');
    assert((await props('s03')).title, 'undo did not bring the headline back');
    return 'empty then undone';
  });

  await t.check('a very long string does not break layout or the model', async () => {
    await nav('?blank=1&deck=1');
    await goSlide(3);
    const long = 'x'.repeat(1200);
    await retype('title', long);
    eq((await props('s03')).title.length, 1200, 'long string truncated or lost');
    const over = await d.$(`(()=>{const f=document.querySelector('.fit'),c=document.querySelector('.canvas');
      return c.getBoundingClientRect().width - f.getBoundingClientRect().width})()`);
    assert(over <= 1, `canvas overflows .fit by ${over}px after a long edit`);
    const e = await errs('long string'); eq(e.length, 0, `console: ${e}`);
    return `${1200} chars, overflow ${over}px`;
  });

  await t.check('markup typed as text stays text (no injection)', async () => {
    await nav('?blank=1&deck=1');
    await goSlide(3);
    await retype('title', '<script>window.__pwned=1</script><b>bold?</b>');
    eq(await d.$(`window.__pwned ?? null`), null, 'a typed <script> executed');
    eq(await d.count('.slide script'), 0, 'a <script> element was created in the slide');
    eq(await d.count('.slide b'), 0, 'typed markup became real elements');
    const p = (await props('s03')).title;
    assert(p.includes('<script>'), `model lost the literal text: ${JSON.stringify(p)}`);
    return 'stored verbatim, rendered as text';
  });

  await t.check('a numeric bar value takes a number', async () => {
    await nav('?blank=1&deck=1');
    await goSlide(4);
    await retype('left.bar.0.value', '42');
    const v = (await props('s04')).left.rows[0].value;
    eq(v, 42, 'numeric edit did not land');
    eq(typeof v, 'number', 'numeric field is no longer a number');
    return 'value = 42';
  });

  for (const junk of ['abc', '', '1.2.3', '--', '9e99']) {
    await t.check(`a bar value of ${JSON.stringify(junk)} must not corrupt the model`, async () => {
      await nav('?blank=1&deck=1');
      await goSlide(4);
      const was = (await props('s04')).left.rows[0].value;
      await retype('left.bar.0.value', junk);
      const now = (await props('s04')).left.rows[0].value;
      eq(typeof now, 'number', `value became ${JSON.stringify(now)}`);
      assert(Number.isFinite(now), `value became ${now}`);
      const shown = await d.$(`document.querySelector('.slide [data-el-id="left.bar.0.value"]')?.innerText`);
      assert(!/object Object|NaN|undefined/.test(shown ?? ''), `the slide now reads ${JSON.stringify(shown)}`);
      const e = await errs(`bar junk ${junk}`); eq(e.length, 0, `console: ${e}`);
      return `${was} → ${now}, shown ${JSON.stringify(shown)}`;
    });
  }

  await t.check('undo/redo round-trips a numeric edit', async () => {
    await nav('?blank=1&deck=1');
    await goSlide(4);
    const was = (await props('s04')).left.rows[0].value;
    await retype('left.bar.0.value', '7');
    eq((await props('s04')).left.rows[0].value, 7, 'edit did not land');
    await mod('z');
    eq((await props('s04')).left.rows[0].value, was, 'undo did not restore the number');
    await mod('z', true);
    eq((await props('s04')).left.rows[0].value, 7, 'redo did not reapply');
    return `${was} ↔ 7`;
  });

  await t.check('blur (not Enter) also commits', async () => {
    await nav('?blank=1&deck=1');
    await goSlide(2);
    const b = await elBox('body');
    await d.clickAt(b.x, b.y);
    await d.$(`document.execCommand('selectAll')`);
    await d.type('committed on blur');
    await d.$(`document.activeElement.blur()`);
    await d.sleep(300);
    eq((await props('s02')).body, 'committed on blur', 'blur did not commit');
    return 'ok';
  });
}


/* =========================== D · notes =========================== */
if (want('D')) {
  console.log('\nD · marking up');

  const draw = async (elId, rx = 70, ry = 40) => {
    const b = await elBox(elId);
    assert(b, `no region ${elId}`);
    await d.circle(b.x, b.y, Math.min(rx, b.w / 2 + 20), Math.min(ry, b.h / 2 + 20), 22);
  };

  await t.check('a drag over an element opens a draft anchored to it', async () => {
    await nav('?blank=1&deck=1');
    await bare('p');
    await goSlide(3);
    await draw('card.0.head');
    eq(await d.count('.scribble-edit'), 1, 'no draft');
    const hit = await d.text('.se-hit');
    assert(hit && !/nothing under/.test(hit), `mark resolved to nothing: ${hit}`);
    return hit;
  });

  for (const kind of ['Fix', 'Research', 'Visualize', 'Explain']) {
    await t.check(`kind “${kind}” pins with that kind`, async () => {
      await nav('?blank=1&deck=1');
      await bare('p');
      await goSlide(3);
      await draw('card.0.head');
      await d.clickText(kind, '.se-k');
      await d.$(`(()=>{const ta=document.querySelector('.scribble-edit textarea');ta.focus();return 1})()`);
      await d.type(`a ${kind} note`);
      await d.enter();
      await d.sleep(300);
      const a = (await state()).annotations;
      eq(a.length, 1, 'note not pinned');
      eq(a[0].kind, kind.toLowerCase(), 'wrong kind stored');
      eq(a[0].body, `a ${kind} note`, 'wrong body stored');
      assert(a[0].targets.length > 0, 'note pinned with no anchor');
      eq(await d.count('.scribble-edit'), 0, 'the draft stayed open after pinning');
      return `${a[0].kind} → ${a[0].targets.map(x => x.elementId).join()}`;
    });
  }

  await t.check('Escape cancels a draft without pinning', async () => {
    await nav('?blank=1&deck=1');
    await bare('p');
    await draw('title');
    eq(await d.count('.scribble-edit'), 1, 'no draft to cancel');
    await d.esc();
    eq(await d.count('.scribble-edit'), 0, 'escape left the draft open');
    eq((await state()).annotations.length, 0, 'escape pinned a note anyway');
    return 'cancelled';
  });

  await t.check('“redraw” drops the draft', async () => {
    await nav('?blank=1&deck=1');
    await bare('p');
    await draw('title');
    await d.clickText('redraw', '.se-redo');
    eq(await d.count('.scribble-edit'), 0, 'redraw left the draft up');
    eq(await d.count('.ink .stroke'), 0, 'redraw left the ink behind');
    return 'ok';
  });

  await t.check('an empty note cannot be pinned', async () => {
    await nav('?blank=1&deck=1');
    await bare('p');
    await draw('title');
    await d.$(`(()=>{document.querySelector('.scribble-edit textarea').focus();return 1})()`);
    await d.enter();
    await d.sleep(250);
    eq((await state()).annotations.length, 0, 'an empty note was pinned');
    eq(await d.count('.scribble-edit'), 1, 'the draft closed on an empty body');
    await d.esc();
    return 'refused';
  });

  await t.check('a tap is not a mark', async () => {
    await nav('?blank=1&deck=1');
    await bare('p');
    const c = await d.box('.canvas');
    await d.clickAt(c.left + 40, c.top + c.h - 30);
    eq(await d.count('.scribble-edit'), 0, 'a tap opened a note draft');
    eq((await state()).annotations.length, 0, 'a tap pinned a note');
    return 'ignored';
  });

  await t.check('a mark over nothing says so, and still pins', async () => {
    await nav('?blank=1&deck=1');
    await bare('p');
    await goSlide(1);
    const c = await d.box('.canvas');
    await d.circle(c.left + 60, c.top + c.h - 45, 30, 22, 20);
    eq(await d.text('.se-hit'), 'nothing under the mark', 'expected the empty-anchor hint');
    await d.$(`(()=>{document.querySelector('.scribble-edit textarea').focus();return 1})()`);
    await d.type('a note about nothing');
    await d.enter();
    await d.sleep(300);
    const a = (await state()).annotations;
    eq(a.length, 1, 'unanchored note was dropped');
    eq(a[0].targets.length, 0, 'unanchored note invented an anchor');
    return 'pinned with no targets';
  });

  await t.check('select a mark, resolve it, reopen it, delete it', async () => {
    await nav('?deck=1');
    await goSlide(6);
    const sb = await d.box('.scribble');
    assert(sb, 'no seeded note on slide 6');
    await d.clickAt(sb.x, sb.y);
    eq((await state()).selected, 'seed_pie', 'clicking the note did not select it');
    assert(await d.count('.mark-acts'), 'no actions on the selected note');

    await d.clickText('✓ resolve', '.mark-acts button');
    eq((await state()).annotations.find(a => a.id === 'seed_pie').status, 'resolved', 'resolve failed');
    eq(await d.text('.q-n'), '2', 'the queue count did not drop');

    const sb2 = await d.box('.scribble');
    await d.clickAt(sb2.x, sb2.y);
    await d.clickText('↺ reopen', '.mark-acts button');
    eq((await state()).annotations.find(a => a.id === 'seed_pie').status, 'open', 'reopen failed');

    if ((await state()).selected !== 'seed_pie') {
      const sb3 = await d.box('.scribble');
      await d.clickAt(sb3.x, sb3.y);
    }
    assert(await d.clickText('✕ delete', '.mark-acts button'), 'no delete button to press');
    eq((await state()).annotations.some(a => a.id === 'seed_pie'), false, 'delete failed');
    eq((await state()).selected, null, 'selection survived the delete');
    return 'resolve → reopen → delete';
  });

  await t.check('undo brings a deleted mark back', async () => {
    await mod('z');
    eq((await state()).annotations.some(a => a.id === 'seed_pie'), true, 'undo did not restore the note');
    return 'restored';
  });

  await t.check('a human reply lands on the thread', async () => {
    await nav('?deck=1');
    await goSlide(6);
    const sb = await d.box('.scribble');
    await d.clickAt(sb.x, sb.y);
    await d.$(`(()=>{document.querySelector('.hr textarea').focus();return 1})()`);
    await d.type('use the card treatment');
    await d.enter();
    await d.sleep(300);
    const a = (await state()).annotations.find(x => x.id === 'seed_pie');
    eq(a.replies.length, 1, 'reply not stored');
    eq(a.replies[0].author, 'human', 'reply attributed to the wrong author');
    assert(await d.count('.scribble-reply.human'), 'reply not rendered on the pin');
    return a.replies[0].body;
  });

  await t.check('“waiting on you” shows only while the agent spoke last', async () => {
    await nav('?deck=1');
    await goSlide(6);
    eq(await d.count('.scribble .wait'), 0, 'badge shown with no replies at all');
    await d.$(`window.__s.replyToAnnotation('seed_pie','switched to cards','agent')`);
    await d.sleep(300);
    eq(await d.count('.scribble .wait'), 1, 'no badge after the agent replied');
    await d.$(`window.__s.replyToAnnotation('seed_pie','thanks','human')`);
    await d.sleep(300);
    eq(await d.count('.scribble .wait'), 0, 'badge still up after the human answered');
    await d.$(`window.__s.resolveAnnotation('seed_pie')`);
    await d.$(`window.__s.replyToAnnotation('seed_pie','and again','agent')`);
    await d.sleep(300);
    eq(await d.count('.scribble .wait'), 0, 'badge shown on a resolved note');
    return 'badge tracks the last speaker';
  });

  await t.check('“clear” asks first, then empties the queue, and is undoable', async () => {
    await nav('?deck=1');
    eq((await state()).annotations.length, 3, 'seeded queue missing');
    await d.clickText('clear', '.q-x');
    // one press only arms it — deleting a whole queue must not be one slip away
    eq((await state()).annotations.length, 3, 'a single press already deleted the queue');
    await d.clickText('delete', '.q-x');
    eq((await state()).annotations.length, 0, 'clear left notes behind');
    eq(await d.text('.q-n'), '0', 'the counter did not follow');
    await mod('z');
    eq((await state()).annotations.length, 3, 'clear was not undoable');
    return 'armed, cleared, restored';
  });
}

/* =========================== E · move mode =========================== */
if (want('E')) {
  console.log('\nE · repositioning marks');

  await t.check('dragging a mark moves the ink and persists', async () => {
    await nav('?deck=1');
    await goSlide(6);
    await bare('v');
    const before = (await state()).annotations.find(a => a.id === 'seed_pie').stroke[0];
    const p = await d.$(`(()=>{const h=document.querySelector('.mark .hit');
      const b=h.getBoundingClientRect();return {x:Math.round(b.left+b.width/2),y:Math.round(b.top+4)}})()`);
    await drag(p.x, p.y, p.x + 90, p.y + 40);
    const after = (await state()).annotations.find(a => a.id === 'seed_pie').stroke[0];
    assert(Math.abs(after.x - before.x) > 0.01, `stroke did not move in x (${before.x} → ${after.x})`);
    assert(Math.abs(after.y - before.y) > 0.01, `stroke did not move in y (${before.y} → ${after.y})`);
    await mod('z');
    const undone = (await state()).annotations.find(a => a.id === 'seed_pie').stroke[0];
    eq(undone.x, before.x, 'undo did not put the mark back');
    return `moved by ${(after.x - before.x).toFixed(3)}, undone`;
  });

  await t.check('dragging a note label moves it and persists', async () => {
    await nav('?deck=1');
    await goSlide(6);
    await bare('v');
    const before = (await state()).annotations.find(a => a.id === 'seed_pie').labelAt;
    const b = await d.box('.scribble');
    await drag(b.x, b.y, b.x + 70, b.y + 55);
    const after = (await state()).annotations.find(a => a.id === 'seed_pie').labelAt;
    assert(Math.abs(after.x - before.x) > 0.01, `label did not move (${before.x} → ${after.x})`);
    await mod('z');
    eq((await state()).annotations.find(a => a.id === 'seed_pie').labelAt.x, before.x, 'undo failed');
    return `moved to ${after.x.toFixed(3)}, undone`;
  });

  await t.check('a click without a drag does not write history', async () => {
    await nav('?deck=1');
    await goSlide(6);
    await bare('v');
    const b = await d.box('.scribble');
    await d.clickAt(b.x, b.y);
    eq(await d.$(`document.querySelector('.toolbar button[title="Undo ⌘Z"]').disabled`), true,
      'a click in move mode pushed an undo entry');
    return 'no history entry';
  });
}


/* =========================== F · inspector =========================== */
if (want('F')) {
  console.log('\nF · the properties panel');

  const fieldFor = key => d.$(`(()=>{const f=[...document.querySelectorAll('.insp .fld')]
    .find(x=>x.querySelector('.fld-k')?.textContent===${JSON.stringify(key)});
    if(!f)return null;const i=f.querySelector('input,textarea');
    return {tag:i?.tagName??null,type:i?.type??null,seg:f.querySelectorAll('.seg button').length,
            tog:!!f.querySelector('.tog')};})()`);

  await t.check('⚙ props and I both open the panel', async () => {
    await nav('?blank=1&deck=1');
    await d.clickText('⚙ props');
    eq(await d.count('.insp'), 1, 'the button did not open it');
    await bare('i');
    eq(await d.count('.insp'), 0, 'I did not close it');
    await bare('i');
    eq(await d.count('.insp'), 1, 'I did not reopen it');
    return 'both bind';
  });

  await t.check('a text field writes through and re-renders the slide', async () => {
    await nav('?blank=1&deck=1');
    await goSlide(4);
    await bare('i');
    await d.$(`(()=>{const f=[...document.querySelectorAll('.insp .fld')]
      .find(x=>x.querySelector('.fld-k')?.textContent==='title');
      const i=f.querySelector('input,textarea');
      const proto=i.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto,'value').set.call(i,'Inspector title');
      i.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
    await d.sleep(300);
    eq((await props('s04')).title, 'Inspector title', 'model not written');
    eq(await d.$(`document.querySelector('.slide [data-el-id="title"]').innerText`),
      'Inspector title', 'the artboard did not re-render');
    await mod('z');
    assert((await props('s04')).title !== 'Inspector title', 'undo did nothing');
    return 'written, rendered, undone';
  });

  await t.check('a textarea is used for the long fields', async () => {
    await nav('?blank=1&deck=1');
    await goSlide(4);
    await bare('i');
    const f = await fieldFor('source');
    eq(f.tag, 'TEXTAREA', 'the long source field is not a textarea');
    return 'textarea';
  });

  await t.check('a number field keeps the value numeric', async () => {
    await nav('?blank=1&deck=1');
    await goSlide(4);
    await bare('i');
    await d.$(`(()=>{const i=[...document.querySelectorAll('.insp .listf-row .fld')]
      .find(x=>x.querySelector('.fld-k')?.textContent==='value').querySelector('input.num');
      const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
      set.call(i,'12.5');i.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
    await d.sleep(300);
    const v = (await props('s04')).left.rows[0].value;
    eq(v, 12.5, 'number field did not write');
    eq(typeof v, 'number', 'number field wrote a string');
    return 'value 12.5 as a number';
  });

  await t.check('an enum renders as segments and sets the value', async () => {
    await nav('?blank=1&deck=1');
    await goSlide(6);
    await bare('i');
    const f = await fieldFor('chart form');
    assert(f && f.seg === 3, `chartForm did not render as segments: ${JSON.stringify(f)}`);
    await d.$(`(()=>{const f=[...document.querySelectorAll('.insp .fld')]
      .find(x=>x.querySelector('.fld-k')?.textContent==='chart form');
      [...f.querySelectorAll('.seg button')].find(b=>b.textContent==='column').click();return 1})()`);
    await d.sleep(350);
    eq((await props('s06')).chartForm, 'column', 'enum did not write');
    eq(await d.count('.figs.form-column'), 1, 'the slide did not redraw in the new form');
    await mod('z');
    assert((await props('s06')).chartForm !== 'column', 'undo did nothing');
    return 'pie → column → undone';
  });

  await t.check('the surface segments set the slide tone', async () => {
    await nav('?blank=1&deck=1');
    await goSlide(4);
    await bare('i');
    await d.$(`(()=>{const f=[...document.querySelectorAll('.insp .fld')]
      .find(x=>x.querySelector('.fld-k')?.textContent==='surface');
      [...f.querySelectorAll('.seg button')].find(b=>b.textContent==='dark').click();return 1})()`);
    await d.sleep(300);
    eq(await d.$(`document.querySelector('.slide').dataset.tone`), 'dark', 'tone did not apply');
    await mod('z');
    assert(await d.$(`document.querySelector('.slide').dataset.tone`) !== 'dark', 'undo did nothing');
    return 'dark then undone';
  });

  await t.check('a boolean renders as a toggle and flips', async () => {
    await nav('?blank=1&deck=1');
    await goSlide(4);
    await bare('i');
    const f = await d.$(`(()=>{const r=[...document.querySelectorAll('.insp .listf-row .fld')]
      .find(x=>x.querySelector('.fld-k')?.textContent==='strong');return r?{tog:!!r.querySelector('.tog'),
      label:r.querySelector('.tog')?.textContent}:null})()`);
    assert(f && f.tog, `no toggle for the boolean field: ${JSON.stringify(f)}`);
    await d.$(`(()=>{[...document.querySelectorAll('.insp .listf-row .fld')]
      .find(x=>x.querySelector('.fld-k')?.textContent==='strong').querySelector('.tog').click();return 1})()`);
    await d.sleep(300);
    const v = (await props('s04')).left.rows[0].strong;
    eq(typeof v, 'boolean', `toggle wrote ${JSON.stringify(v)}`);
    return `strong = ${v}`;
  });

  await t.check('a colour field is a colour input and writes a hex', async () => {
    await nav('?blank=1&deck=1');
    await goSlide(4);
    await bare('i');
    const f = await d.$(`(()=>{const r=[...document.querySelectorAll('.insp .listf-row .fld')]
      .find(x=>x.querySelector('.fld-k')?.textContent==='color');
      const i=r?.querySelector('input');return i?{type:i.type,cls:i.className}:null})()`);
    assert(f && f.type === 'color', `colour field is ${JSON.stringify(f)}`);
    await d.$(`(()=>{const i=[...document.querySelectorAll('.insp .listf-row .fld')]
      .find(x=>x.querySelector('.fld-k')?.textContent==='color').querySelector('input.col');
      const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
      set.call(i,'#123456');i.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
    await d.sleep(300);
    eq((await props('s04')).left.rows[0].color, '#123456', 'colour did not write');
    return '#123456';
  });

  await t.check('array rows: add, reorder, remove — with the slide following', async () => {
    await nav('?blank=1&deck=1');
    await goSlide(4);
    await bare('i');
    const model = async () => (await props('s04')).left.rows.map(r => r.label);

    const before = await model();
    await d.$(`document.querySelector('.insp .listf-h button').click()`);
    await d.sleep(300);
    eq((await model()).length, before.length + 1, 'add did not append a row');
    eq((await model())[before.length], '', 'the new row is not blank');

    await d.$(`document.querySelectorAll('.insp .listf-row')[1].querySelector('.listf-ops button').click()`);
    await d.sleep(300);
    const swapped = await model();
    eq(swapped[0], before[1], 'up did not reorder');
    eq(swapped[1], before[0], 'up did not reorder');
    eq(await d.$(`document.querySelector('.slide [data-el-id="left.bar.0.label"]').innerText`),
      before[1], 'the artboard did not follow the reorder');

    await d.$(`document.querySelectorAll('.insp .listf-row')[0].querySelector('.rm').click()`);
    await d.sleep(300);
    eq((await model()).length, before.length, 'remove did not drop a row');
    await mod('z');
    eq((await model()).length, before.length + 1, 'undo did not bring the row back');
    return `${before.length} → add → reorder → remove → undo`;
  });

  await t.check('the add button stops at maxItems', async () => {
    await nav('?blank=1&deck=1');
    await goSlide(9);          // timeline: maxItems 8
    await bare('i');
    for (let i = 0; i < 12; i++) {
      const disabled = await d.$(`document.querySelector('.insp .listf-h button').disabled`);
      if (disabled) break;
      await d.$(`document.querySelector('.insp .listf-h button').click()`);
      await d.sleep(120);
    }
    const n = (await props('s09')).events.length;
    eq(n, 8, `the panel let the array past maxItems (now ${n})`);
    eq(await d.$(`document.querySelector('.insp .listf-h button').disabled`), true, 'add is still live at the cap');
    return 'capped at 8';
  });

  await t.check('the remove button stops at minItems', async () => {
    await nav('?blank=1&deck=1');
    await goSlide(9);          // timeline: minItems 2
    await bare('i');
    for (let i = 0; i < 12; i++) {
      const live = await d.$(`(()=>{const b=document.querySelector('.insp .listf-row .rm');
        return b && !b.disabled})()`);
      if (!live) break;
      await d.$(`document.querySelector('.insp .listf-row .rm').click()`);
      await d.sleep(120);
    }
    const n = (await props('s09')).events.length;
    eq(n, 2, `the panel went below minItems (now ${n})`);
    return 'floored at 2';
  });

  await t.check('opening the panel re-fits the artboard without overflow or drift', async () => {
    await nav('?deck=1');
    await goSlide(6);
    await d.sleep(400);
    const where = () => d.$(`(()=>{const p=document.querySelector('.mark .stroke');
      const t=document.querySelector('.slide [data-el-id="chart"]');
      const pb=p.getBoundingClientRect(),tb=t.getBoundingClientRect();
      return {cx:+((pb.left+pb.width/2-tb.left)/tb.width).toFixed(3),
              cy:+((pb.top+pb.height/2-tb.top)/tb.height).toFixed(3)}})()`);
    const over = () => d.$(`(()=>{const f=document.querySelector('.fit'),c=document.querySelector('.canvas');
      return Math.round(c.getBoundingClientRect().width-f.getBoundingClientRect().width)})()`);
    const before = await where(), w0 = (await d.box('.slide')).w, pct0 = await d.text('.z-n');
    await bare('i');
    await d.sleep(700);
    const after = await where(), w1 = (await d.box('.slide')).w, pct1 = await d.text('.z-n');
    assert(await over() <= 1, `the artboard overflows .fit with the panel open (+${await over()}px)`);
    eq(pct1, `${Math.round((w1 / 1920) * 100)}%`, 'the readout disagrees with the rendered scale');
    assert(Math.abs(after.cx - before.cx) < 0.06 && Math.abs(after.cy - before.cy) < 0.06,
      `the mark drifted when the panel opened: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
    await bare('i');
    await d.sleep(700);
    eq((await d.box('.slide')).w, w0, 'closing the panel did not restore the fit');
    eq(await d.text('.z-n'), pct0, 'closing the panel did not restore the readout');
    return `${pct0} → ${pct1} → ${pct0}, mark held`;
  });
}

/* =========================== G · zoom =========================== */
if (want('G')) {
  console.log('\nG · zoom');

  const pct = async () => Number((await d.text('.z-n')).replace('%', ''));
  const overflow = () => d.$(`(()=>{const f=document.querySelector('.fit'),c=document.querySelector('.canvas');
    const fr=f.getBoundingClientRect(),cr=c.getBoundingClientRect();
    return {w:Math.round(cr.width-fr.width),h:Math.round(cr.height-fr.height),
            scrollW:f.scrollWidth-f.clientWidth,scrollH:f.scrollHeight-f.clientHeight}})()`);

  await t.check('− and + step the zoom, the percentage resets it', async () => {
    await nav('?blank=1&deck=1');
    const base = await pct();
    await d.clickText('+', '.zoom button');
    const up = await pct();
    assert(up > base, `+ did not zoom in (${base} → ${up})`);
    await d.clickText('−', '.zoom button');
    eq(await pct(), base, '− did not come back');
    await d.clickText('+', '.zoom button');
    await d.clickText('+', '.zoom button');
    await d.$(`document.querySelector('.z-n').click()`);
    await d.sleep(300);
    eq(await pct(), base, 'the percentage did not reset the zoom');
    return `${base}% ↔ ${up}%`;
  });

  await t.check('+ − 0 keys do the same', async () => {
    await nav('?blank=1&deck=1');
    const base = await pct();
    await bare('+'); const up = await pct();
    assert(up > base, `+ key did nothing (${base} → ${up})`);
    await bare('-'); eq(await pct(), base, '- key did not come back');
    await bare('='); assert(await pct() > base, '= key did not zoom');
    await bare('0'); eq(await pct(), base, '0 key did not reset');
    return `${base}% ↔ ${up}%`;
  });

  await t.check('⌘+wheel zooms', async () => {
    await nav('?blank=1&deck=1');
    const base = await pct();
    const f = await d.box('.fit');
    await cmdWheel(f.x, f.y, -120);
    const up = await pct();
    assert(up > base, `⌘+wheel up did not zoom in (${base} → ${up})`);
    await cmdWheel(f.x, f.y, 120);
    assert(await pct() < up, '⌘+wheel down did not zoom out');
    return `${base}% → ${up}%`;
  });

  await t.check('a plain wheel does not zoom', async () => {
    await nav('?blank=1&deck=1');
    const base = await pct();
    const f = await d.box('.fit');
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: f.x, y: f.y, deltaX: 0, deltaY: -240, pointerType: 'mouse',
    });
    await sleep(300);
    eq(await pct(), base, 'a plain wheel changed the zoom');
    return `${base}% held`;
  });

  await t.check('at the fit zoom the artboard sits exactly inside its container', async () => {
    await nav('?blank=1&deck=1');
    await d.sleep(400);
    const o = await overflow();
    assert(o.w <= 1 && o.h <= 1, `canvas escapes .fit at rest: ${JSON.stringify(o)}`);
    return `w+${o.w} h+${o.h}`;
  });

  await t.check('the canvas box keeps the artboard size at every zoom', async () => {
    await nav('?blank=1&deck=1');
    const bad = [];
    for (let i = 0; i < 24; i++) {
      await bare('+');
      const m = await d.$(`(()=>{const c=document.querySelector('.canvas'),s=document.querySelector('.slide');
        return {declared:Math.round(parseFloat(c.style.width)),box:Math.round(c.getBoundingClientRect().width),
                art:Math.round(s.getBoundingClientRect().width)}})()`);
      if (Math.abs(m.declared - m.box) > 1 || Math.abs(m.box - m.art) > 1) bad.push([await pct(), m]);
    }
    assert(bad.length === 0,
      `the canvas box stopped matching the artboard — notes and ink fall into different spaces: ${JSON.stringify(bad.slice(0, 2))}`);
    return `held to ${await pct()}%`;
  });

  await t.check('the toolbar stays on top and clickable at any zoom', async () => {
    await nav('?blank=1&deck=1');
    const bad = [];
    for (let i = 0; i < 24; i++) {
      await bare('+');
      const hit = await d.$(`(()=>{const b=document.querySelector('.toolbar .replay').getBoundingClientRect();
        const e=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
        return e?.closest('.toolbar')?'toolbar':(e?.className?.baseVal??e?.className??e?.tagName)})()`);
      if (hit !== 'toolbar') bad.push([await pct(), hit]);
    }
    assert(bad.length === 0, `the artboard buried the toolbar: ${JSON.stringify(bad.slice(0, 3))}`);
    // …and the artboard is still clipped to the stage, so it never covers the rail
    const overRail = await d.$(`(()=>{const s=document.querySelector('.slide').getBoundingClientRect();
      const r=document.querySelector('.rail').getBoundingClientRect();
      return Math.round(Math.min(s.right,r.right)-Math.max(s.left,r.left))})()`);
    const railHit = await d.$(`(()=>{const r=document.querySelector('.rail .thumb').getBoundingClientRect();
      return !!document.elementFromPoint(r.left+8,r.top+8)?.closest('.rail')})()`);
    eq(railHit, true, `the artboard covered the rail (geometric overlap ${overRail}px)`);
    return `toolbar and rail live up to ${await pct()}%`;
  });

  await t.check('marks stay on their element through a zoom', async () => {
    await nav('?deck=1');
    await goSlide(6);
    const where = () => d.$(`(()=>{const p=document.querySelector('.mark .stroke');
      const s=document.querySelector('.slide');const t=s.querySelector('[data-el-id="chart"]');
      const pb=p.getBoundingClientRect(),tb=t.getBoundingClientRect();
      const cx=(pb.left+pb.width/2-tb.left)/tb.width, cy=(pb.top+pb.height/2-tb.top)/tb.height;
      return {cx:+cx.toFixed(3),cy:+cy.toFixed(3)}})()`);
    const before = await where();
    for (let i = 0; i < 5; i++) await bare('+');
    await d.sleep(500);
    const after = await where();
    assert(Math.abs(after.cx - before.cx) < 0.06 && Math.abs(after.cy - before.cy) < 0.06,
      `the mark drifted off its element: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
    return `${JSON.stringify(before)} → ${JSON.stringify(after)}`;
  });

  await t.check('marks stay on their element through a window resize', async () => {
    await nav('?deck=1');
    await goSlide(6);
    const where = () => d.$(`(()=>{const p=document.querySelector('.mark .stroke');
      const t=document.querySelector('.slide [data-el-id="chart"]');
      const pb=p.getBoundingClientRect(),tb=t.getBoundingClientRect();
      return {cx:+((pb.left+pb.width/2-tb.left)/tb.width).toFixed(3),
              cy:+((pb.top+pb.height/2-tb.top)/tb.height).toFixed(3)}})()`);
    const before = await where();
    await cdp.send('Emulation.setDeviceMetricsOverride',
      { width: 1180, height: 780, deviceScaleFactor: 0, mobile: false });
    await sleep(900);
    const after = await where();
    const grew = await d.box('.slide');
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    await sleep(700);
    assert(Math.abs(after.cx - before.cx) < 0.06 && Math.abs(after.cy - before.cy) < 0.06,
      `the mark drifted after a resize: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
    return `artboard ${grew.w}px, mark held`;
  });
}

/* =========================== H · replay =========================== */
if (want('H')) {
  console.log('\nH · the scripted pass');

  const replaying = () => d.$(`!!document.querySelector('.replay.on')`);

  await t.check('a pass resets first, runs, and ends clean', async () => {
    await nav('?deck=1');
    await d.$(`window.__s.setByPath('s03','title','edited before the pass')`);
    await d.sleep(200);
    await d.clickText('▶ watch a pass');
    await d.sleep(900);
    eq(await replaying(), true, 'the pass did not start');
    eq((await props('s03')).title !== 'edited before the pass', true, 'the pass did not reset the deck first');
    for (let i = 0; i < 60 && await replaying(); i++) await d.sleep(1000);
    eq(await replaying(), false, 'the pass never finished');
    const s = await state();
    eq(s.annotations.filter(a => a.status === 'open').length, 0, 'notes left open after a full pass');
    assert(s.calls.length > 0, 'no tool calls were traced');
    const e = await errs('replay'); eq(e.length, 0, `console: ${e}`);
    return `${s.calls.length} calls traced, queue empty`;
  });

  await t.check('running it a second time works', async () => {
    await d.clickText('▶ watch a pass');
    await d.sleep(900);
    eq(await replaying(), true, 'the second pass did not start');
    const open = (await state()).annotations.filter(a => a.status === 'open').length;
    assert(open > 0, 'the reset did not put the queue back for a second pass');
    await d.clickText('■ stop');
    await d.sleep(400);
    return `${open} notes back on the queue`;
  });

  await t.check('stopping mid-pass leaves consistent state', async () => {
    await nav('?deck=1');
    await d.clickText('▶ watch a pass');
    await d.sleep(3500);
    await d.clickText('■ stop');
    await d.sleep(600);
    eq(await replaying(), false, 'stop did not stop it');
    eq(await d.$(`document.querySelector('.replay').innerText`), '▶ watch a pass', 'the button did not reset');
    const s = await state();
    assert(s.deck.slides.length === 12, 'the deck lost slides when stopped');
    assert(await d.count('.slide'), 'no slide is rendered after a stop');
    const e = await errs('replay stop'); eq(e.length, 0, `console: ${e}`);
    // and the page still works
    await bare('e');
    await goSlide(3);
    const b = await elBox('title');
    await d.clickAt(b.x, b.y);
    eq(await d.$(`document.activeElement?.dataset?.elId ?? 'none'`), 'title',
      'editing is broken after a stopped pass');
    return `stopped after ${s.calls.length} calls, editing still live`;
  });

  await t.check('?replay=1 starts the pass on load', async () => {
    await nav('?replay=1', 2600);
    eq(await replaying(), true, '?replay=1 did not start a pass');
    await d.clickText('■ stop');
    await d.sleep(400);
    return 'started and stopped';
  });
}

/* =========================== I · export =========================== */
if (want('I')) {
  console.log('\nI · export');

  await t.check('↓ export produces a standalone document of the live deck', async () => {
    await nav('?blank=1&deck=1');
    await goSlide(3);
    await d.$(`window.__s.setByPath('s03','title','Exported headline')`);
    await d.sleep(250);
    const out = await d.$(`(async()=>{const m=await import('/src/deck/exportHtml.ts');
      const html=m.exportHtml(window.__s.getState().deck);
      return {len:html.length,doctype:html.slice(0,15),
              hasTitle:html.includes('Exported headline'),
              sections:(html.match(/<section/g)||[]).length}})()`);
    assert(out.len > 2000, `export is suspiciously small (${out.len} bytes)`);
    assert(/<!doctype html/i.test(out.doctype), `no doctype: ${out.doctype}`);
    eq(out.hasTitle, true, 'the export missed a hand edit');
    eq(out.sections, 12, `expected 12 sections, got ${out.sections}`);
    return `${out.len} bytes, ${out.sections} sections`;
  });

  await t.check('the export button itself fires without throwing', async () => {
    await d.$(`(()=>{window.__dl=null;const orig=HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click=function(){window.__dl={name:this.download,href:this.href};};
      window.__restore=()=>{HTMLAnchorElement.prototype.click=orig};return 1})()`);
    await d.clickText('↓ export');
    const dl = await d.$(`window.__dl`);
    await d.$(`window.__restore()`);
    assert(dl, 'the export button produced no download');
    assert(/\.html$/.test(dl.name), `odd filename: ${dl.name}`);
    const e = await errs('export'); eq(e.length, 0, `console: ${e}`);
    return dl.name;
  });
}

/* =========================== J · regressions =========================== */
if (want('J')) {
  console.log('\nJ · the specific regressions');

  await t.check('a mark stays on its element after the slide re-renders', async () => {
    await nav('?deck=1');
    await goSlide(6);
    const where = () => d.$(`(()=>{const p=document.querySelector('.mark .stroke');
      const t=document.querySelector('.slide [data-el-id="chart"]');
      const pb=p.getBoundingClientRect(),tb=t.getBoundingClientRect();
      return {cx:+((pb.left+pb.width/2-tb.left)/tb.width).toFixed(3),
              cy:+((pb.top+pb.height/2-tb.top)/tb.height).toFixed(3)}})()`);
    const before = await where();
    // the fix the seeded note is asking for: re-form the chart, which reflows it
    await d.$(`window.__t.callable.set_chart_form({slideId:'s06',chartForm:'cards',rationale:'x'})`);
    await d.sleep(700);
    const after = await where();
    assert(Math.abs(after.cx - before.cx) < 0.1 && Math.abs(after.cy - before.cy) < 0.1,
      `the mark drifted off its target after the reflow: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
    return `${JSON.stringify(before)} → ${JSON.stringify(after)}`;
  });

  await t.check('the conflict banner does not overlap the toolbar', async () => {
    await nav('?deck=1');
    await d.$(`window.__t.callable.attach_research({slideId:'s08',source:'DART',asOf:'FY2025',
      contradicts:{elementId:'title',claim:'a claim that is still on the slide',
      why:'the figure just verified undercuts it'}})`);
    await d.sleep(900);
    const idx = await d.$(`window.__s.getState().deck.slides.findIndex(x=>x.id==='s08')`);
    await goSlide(idx + 1);
    await d.sleep(400);
    const boxes = await d.$(`(()=>{const c=document.querySelector('.conflict'),t=document.querySelector('.toolbar');
      if(!c||!t)return null;const a=c.getBoundingClientRect(),b=t.getBoundingClientRect();
      return {cf:[Math.round(a.top),Math.round(a.bottom)],tb:[Math.round(b.top),Math.round(b.bottom)],
              overlap:Math.round(Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top))}})()`);
    assert(boxes, 'no conflict banner was raised');
    assert(boxes.overlap <= 0, `the banner overlaps the toolbar by ${boxes.overlap}px (${JSON.stringify(boxes)})`);
    eq(await d.count('.cf-ring'), 1, 'the flagged claim is not outlined');
    return JSON.stringify(boxes);
  });

  await t.check('the conflict ring sits on the claim it flags', async () => {
    const fit = await d.$(`(()=>{const r=document.querySelector('.cf-ring').getBoundingClientRect();
      const t=document.querySelector('.slide [data-el-id="title"]').getBoundingClientRect();
      return {dx:Math.round(r.left-t.left),dy:Math.round(r.top-t.top),
              dw:Math.round(r.width-t.width),dh:Math.round(r.height-t.height)}})()`);
    assert(Math.abs(fit.dx) < 6 && Math.abs(fit.dy) < 6 && Math.abs(fit.dw) < 8 && Math.abs(fit.dh) < 8,
      `the ring is off its element: ${JSON.stringify(fit)}`);
    return JSON.stringify(fit);
  });

  await t.check('every note label stays reachable on screen', async () => {
    await nav('?deck=1');
    const off = [];
    for (let i = 1; i <= 12; i++) {
      await goSlide(i);
      const bad = await d.$(`[...document.querySelectorAll('.scribble')].map(e=>{
        const r=e.getBoundingClientRect();
        return {l:Math.round(r.left),t:Math.round(r.top),r:Math.round(r.right),b:Math.round(r.bottom)}})
        .filter(r=>r.r<0||r.b<0||r.l>innerWidth||r.t>innerHeight)`);
      if (bad.length) off.push({ slide: i, bad });
    }
    assert(off.length === 0, `notes off screen: ${JSON.stringify(off)}`);
    return 'all 3 notes on screen';
  });

  await t.check('nothing throws walking every slide in every mode', async () => {
    await nav('?deck=1');
    for (const m of ['e', 'p', 'v']) {
      await bare(m);
      for (let i = 1; i <= 12; i++) await goSlide(i);
    }
    await bare('i');
    for (let i = 1; i <= 12; i++) await goSlide(i);
    const e = await errs('walk every slide');
    eq(e.length, 0, `console: ${e.join(' | ')}`);
    return '12 slides × 3 modes + inspector, clean';
  });

  await t.check('the inspector renders for every slide type', async () => {
    await nav('?blank=1&deck=1');
    await bare('i');
    const seen = [];
    for (let i = 1; i <= 12; i++) {
      await goSlide(i);
      const n = await d.count('.insp .fld, .insp .listf');
      seen.push(n);
      assert(n > 0, `slide ${i} produced an empty properties panel`);
    }
    const e = await errs('inspector every slide');
    eq(e.length, 0, `console: ${e.join(' | ')}`);
    return `fields per slide: ${seen.join(',')}`;
  });
}

/* =========================== report =========================== */
async function finish() {
  /* =========== K · the marks are the work order, and nothing evaporates =========== */
if (want('K')) {
  console.log('\nK · scope, structure, persistence');

  await t.check('a point write outside the noted scope is refused with a map', async () => {
    await nav('?deck=1');
    const r = await d.$(`window.__t.callable.set_slide_text({slideId:'s02',field:'body',text:'X'})
      .then(r=>JSON.parse(JSON.stringify(r)))`);
    eq(r.ok, false, 'an unmarked slide accepted a write');
    eq(r.error.code, 'OUT_OF_SCOPE', `wrong code: ${r.error.code}`);
    assert(r.error.notedSlideIds?.includes('s04'), 'the refusal did not name the noted slides');
    return 'refused, with notedSlideIds';
  });

  await t.check('the scope switch on the page widens it', async () => {
    await d.clickText('whole deck', '.sc-seg button');
    const r = await d.$(`window.__t.callable.set_slide_text({slideId:'s02',field:'body',text:'Widened.'})
      .then(r=>JSON.parse(JSON.stringify(r)))`);
    eq(r.ok, true, `still refused: ${JSON.stringify(r)}`);
    await d.clickText('noted only', '.sc-seg button');
    return 'widened, then narrowed back';
  });

  await t.check('list_slides states the scope up front', async () => {
    const r = await d.$(`window.__t.callable.list_slides({}).then(r=>JSON.parse(JSON.stringify(r)))`);
    assert(Array.isArray(r.editableSlides), 'no editableSlides in the outline');
    assert(r.editableSlides.includes('s06'), 's06 carries a note but is not listed editable');
    return `editable: ${r.editableSlides.join(' ')}`;
  });

  await t.check('edit_items removes one card and leaves the rest alone', async () => {
    const before = (await props('s03')).cards.map(c => c.head);
    const r = await d.$(`window.__t.callable.edit_items({slideId:'s03',list:'cards',op:'remove',index:1})
      .then(r=>JSON.parse(JSON.stringify(r)))`);
    // s03 carries no note: out of scope while 'noted only'. Widen, retry, narrow.
    eq(r.ok, false, 'edit_items ignored the scope');
    await d.clickText('whole deck', '.sc-seg button');
    const r2 = await d.$(`window.__t.callable.edit_items({slideId:'s03',list:'cards',op:'remove',index:1})
      .then(r=>JSON.parse(JSON.stringify(r)))`);
    eq(r2.ok, true, `remove failed: ${JSON.stringify(r2)}`);
    const after = (await props('s03')).cards.map(c => c.head);
    eq(after.length, before.length - 1, 'count did not drop by one');
    eq(after[0], before[0], 'the wrong card moved');
    await goSlide(3);
    eq(await d.$(`document.querySelectorAll('.slide .card').length`), after.length,
      'the artboard does not show the removal');
    await d.clickText('noted only', '.sc-seg button');
    return `${before.length} → ${after.length} cards`;
  });

  await t.check('a note can be edited after it is pinned', async () => {
    await nav('?deck=1&slide=6');
    await d.$(`document.querySelector('.scribble').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);
    await d.sleep(300);
    assert(await d.clickText('edit', '.mark-acts button'), 'no edit action on a selected note');
    await d.$(`(()=>{const t=document.querySelector('.ne textarea');t.focus();
      // React's controlled input needs the NATIVE setter or onChange never sees it
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')
        .set.call(t,'Reworded after pinning.');
      t.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
    await d.clickText('Fix', '.se-k');
    await d.clickText('save', '.mark-acts button');
    await d.sleep(250);
    const a = (await state()).annotations.find(x => x.slideId === 's06');
    eq(a.body, 'Reworded after pinning.', 'the body did not change');
    eq(a.kind, 'fix', 'the kind did not change');
    return 'body and kind rewritten in place';
  });

  await t.check('the session survives a reload, and ?fresh ignores it', async () => {
    await nav('?deck=1');
    await d.$(`window.__t.callable.resolve_annotation({annotationId:
      ${JSON.stringify('seed_pie')}})`);
    await d.sleep(500);          // let the debounced persist land
    await nav('?deck=1&keep');   // no fresh: the saved session should come back
    const a = (await state()).annotations.find(x => x.id === 'seed_pie');
    eq(a?.status, 'resolved', 'the resolve did not survive the reload');
    await nav('?deck=1');        // fresh again: seeds restored
    const b = (await state()).annotations.find(x => x.id === 'seed_pie');
    eq(b?.status, 'open', '?fresh did not ignore the saved session');
    return 'persisted, and fresh starts clean';
  });

  await t.check('the export carries the model and the import restores it exactly', async () => {
    await nav('?deck=1');
    const r = await d.$(`(async()=>{
      const ex=await import('/src/deck/exportHtml.ts');
      const im=await import('/src/deck/importHtml.ts');
      const deck=window.__s.getState().deck;
      const rep=im.importHtml(ex.exportHtml(deck),'rt.html');
      return {lossless:rep.lossless===true,
        types:rep.deck.slides.map(s=>s.type).join(','),
        want:deck.slides.map(s=>s.type).join(','),
        figure:rep.deck.slides[1].props.figure};
    })()`);
    eq(r.lossless, true, 'the round trip fell back to heuristics');
    eq(r.types, r.want, 'slide types changed in the round trip');
    eq(r.figure, '$202M', 'the hero figure did not survive');
    return 'lossless, all twelve types intact';
  });
}

console.log('\nconsole output collected:');
  if (!allErrs.length) console.log('  (none)');
  allErrs.forEach(e => console.log(`  · ${e.label}: ${e.errs.join(' | ')}`));
  const ok = t.report();
  d.close(); cdp.close();
  process.exit(ok ? 0 : 1);
}
await finish();
