import { A, Sheet, BarRow, BarGroup } from '../slideKit';

const PINK = '#FF00C8', VIOLET = '#9000FF', CYAN = '#00A5C8';
const NEUTRAL = '#B9C0CC';

/* ---------------- 01 cover ---------------- */
export function CoverSlide({ eyebrow, title, subtitle, meta }: any) {
  return (
    <div className="sheet cover">
      <div>
        <A id="kicker" label="eyebrow" path="eyebrow" className="k" style={{ color: PINK }}>{eyebrow}</A>
        <A id="title" label="deck title" path="title" className="h1">{title}</A>
        <A id="subtitle" label="standfirst" path="subtitle" className="cover-sub">{subtitle}</A>
      </div>
      <A id="meta" label="cover meta" className="cover-meta">
        {meta?.map((m: string) => <span key={m}>{m}</span>)}
      </A>
    </div>
  );
}

/* ---------------- 02 hero figure ---------------- */
export function HeroSlide({ eyebrow, figure, tail, body, footnote }: any) {
  return (
    <div className="sheet hero">
      <A id="kicker" label="framing line" path="eyebrow" className="hero-eyebrow">{eyebrow}</A>
      <div className="hero-row" data-el-id="value" data-el-label="the headline figure">
        <A id="value.figure" label="the figure" path="figure" className="hero-fig">{figure}</A>
        <A id="value.tail" label="the verb" path="tail" className="hero-tail">{tail}</A>
      </div>
      <A id="body" label="the qualifier" path="body" className="hero-body">{body}</A>
      <A id="source" label="footnote" path="footnote" className="hero-foot">{footnote}</A>
    </div>
  );
}

/* ---------------- 03 / 11 card row ---------------- */
export function CardsSlide({ kicker, accent, title, cards, footnote, footMark, tone }: any) {
  return (
    <Sheet kicker={kicker} accent={accent} title={title}
      foot={footnote && (
        <div className="cards-foot" data-el-id="footnote" data-el-label="closing note">
          {footMark && <span style={{ color: PINK }}>{footMark}</span>}
          <A id="footnote.text" label="closing note" path="footnote"><p>{footnote}</p></A>
        </div>
      )}>
      <div className="cards" style={{ gridTemplateColumns: `repeat(${cards?.length ?? 3},1fr)` }}>
        {cards?.map((c: any, i: number) => (
          <A key={c.head} id={`card.${i}`} label={`card: ${c.head}`}
            className={`card${tone === 'dark' ? ' on-dark' : ''}`}>
            <span className="card-ix" style={{ color: c.color ?? PINK }}>{c.index}</span>
            <A id={`card.${i}.head`} label={`card head: ${c.head}`}
              path={`cards.${i}.head`} className="card-head">{c.head}</A>
            <A id={`card.${i}.body`} label={`card body: ${c.head}`}
              path={`cards.${i}.body`} className="card-body">{c.body}</A>
          </A>
        ))}
      </div>
    </Sheet>
  );
}

/* ---------------- 04 / 07 / 10 paired bar groups ---------------- */
export function BarsPairSlide({ kicker, accent, title, left, right, source, asOf }: any) {
  const group = (g: any, side: string) => {
    // A share reads against the whole. Scaling a 8.5% bar to full width because
    // it happens to be the largest in its group would misstate it.
    const max = g.unit === '%' ? 100 : (Math.max(...g.rows.map((r: any) => r.value)) || 1);
    return (
      <BarGroup caption={g.caption} note={g.note} side={side as 'left' | 'right'}
        rows={g.rows.map((r: any, i: number) => (
          <BarRow key={r.label} id={`${side}.bar.${i}`} label={r.label}
            path={`${side}.rows.${i}`}
            value={r.value} unit={g.unit} pct={(r.value / max) * 100}
            color={r.color ?? (r.strong ? PINK : NEUTRAL)} strong={r.strong} />
        ))} />
    );
  };
  return (
    <Sheet kicker={kicker} accent={accent} title={title} source={source} asOf={asOf}>
      <div className="two-col">
        {group(left, 'left')}
        {right && group(right, 'right')}
      </div>
    </Sheet>
  );
}

/* ---------------- 05 flow + proxy chart ---------------- */
export function FlowSlide({ kicker, accent, title, steps, chart, notes, source, asOf }: any) {
  const max = Math.max(...(chart?.points ?? []).map((p: any) => p.value)) || 1;
  return (
    <Sheet kicker={kicker} accent={accent} title={title} source={source} asOf={asOf}>
      <div className="flow-wrap">
        <div className="flow">
          {steps?.map((s: any, i: number) => (
            <>
              {i > 0 && <span key={`a${i}`} className="flow-arrow" style={{ color: accent }}>→</span>}
              <A key={s.head} id={`step.${i}`} label={`step: ${s.head}`} className="flow-card">
                <A id={`step.${i}.head`} label={`step: ${s.head}`}
                  path={`steps.${i}.head`} className="flow-head">{s.head}</A>
                <A id={`step.${i}.body`} label={`step note: ${s.head}`}
                  path={`steps.${i}.body`} className="flow-body">{s.body}</A>
              </A>
            </>
          ))}
        </div>
        <div className="flow-lower">
          <A id="chart" label="the conversion chart" className="proxy">
            <div className="proxy-cap">{chart?.caption}</div>
            <div className="proxy-cols">
              {chart?.points?.map((p: any) => (
                <div className="proxy-col" key={p.label}>
                  <span className="proxy-v">{p.value}{chart.unit}</span>
                  <div className="proxy-bar" style={{
                    height: `${(p.value / max) * 190}px`, background: accent,
                  }} />
                  <span className="proxy-l">{p.label}</span>
                </div>
              ))}
            </div>
          </A>
          <div className="flow-notes">
            {notes?.map((n: string, i: number) => (
              <p key={n} className={i === 0 ? 'note-lead' : 'note-sub'}>{n}</p>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

/* ---------------- 06 three figures ---------------- */
/**
 * chartForm defaults to 'pie', which is the wrong form here: these three export
 * lines are not parts of one whole, so a pie asserts a total that has no meaning.
 * 'cards' is the authored treatment; 'column' also reads correctly.
 */
export function FiguresSlide({ kicker, accent, title, chartForm = 'pie', items, notes }: any) {
  const total = items?.reduce((s: number, i: any) => s + i.value, 0) || 1;
  const max = Math.max(...(items ?? []).map((i: any) => i.value)) || 1;
  const colors = [PINK, VIOLET, CYAN];

  const pie = () => {
    let a = -Math.PI / 2;
    return (
      <svg viewBox="0 0 420 420" className="fig-pie">
        {items?.map((it: any, i: number) => {
          const sweep = (it.value / total) * Math.PI * 2;
          const [x1, y1] = [210 + 190 * Math.cos(a), 210 + 190 * Math.sin(a)];
          a += sweep;
          const [x2, y2] = [210 + 190 * Math.cos(a), 210 + 190 * Math.sin(a)];
          return <path key={it.tag} fill={colors[i % 3]} stroke="#F5F6FA" strokeWidth="3"
            d={`M 210 210 L ${x1} ${y1} A 190 190 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`} />;
        })}
      </svg>
    );
  };

  return (
    <Sheet kicker={kicker} accent={accent} title={title}
      foot={<A id="footnote" label="closing notes" className="fig-notes">
        {notes?.map((n: string) => <p key={n}>{n}</p>)}
      </A>}>
      <A id="chart" label="the export figures" className={`figs form-${chartForm}`}>
        {chartForm === 'pie' ? (
          <div className="fig-pie-wrap">
            {pie()}
            <ul className="fig-legend">
              {items?.map((it: any, i: number) => (
                <li key={it.tag}>
                  <i style={{ background: colors[i % 3] }} />
                  <span>{it.head}</span><b>{it.figure}</b>
                </li>
              ))}
            </ul>
          </div>
        ) : chartForm === 'column' ? (
          <div className="fig-plotwrap">
            <div className="fig-plot">
              {items?.map((it: any, i: number) => (
                <div className="fig-col" key={it.tag}>
                  <span className="fig-col-v">{it.figure}</span>
                  <div style={{ height: `${(it.value / max) * 100}%`, background: colors[i % 3] }} />
                </div>
              ))}
            </div>
            <div className="fig-labels">
              {items?.map((it: any) => <span key={it.tag}>{it.head}</span>)}
            </div>
          </div>
        ) : (
          <div className="fig-cards">
            {items?.map((it: any, i: number) => (
              <div className="fig-card" key={it.tag}>
                <span className="fig-tag" style={{ color: colors[i % 3] }}>{it.tag}</span>
                <A id={`item.${i}.head`} label={`figure label: ${it.head}`}
                  path={`items.${i}.head`} className="fig-head">{it.head}</A>
                <A id={`item.${i}.value`} label={`figure: ${it.head}`}
                  path={`items.${i}.figure`} className="fig-value">{it.figure}</A>
                <A id={`item.${i}.body`} label={`figure note: ${it.head}`}
                  path={`items.${i}.body`} className="fig-body">{it.body}</A>
              </div>
            ))}
          </div>
        )}
      </A>
    </Sheet>
  );
}

/* ---------------- 08 two panels ---------------- */
export function PanelsSlide({ kicker, accent, title, panels, source, asOf }: any) {
  return (
    <Sheet kicker={kicker} accent={accent} title={title} source={source} asOf={asOf}>
      <div className="two-col">
        {panels?.map((p: any, pi: number) => (
          <A key={p.heading} id={`panel.${pi}`} label={`panel: ${p.heading}`}
            className={`panel${p.dark ? ' dark' : ''}`}>
            <span className="panel-head" style={{ color: pi === 0 ? PINK : VIOLET }}>{p.heading}</span>
            <div className="panel-grid">
              {p.metrics?.map((m: any, mi: number) => (
                <div className="panel-m" key={m.label}
                  data-el-id={`panel.${pi}.metric.${mi}`} data-el-label={`figure: ${m.label}`}>
                  <A id={`panel.${pi}.metric.${mi}.value`} label={`figure: ${m.label}`}
                    path={`panels.${pi}.metrics.${mi}.value`} className="panel-v"
                    style={m.emphasis ? { color: pi === 0 ? PINK : VIOLET } : undefined}>
                    {m.value}
                  </A>
                  <A id={`panel.${pi}.metric.${mi}.label`} label={`label: ${m.label}`}
                    path={`panels.${pi}.metrics.${mi}.label`} className="panel-l">{m.label}</A>
                </div>
              ))}
            </div>
            <A id={`panel.${pi}.note`} label={`panel note: ${p.heading}`}
              path={`panels.${pi}.note`} className="panel-note">{p.note}</A>
          </A>
        ))}
      </div>
    </Sheet>
  );
}

/* ---------------- 09 timeline ---------------- */
export function TimelineSlide({ kicker, accent, title, events, source }: any) {
  return (
    <Sheet kicker={kicker} accent={accent} title={title} source={source}>
      <div className="tline">
        <div className="tline-years">
          {events?.map((e: any) => (
            <span key={e.year} style={{ color: e.late ? PINK : VIOLET }}>{e.year}</span>
          ))}
        </div>
        <div className="tline-rule" />
        <div className="tline-items">
          {events?.map((e: any, i: number) => (
            <A key={e.year} id={`event.${e.year}`} label={`${e.year} entry`} className="tline-item">
              <i style={{ background: e.late ? PINK : VIOLET }} />
              <A id={`event.${e.year}.text`} label={`${e.year} text`}
                path={`events.${i}.text`}><p>{e.text}</p></A>
            </A>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

/* ---------------- 12 references ---------------- */
export function RefsSlide({ kicker, accent, title, groups, source }: any) {
  const half = Math.ceil((groups?.length ?? 0) / 2);
  const col = (list: any[], side: string, offset: number) => (
    <div className="refs-col">
      {list.map((g, i) => (
        <div key={g.topic} className="ref"
          data-el-id={`${side}.ref.${i}`} data-el-label={`reference: ${g.topic}`}>
          <A id={`${side}.ref.${i}.topic`} label={`reference topic: ${g.topic}`}
            path={`groups.${offset + i}.topic`} className="ref-topic">{g.topic}</A>{' '}
          <A id={`${side}.ref.${i}.text`} label={`reference text: ${g.topic}`}
            path={`groups.${offset + i}.text`} className="ref-text">{g.text}</A>
        </div>
      ))}
    </div>
  );
  return (
    <Sheet kicker={kicker} accent={accent} title={title} source={source}>
      <div className="refs">
        {col(groups?.slice(0, half) ?? [], 'left', 0)}
        {col(groups?.slice(half) ?? [], 'right', half)}
      </div>
    </Sheet>
  );
}
