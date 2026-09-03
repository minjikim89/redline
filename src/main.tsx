import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';
import { registerAll, syncTools } from './webmcp/tools';
import * as store from './annotations/store';

/**
 * Register before the first paint. Doing it in a mount effect meant an agent
 * connecting during startup saw a partial tool list and had to re-fetch.
 * The store is seeded at module load, so the first set is already correct:
 * one tool that opens a deck, or — on a deep link — the full review set.
 *
 * From then on the registered set follows the store: open a deck and the
 * review tools appear; close the last note of a kind and its tool goes away.
 */
registerAll().catch(() => { /* reported in the UI */ });
store.subscribe(() => { syncTools().catch(() => { /* reported in the UI */ }); });

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
