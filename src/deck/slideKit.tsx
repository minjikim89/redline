import type { ReactNode } from 'react';

/** Marks a region an annotation can anchor to. */
export function A({ id, label, children, className, style }: {
  id: string; label: string; children: ReactNode; className?: string; style?: React.CSSProperties;
}) {
  return (
    <div className={className} style={style} data-el-id={id} data-el-label={label}>
      {children}
    </div>
  );
}

/** kicker → headline → body → source. The spine every content slide shares. */
export function Sheet({ kicker, accent, title, source, asOf, children, foot }: {
  kicker?: string; accent?: string; title?: string;
  source?: string; asOf?: string; foot?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="sheet">
      {kicker && (
        <A id="kicker" label="section kicker" className="k" style={{ color: accent }}>
          {kicker}
        </A>
      )}
      {title && <A id="title" label="slide headline" className="h2">{title}</A>}
      <A id="body" label="the slide body" className="sheet-body">{children}</A>
      {foot}
      {(source || asOf) && (
        <A id="source" label="source line" className="src">
          {source || 'Source: not cited'}{asOf ? ` · AS OF ${asOf}` : ''}
        </A>
      )}
    </div>
  );
}

/**
 * The author's bar: label and value sit ABOVE a full-width track. Widths are
 * proportional to the values — the original artboard used hand-set widths.
 */
export function BarRow({ label, value, unit, pct, color, strong, id }: {
  label: string; value: string | number; unit?: string; pct: number;
  color: string; strong?: boolean; id: string;
}) {
  return (
    <A id={id} label={`bar: ${label}`} className={`brow${strong ? ' strong' : ''}`}>
      <div className="brow-head"><span>{label}</span><span>{value}{unit}</span></div>
      <div className="brow-track"><i style={{ width: `${pct}%`, background: color }} /></div>
    </A>
  );
}

export function BarGroup({ caption, rows, note }: {
  caption: string; rows: ReactNode; note?: string;
}) {
  return (
    <div className="bgroup">
      <div className="bgroup-cap">{caption}</div>
      <div className="bgroup-rows">{rows}</div>
      {note && <p className="bgroup-note">{note}</p>}
    </div>
  );
}
