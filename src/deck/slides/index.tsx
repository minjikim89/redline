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
        {kicker && <El id="kicker"><div className="kicker">{kicker}</div></El>}
        <El id="title"><h2 className="slide-title">{title}</h2></El>
      </header>
      <El id="chart" block><div className="slide-content">{children}</div></El>
      {(source || asOf) && (
        <El id="source">
          <footer className="slide-source">
            {source ?? 'Source: —'}{asOf ? ` · as of ${asOf}` : ''}
          </footer>
        </El>
      )}
    </div>
  );
}

export function TitleSlide({ title, subtitle, byline }: any) {
  return (
    <div className="slide-body slide-cover">
      <El id="title"><h1 className="cover-title">{title}</h1></El>
      <El id="subtitle"><p className="cover-sub">{subtitle}</p></El>
      <El id="byline"><p className="cover-by">{byline}</p></El>
    </div>
  );
}

export function BigNumberSlide({ kicker, value, unit, caption, source }: any) {
  return (
    <Frame title={caption} kicker={kicker} source={source}>
      <div className="bignum">
        <El id="value"><span className="bignum-v">{value}<em>{unit}</em></span></El>
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
