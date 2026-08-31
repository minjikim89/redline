import type { Datum } from './types';
import { series } from './theme';

const fmt = (n: number) => n >= 1000 ? n.toLocaleString() : String(n);

export function Pie({ data, unit }: { data: Datum[]; unit: string }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const R = 120, C = 140;
  let angle = -Math.PI / 2;

  return (
    <div className="chart-row">
      <svg viewBox="0 0 280 280" className="chart-svg" style={{ maxWidth: 340 }}>
        {data.map((d, i) => {
          const sweep = (d.value / total) * Math.PI * 2;
          const [x1, y1] = [C + R * Math.cos(angle), C + R * Math.sin(angle)];
          angle += sweep;
          const [x2, y2] = [C + R * Math.cos(angle), C + R * Math.sin(angle)];
          const large = sweep > Math.PI ? 1 : 0;
          return (
            <path key={d.label} fill={series[i % series.length]} stroke="#fff" strokeWidth="1.5"
              d={`M ${C} ${C} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`} />
          );
        })}
      </svg>
      <ul className="legend">
        {data.map((d, i) => (
          <li key={d.label}>
            <i style={{ background: series[i % series.length] }} />
            <span className="lg-label">{d.label}</span>
            <span className="lg-val">{fmt(d.value)}{unit}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal, sorted descending. The form a 9-category composition actually needs. */
export function Bar({ data, unit }: { data: Datum[]; unit: string }) {
  const rows = [...data].sort((a, b) => b.value - a.value);
  const max = Math.max(...rows.map(r => r.value)) || 1;
  return (
    <div className="bars">
      {rows.map((d, i) => (
        <div className="bar-row" key={d.label}>
          <span className="bar-label">{d.label}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{
              width: `${(d.value / max) * 100}%`,
              background: i === 0 ? series[0] : '#9db8e8',
            }} />
          </div>
          <span className="bar-val">{fmt(d.value)}{unit}</span>
        </div>
      ))}
    </div>
  );
}

export function Column({ data, unit }: { data: Datum[]; unit: string }) {
  const max = Math.max(...data.map(r => r.value)) || 1;
  return (
    <div className="cols">
      {data.map((d, i) => (
        <div className="col" key={d.label}>
          <span className="col-val">{fmt(d.value)}{unit}</span>
          <div className="col-bar" style={{
            height: `${(d.value / max) * 190}px`,
            background: series[i % series.length],
          }} />
          <span className="col-label">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Line({ data, unit }: { data: Datum[]; unit: string }) {
  const W = 620, H = 220, P = 28;
  const max = Math.max(...data.map(d => d.value)) || 1;
  const min = Math.min(...data.map(d => d.value), 0);
  const x = (i: number) => P + (i * (W - P * 2)) / Math.max(data.length - 1, 1);
  const y = (v: number) => H - P - ((v - min) / (max - min || 1)) * (H - P * 2);
  const path = data.map((d, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(d.value)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H + 24}`} className="chart-svg">
      <path d={`${path} L ${x(data.length - 1)} ${H - P} L ${x(0)} ${H - P} Z`}
        fill="url(#g)" opacity=".18" />
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={series[0]} /><stop offset="100%" stopColor={series[0]} stopOpacity="0" />
      </linearGradient></defs>
      <path d={path} fill="none" stroke={series[0]} strokeWidth="3"
        strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => (
        <g key={d.label}>
          <circle cx={x(i)} cy={y(d.value)} r="4.5" fill="#fff" stroke={series[0]} strokeWidth="2.5" />
          <text x={x(i)} y={H - 6} textAnchor="middle" className="tick">{d.label}</text>
          <text x={x(i)} y={y(d.value) - 12} textAnchor="middle" className="pt">{fmt(d.value)}{unit}</text>
        </g>
      ))}
    </svg>
  );
}
