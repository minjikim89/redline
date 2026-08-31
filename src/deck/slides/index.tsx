import { El } from '../El';
import { Pie, Bar, Column, Line } from '../charts';
import type { ChartForm, Datum } from '../types';

/** Shared chrome: every content slide gets a title block + optional source footer. */
function Frame({ title, kicker, source, asOf, children }: {
  title: string; kicker?: string; source?: string; asOf?: string; children: React.ReactNode;
}) {
  return (
    <div className="slide-body">
      <header className="slide-head">
        {kicker && <El id="kicker" label="section kicker"><div className="kicker">{kicker}</div></El>}
        <El id="title" label="slide headline"><h2 className="slide-title">{title}</h2></El>
      </header>
      <El id="chart" label="the chart" block><div className="slide-content">{children}</div></El>
      {(source || asOf) && (
        <El id="source" label="source line">
          <footer className="slide-source">
            {source || 'Source: not cited'}{asOf ? ` · as of ${asOf}` : ''}
          </footer>
        </El>
      )}
    </div>
  );
}

export function TitleSlide({ title, subtitle, byline }: any) {
  return (
    <div className="slide-body slide-cover">
      <El id="title" label="slide headline"><h1 className="cover-title">{title}</h1></El>
      <El id="subtitle" label="cover subtitle"><p className="cover-sub">{subtitle}</p></El>
      <El id="byline" label="cover byline"><p className="cover-by">{byline}</p></El>
    </div>
  );
}

export function BigNumberSlide({ kicker, value, unit, caption, source, asOf }: any) {
  return (
    <Frame title={caption} kicker={kicker} source={source} asOf={asOf}>
      <div className="bignum">
        <El id="value" label="the headline figure"><span className="bignum-v">{value}<em>{unit}</em></span></El>
      </div>
    </Frame>
  );
}

/**
 * THE HERO SLIDE. `chartForm` is an enum, so an agent can re-form the
 * visualization without inventing markup. Ships as 'pie' on purpose.
 */
export function CompositionSlide({ title, kicker, chartForm, data, unit, source, asOf }:
  { title: string; kicker?: string; chartForm: ChartForm; data: Datum[];
    unit: string; source?: string; asOf?: string }) {
  const Chart = chartForm === 'pie' ? Pie : chartForm === 'column' ? Column : Bar;
  return (
    <Frame title={title} kicker={kicker} source={source} asOf={asOf}>
      <Chart data={data} unit={unit} />
    </Frame>
  );
}

export function TimeSeriesSlide({ title, kicker, data, unit, source, asOf }: any) {
  return (
    <Frame title={title} kicker={kicker} source={source} asOf={asOf}>
      <Line data={data} unit={unit} />
    </Frame>
  );
}

export function ComparisonSlide({ title, kicker, data, unit, source, asOf }: any) {
  return (
    <Frame title={title} kicker={kicker} source={source} asOf={asOf}>
      <Bar data={data} unit={unit} />
    </Frame>
  );
}

export function FlywheelSlide({ title, kicker, stages, source }: any) {
  const R = 150, C = 190;
  return (
    <Frame title={title} kicker={kicker} source={source}>
      <svg viewBox="0 0 380 380" className="chart-svg" style={{ maxWidth: 340 }}>
        <circle cx={C} cy={C} r={R} fill="none" stroke="#dbe3f3" strokeWidth="2" strokeDasharray="6 8" />
        {stages?.map((s: string, i: number) => {
          const a = (i / stages.length) * Math.PI * 2 - Math.PI / 2;
          return (
            <g key={s}>
              <circle cx={C + R * Math.cos(a)} cy={C + R * Math.sin(a)} r="46"
                fill="#eef3ff" stroke="#3B82F6" strokeWidth="2" />
              <text x={C + R * Math.cos(a)} y={C + R * Math.sin(a) + 4}
                textAnchor="middle" className="fw-label">{s}</text>
            </g>
          );
        })}
      </svg>
    </Frame>
  );
}

/** A grid of reported figures under one or two headed panels. */
export function MetricsSlide({ title, kicker, panels, source, asOf }: any) {
  return (
    <Frame title={title} kicker={kicker} source={source} asOf={asOf}>
      <div className="panels">
        {panels?.map((p: any, pi: number) => (
          <div className="panel-card" key={p.heading}
            data-el-id={`panel.${pi}`} data-el-label={`panel: ${p.heading}`}>
            <div className="pc-head">{p.heading}</div>
            <div className="pc-grid">
              {p.metrics?.map((m: any, mi: number) => (
                <div className="pc-m" key={m.label}
                  data-el-id={`panel.${pi}.metric.${mi}`} data-el-label={`figure: ${m.label}`}>
                  <span className={`pc-v${m.negative ? ' neg' : ''}`}>{m.value}</span>
                  <span className="pc-l">{m.label}</span>
                </div>
              ))}
            </div>
            {p.note && <p className="pc-note">{p.note}</p>}
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** Dated events on a spine. */
export function TimelineSlide({ title, kicker, events, source }: any) {
  return (
    <Frame title={title} kicker={kicker} source={source}>
      <ol className="tl">
        {events?.map((e: any) => (
          <li key={e.year} data-el-id={`event.${e.year}`} data-el-label={`${e.year} entry`}>
            <span className="tl-y">{e.year}</span>
            <span className="tl-dot" />
            <span className="tl-t">{e.text}</span>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

/** Numbered arguments. The "so what" slide. */
export function PointsSlide({ title, kicker, points, caveat }: any) {
  return (
    <Frame title={title} kicker={kicker}>
      <div className="pts-wrap">
        <ol className="pts">
          {points?.map((p: any, i: number) => (
            <li key={p.head} data-el-id={`point.${i}`} data-el-label={`point ${i + 1}: ${p.head}`}>
              <span className="pt-n">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <strong>{p.head}</strong>
                <p>{p.body}</p>
              </div>
            </li>
          ))}
        </ol>
        {caveat && (
          <p className="pts-caveat" data-el-id="caveat" data-el-label="the caveat">{caveat}</p>
        )}
      </div>
    </Frame>
  );
}

/** Where every figure came from. */
export function SourcesSlide({ title, kicker, groups }: any) {
  return (
    <Frame title={title} kicker={kicker}>
      <dl className="srcs">
        {groups?.map((g: any, i: number) => (
          <div key={g.topic} data-el-id={`src.${i}`} data-el-label={`source: ${g.topic}`}>
            <dt>{g.topic}</dt>
            <dd>{g.text}</dd>
          </div>
        ))}
      </dl>
    </Frame>
  );
}
