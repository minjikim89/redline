import type { Deck, Slide } from './types';

/**
 * Write the deck back out as a standalone HTML file.
 *
 * Two jobs. It hands the work back to whatever the person uses next, and it
 * closes the round trip: what comes out here goes back through importHtml and
 * lands on the same slide types. That round trip is the proof that the model,
 * not the markup, is the thing being passed around.
 */

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const TONE: Record<string, { bg: string; fg: string; mut: string }> = {
  light:  { bg: '#F5F6FA', fg: '#0B0B12', mut: '#565C6E' },
  white:  { bg: '#FFFFFF', fg: '#0B0B12', mut: '#565C6E' },
  dark:   { bg: '#0B0B12', fg: '#F4F5F8', mut: '#9BA0B0' },
  accent: { bg: '#FF00C8', fg: '#12000E', mut: '#3D0032' },
};

function body(s: Slide): string {
  const p = s.props;
  const para = (t: unknown) => `<p>${esc(t)}</p>`;
  const bars = (g: any) => !g ? '' :
    `<div class="grp"><div class="cap">${esc(g.caption)}</div>` +
    (g.rows ?? []).map((r: any) =>
      `<div class="row"><span>${esc(r.label)}</span><span>${esc(r.value)}${esc(g.unit ?? '')}</span></div>`).join('') +
    (g.note ? para(g.note) : '') + '</div>';

  switch (s.type) {
    case 'cover':
      return `${para(p.subtitle)}${(p.meta ?? []).map((m: string) => `<div class="eyebrow">${esc(m)}</div>`).join('')}`;
    case 'hero':
      return `<div class="figure">${esc(p.figure)}</div>${para(p.body)}`;
    case 'cards':
      return (p.cards ?? []).map((c: any) =>
        `<div class="card"><div class="eyebrow">${esc(c.index)}</div><h3>${esc(c.head)}</h3>${para(c.body)}</div>`)
        .join('') + (p.footnote ? para(p.footnote) : '');
    case 'barsPair':
      return bars(p.left) + bars(p.right);
    case 'flow':
      return (p.steps ?? []).map((st: any) => `<div class="card"><h3>${esc(st.head)}</h3>${para(st.body)}</div>`).join('')
        + (p.chart ? `<div class="cap">${esc(p.chart.caption)}</div>`
          + (p.chart.points ?? []).map((pt: any) =>
            `<div class="row"><span>${esc(pt.label)}</span><span>${esc(pt.value)}${esc(p.chart.unit ?? '')}</span></div>`).join('') : '')
        + (p.notes ?? []).map(para).join('');
    case 'figures':
      return (p.items ?? []).map((it: any) =>
        `<div class="card"><div class="eyebrow">${esc(it.tag)}</div><h3>${esc(it.head)}</h3>`
        + `<div class="figure sm">${esc(it.figure)}</div>${para(it.body)}</div>`).join('')
        + (p.notes ?? []).map(para).join('');
    case 'panels':
      return (p.panels ?? []).map((pn: any) =>
        `<div class="card"><div class="eyebrow">${esc(pn.heading)}</div>`
        + (pn.metrics ?? []).map((m: any) =>
          `<div class="row"><span>${esc(m.label)}</span><span>${esc(m.value)}</span></div>`).join('')
        + para(pn.note) + '</div>').join('');
    case 'timeline':
      return (p.events ?? []).map((e: any) =>
        `<div class="row"><span>${esc(e.year)}</span><span>${esc(e.text)}</span></div>`).join('');
    case 'refs':
      return (p.groups ?? []).map((g: any) =>
        `<p><strong>${esc(g.topic)}</strong> ${esc(g.text)}</p>`).join('');
    default:
      return '';
  }
}

export function exportHtml(deck: Deck): string {
  const sections = deck.slides.map(s => {
    const t = TONE[s.tone ?? 'light'];
    const p = s.props;
    const kicker = p.eyebrow ?? p.kicker;
    const heading = p.title ?? '';
    return `<section style="background:${t.bg};color:${t.fg}">
${kicker ? `  <div class="eyebrow" style="color:${t.mut}">${esc(kicker)}</div>` : ''}
${heading ? `  <h2>${esc(heading)}</h2>` : ''}
  ${body(s)}
${p.source ? `  <div class="src" style="color:${t.mut}">${esc(p.source)}${p.asOf ? ` · as of ${esc(p.asOf)}` : ''}</div>` : ''}
${s.conflict ? `  <div class="flag">Flagged by an agent: ${esc(s.conflict.why)}</div>` : ''}
</section>`;
  }).join('\n\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(deck.title)}</title>
<style>
  body{margin:0;font-family:'IBM Plex Sans',system-ui,sans-serif;line-height:1.5}
  section{padding:88px 110px;min-height:70vh;box-sizing:border-box}
  .eyebrow{font-size:13px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;margin-bottom:18px}
  h2{font-size:42px;line-height:1.15;letter-spacing:-.02em;margin:0 0 28px;max-width:22em}
  h3{font-size:22px;margin:0 0 8px}
  p{font-size:17px;max-width:46em;margin:0 0 14px}
  .figure{font-size:120px;font-weight:600;letter-spacing:-.04em;line-height:1;margin:0 0 24px}
  .figure.sm{font-size:56px;margin:8px 0 12px}
  .card{margin:0 0 28px;max-width:46em}
  .grp{margin:0 0 36px;max-width:38em}
  .cap{font-size:15px;font-weight:600;margin-bottom:12px}
  .row{display:flex;justify-content:space-between;gap:24px;padding:7px 0;border-bottom:1px solid rgba(128,128,128,.22);font-size:16px}
  .src{font-size:12px;letter-spacing:.06em;text-transform:uppercase;margin-top:40px}
  .flag{margin-top:20px;padding:12px 16px;border-left:3px solid #E8A33D;background:rgba(232,163,61,.12);font-size:14px}
</style>
</head>
<body>

${sections}

</body>
</html>
`;
}
