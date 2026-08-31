import { createContext, useContext, useRef, type ReactNode } from 'react';
import * as store from '../annotations/store';

/** Set by App: which slide is on screen, and whether direct editing is on. */
export const EditCtx = createContext<{ slideId: string; editing: boolean }>({
  slideId: '', editing: false,
});

/**
 * A region an annotation can anchor to. Give it a `path` and it also becomes
 * directly editable by the person, writing through the same store the agent's
 * tools write through — so a hand edit is visible to `read_slide` immediately.
 */
export function A({ id, label, path, numeric, children, className, style }: {
  id: string; label: string; path?: string; numeric?: boolean;
  children: ReactNode; className?: string; style?: React.CSSProperties;
}) {
  const { slideId, editing } = useContext(EditCtx);
  const ref = useRef<HTMLDivElement>(null);
  const live = editing && !!path;

  const commit = () => {
    const raw = ref.current?.innerText.replace(/\n+$/, '').trim() ?? '';
    if (numeric) {
      const n = Number(raw.replace(/[^0-9.\-]/g, ''));
      if (!Number.isFinite(n)) { ref.current!.innerText = String(store.getSlide(slideId)?.props ?? ''); return; }
      store.setByPath(slideId, path!, n);
      return;
    }
    store.setByPath(slideId, path!, raw);
  };

  return (
    <div
      ref={ref}
      className={live ? `${className ?? ''} editable`.trim() : className}
      style={style}
      data-el-id={id}
      data-el-label={label}
      contentEditable={live || undefined}
      suppressContentEditableWarning={live || undefined}
      spellCheck={live ? false : undefined}
      onBlur={live ? commit : undefined}
      onKeyDown={live ? (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLElement).blur(); }
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
      } : undefined}
    >
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
        <A id="kicker" label="section kicker" path="kicker" className="k" style={{ color: accent }}>
          {kicker}
        </A>
      )}
      {title && <A id="title" label="slide headline" path="title" className="h2">{title}</A>}
      <A id="body" label="the slide body" className="sheet-body">{children}</A>
      {foot}
      {(source || asOf) && (
        <A id="source" label="source line" path="source" className="src">
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
export function BarRow({ label, value, unit, pct, color, strong, id, path }: {
  label: string; value: string | number; unit?: string; pct: number;
  color: string; strong?: boolean; id: string; path?: string;
}) {
  return (
    <div className={`brow${strong ? ' strong' : ''}`} data-el-id={id} data-el-label={`bar: ${label}`}>
      <div className="brow-head">
        <A id={`${id}.label`} label={`bar label: ${label}`}
          path={path && `${path}.label`}>{label}</A>
        <span className="brow-val">
          <A id={`${id}.value`} label={`bar value: ${label}`}
            path={path && `${path}.value`} numeric>{value}</A>
          {unit}
        </span>
      </div>
      <div className="brow-track"><i style={{ width: `${pct}%`, background: color }} /></div>
    </div>
  );
}

export function BarGroup({ caption, rows, note, side }: {
  caption: string; rows: ReactNode; note?: string; side: 'left' | 'right';
}) {
  return (
    <div className="bgroup">
      <A id={`${side}.caption`} label="chart caption" path={`${side}.caption`} className="bgroup-cap">
        {caption}
      </A>
      <div className="bgroup-rows">{rows}</div>
      {note && (
        <A id={`${side}.note`} label="chart note" path={`${side}.note`} className="bgroup-note">
          {note}
        </A>
      )}
    </div>
  );
}
