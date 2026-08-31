import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App';
import * as store from '../src/annotations/store';
import { importHtml } from '../src/deck/importHtml';
import { sampleDeck } from '../src/deck/sampleDeck';
import '../src/styles.css';

const q = new URLSearchParams(location.search);
const which = q.get('deck') ?? 'sample';

async function boot() {
  if (which === 'long' || which === 'many') {
    const html = await (await fetch(`/.scratch/${which}.html`)).text();
    store.loadDeck(importHtml(html, `${which}.html`).deck);
  } else {
    store.loadDeck(JSON.parse(JSON.stringify(sampleDeck)));
  }
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
  setTimeout(() => {
    for (const k of (q.get('keys') ?? '').split(',').filter(Boolean)) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    }
  }, 400);
}
boot();
