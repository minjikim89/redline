import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';
import { registerAll } from './webmcp/tools';

/**
 * Register before the first paint. Doing it in a mount effect meant an agent
 * connecting during startup saw a partial tool list and had to re-fetch.
 * The store is seeded at module load, so the conditional set is already correct.
 */
registerAll().catch(() => { /* reported in the UI */ });

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
