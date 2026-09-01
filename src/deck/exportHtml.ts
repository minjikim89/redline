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

/** Closing lines that sit under a slide's columns, not as another column. */
function after(s: Slide): string {
  const p = s.props;
  const para = (t: unknown) => `<p>${esc(t)}</p>`;
  // Marked so it comes back as the footnote it left as, rather than as one
  // more card body — and placed under the columns rather than beside them.
  if (s.type === 'cards' && p.footnote)
    return `<div class="footnote">${esc(p.footnote)}</div>`;
  if (s.type === 'figures') return (p.notes ?? []).map(para).join('');
  if (s.type === 'flow') {
    const chart = p.chart
      ? `<div class="cap">${esc(p.chart.caption)}</div>`
        + (p.chart.points ?? []).map((pt: any) =>
          `<div class="row"><span>${esc(pt.label)}</span>`
          + `<span>${esc(pt.value)}${esc(p.chart.unit ?? '')}</span></div>`).join('')
      : '';
    return chart + (p.notes ?? []).map(para).join('');
  }
  return '';
}

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
      // A head that is only the first clause of the body beneath it is not a
      // heading, it is the same sentence twice. Writing it out makes the file
      // worse to read and makes re-import split one card into two.
      return (p.cards ?? []).map((c: any) => {
        const head = String(c.head ?? '').replace(/…$/, '');
        const dup = !!head && String(c.body ?? '').startsWith(head);
        return `<div class="card"><div class="eyebrow">${esc(c.index)}</div>`
          + (dup ? '' : `<h3>${esc(c.head)}</h3>`) + `${para(c.body)}</div>`;
      }).join('');
    case 'barsPair':
      return bars(p.left) + bars(p.right);
    case 'flow':
      return (p.steps ?? []).map((st: any) =>
        `<div class="card"><h3>${esc(st.head)}</h3>${para(st.body)}</div>`).join('');
    case 'figures':
      return (p.items ?? []).map((it: any) =>
        `<div class="card"><div class="eyebrow">${esc(it.tag)}</div><h3>${esc(it.head)}</h3>`
        + `<div class="figure sm">${esc(it.figure)}</div>${para(it.body)}</div>`).join('');
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
      // The topic is normally the opening words of the text. Emitting both
      // prepends it a second time, and every further round trip prepends it
      // again — "Streaming" becomes "Streaming Streaming Streaming".
      return (p.groups ?? []).map((g: any) => {
        const topic = String(g.topic ?? ''), text = String(g.text ?? '');
        return topic && text.startsWith(topic)
          ? `<p><strong>${esc(topic)}</strong>${esc(text.slice(topic.length))}</p>`
          : `<p><strong>${esc(topic)}</strong> ${esc(text)}</p>`;
      }).join('');
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
    const multi = s.type === 'cards' || s.type === 'barsPair'
      || s.type === 'figures' || s.type === 'panels' || s.type === 'flow';
    return `<section style="background:${t.bg};color:${t.fg}">
${kicker ? `  <div class="eyebrow" style="color:${t.mut}">${esc(kicker)}</div>` : ''}
${heading ? `  <h2>${esc(heading)}</h2>` : ''}
  <div class="sheet">${multi ? `<div class="cols">${body(s)}</div>` : body(s)}${after(s)}</div>
${p.source ? `  <div class="src" style="color:${t.mut}">${esc(p.source)}${p.asOf ? ` · as of ${esc(p.asOf)}` : ''}</div>` : ''}
${s.conflict ? `  <div class="flag">Flagged by an agent: ${esc(s.conflict.why)}</div>` : ''}
</section>`;
  }).join('\n\n');

  const wrapped = sections;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(deck.title)}</title>
<style>
  :root{color-scheme:light}
  body{margin:0;background:#E9EAEF;line-height:1.5;
    font-family:'IBM Plex Sans',system-ui,-apple-system,sans-serif}
  /* One 16:9 artboard per slide, so the file reads as the deck it came from
     rather than as a long scrolling document. */
  .deck{max-width:1180px;margin:0 auto;padding:34px 20px;display:flex;
    flex-direction:column;gap:26px}
  /* The whole slide is one centred block; the source line alone sits low. */
  section{position:relative;aspect-ratio:16/9;padding:5.2% 6.4% 4.4%;box-sizing:border-box;
    display:flex;flex-direction:column;justify-content:center;gap:1.6%;
    border-radius:14px;overflow:hidden;
    box-shadow:0 2px 8px rgba(11,11,18,.09),0 18px 50px rgba(11,11,18,.11)}
  .sheet{display:flex;flex-direction:column;gap:2%;min-height:0;margin-top:1.4%}
  .eyebrow{font-size:1.28vw;font-weight:600;letter-spacing:.15em;text-transform:uppercase;
    margin:0 0 .3em}
  h2{font-size:3.1vw;line-height:1.16;letter-spacing:-.022em;margin:0;max-width:22em}
  h3{font-size:1.9vw;line-height:1.25;margin:0 0 .4em;letter-spacing:-.012em}
  p{font-size:1.5vw;font-weight:300;line-height:1.5;max-width:44em;margin:0 0 .6em}
  .figure{font-size:7.4vw;font-weight:600;letter-spacing:-.045em;line-height:.95;margin:0}
  .figure.sm{font-size:3.4vw;margin:.2em 0 .3em}
  .cols{display:flex;gap:3.4%;align-items:flex-start}
  .cols>*{flex:1;min-width:0}
  .card{margin:0}
  .grp{margin:0}
  .cap{font-size:1.5vw;font-weight:500;margin-bottom:.7em;opacity:.72}
  .row{display:flex;justify-content:space-between;gap:1.6em;padding:.45em 0;
    border-bottom:1px solid rgba(128,128,128,.24);font-size:1.5vw}
  .src{font-size:1.15vw;letter-spacing:.05em;text-transform:uppercase;
    position:absolute;left:6.4%;right:6.4%;bottom:4.4%;opacity:.7}
  .footnote{font-size:1.5vw;font-weight:300;line-height:1.5;max-width:56em;opacity:.78}
  .flag{margin-top:1em;padding:.7em 1em;border-left:3px solid #E8A33D;
    background:rgba(232,163,61,.14);font-size:1.3vw}
  @media (max-width:820px){
    .eyebrow,.src{font-size:11px}
    h2{font-size:26px} h3{font-size:16px} p,.row,.cap{font-size:13px}
    .figure{font-size:62px} .figure.sm{font-size:28px}
    .cols{flex-direction:column;gap:1.2em}
  }
</style>
</head>
<body>
<div class="deck">

${wrapped}

</div>
</body>
</html>
`;
}
