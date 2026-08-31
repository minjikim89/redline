/**
 * A small Chrome DevTools Protocol driver, so the app can be exercised the way
 * a person exercises it — real pointer events, real key events, real layout —
 * rather than through a synthetic render.
 *
 *   node e2e/driver.mjs            # runs the checks in e2e/scenarios.mjs
 */
export async function connect(port = 9222) {
  const targets = await (await fetch(`http://localhost:${port}/json/list`)).json();
  const tab = targets.find(t => t.type === 'page');
  if (!tab) throw new Error('no page target — is Chrome running with --remote-debugging-port?');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));

  let id = 0;
  const waiting = new Map();
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise(res => {
    const n = ++id; waiting.set(n, res);
    ws.send(JSON.stringify({ id: n, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const api = {
    close: () => ws.close(),
    sleep,
    async go(url, settle = 2500) {
      await send('Page.navigate', { url });
      await sleep(settle);
    },
    async $(expr) {
      const r = await send('Runtime.evaluate', {
        expression: expr, returnByValue: true, awaitPromise: true,
      });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
      return r.result?.result?.value;
    },
    /** Click the first element whose text contains `text`. */
    async clickText(text, sel = 'button') {
      const ok = await api.$(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(sel)})]
        .find(x=>x.textContent.includes(${JSON.stringify(text)}));if(!b)return false;b.click();return true;})()`);
      await sleep(350);
      return ok;
    },
    async clickAt(x, y) {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await send('Input.dispatchMouseEvent', {
          type, x, y, button: 'left', clickCount: 1,
          buttons: type === 'mousePressed' ? 1 : 0, pointerType: 'mouse',
        });
      }
      await sleep(250);
    },
    /** Draw a rough circle centred on (x, y). */
    async circle(x, y, rx = 70, ry = 46, steps = 24) {
      const ev = (type, px, py) => send('Input.dispatchMouseEvent', {
        type, x: Math.round(px), y: Math.round(py), button: 'left',
        buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'mouse',
      });
      await ev('mousePressed', x + rx, y);
      for (let i = 1; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        await ev('mouseMoved', x + Math.cos(a) * rx, y + Math.sin(a) * ry);
        await sleep(10);
      }
      await ev('mouseReleased', x + rx, y);
      await sleep(400);
    },
    /** A real press-move-release, so Chrome synthesises the pointer events React listens for. */
    async drag(x1, y1, x2, y2, steps = 10) {
      const ev = (type, x, y, buttons) => send('Input.dispatchMouseEvent', {
        type, x: Math.round(x), y: Math.round(y), button: 'left', buttons,
        clickCount: 1, pointerType: 'mouse',
      });
      await ev('mousePressed', x1, y1, 1);
      for (let i = 1; i <= steps; i++) {
        await ev('mouseMoved', x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps, 1);
        await sleep(16);
      }
      await ev('mouseReleased', x2, y2, 0);
      await sleep(400);
    },
    async type(text) { await send('Input.insertText', { text }); await sleep(150); },
    async key(key, code = key, vk = 0) {
      for (const type of ['keyDown', 'keyUp']) {
        await send('Input.dispatchKeyEvent', {
          type, key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk,
        });
      }
      await sleep(250);
    },
    enter: () => api.key('Enter', 'Enter', 13),
    esc: () => api.key('Escape', 'Escape', 27),
    /** Centre of the first element matching `sel`, in viewport coordinates. */
    box: sel => api.$(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});
      if(!e)return null;const r=e.getBoundingClientRect();
      return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),
              left:Math.round(r.left),top:Math.round(r.top),
              w:Math.round(r.width),h:Math.round(r.height)};})()`),
    count: sel => api.$(`document.querySelectorAll(${JSON.stringify(sel)}).length`),
    text: sel => api.$(`document.querySelector(${JSON.stringify(sel)})?.innerText ?? null`),
  };
  return api;
}

/* ---------- a tiny assertion harness ---------- */
export function suite() {
  const results = [];
  return {
    results,
    async check(name, fn) {
      try {
        const detail = await fn();
        results.push({ name, ok: true, detail: detail ?? '' });
        console.log(`  PASS  ${name}${detail ? `  — ${detail}` : ''}`);
      } catch (e) {
        results.push({ name, ok: false, detail: e.message });
        console.log(`  FAIL  ${name}  — ${e.message}`);
      }
    },
    report() {
      const bad = results.filter(r => !r.ok);
      console.log(`\n  ${results.length - bad.length}/${results.length} passed`);
      if (bad.length) {
        console.log('\n  failures:');
        bad.forEach(b => console.log(`    · ${b.name}: ${b.detail}`));
      }
      return bad.length === 0;
    },
  };
}

export const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
export const eq = (a, b, msg) => assert(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
