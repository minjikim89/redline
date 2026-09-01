import { useMemo } from 'react';
import { registry } from './registry';
import * as store from '../annotations/store';
import type { Slide } from './types';

/**
 * The properties panel is generated from the same JSON Schema that types the
 * agent's tools. One declaration gives the model its vocabulary and the person
 * their controls, so the two can never drift apart.
 */

type Node = { key: string; path: string; schema: any; value: any };

function walk(schema: any, value: any, path = '', depth = 0): Node[] {
  if (depth > 3) return [];
  const out: Node[] = [];
  for (const [key, sub] of Object.entries<any>(schema ?? {})) {
    const p = path ? `${path}.${key}` : key;
    const v = value?.[key];
    if (sub?.type === 'array' && sub.items?.properties) {
      out.push({ key, path: p, schema: sub, value: v ?? [] });
    } else if (sub?.type === 'object' && sub.properties) {
      out.push(...walk(sub.properties, v, p, depth + 1));
    } else {
      out.push({ key, path: p, schema: sub, value: v });
    }
  }
  return out;
}

const label = (k: string) =>
  k.replace(/([A-Z])/g, ' $1').replace(/[._]/g, ' ').trim().toLowerCase();

function Field({ slideId, node }: { slideId: string; node: Node }) {
  const { schema, path, value } = node;
  const set = (v: unknown) => store.setByPath(slideId, path, v);

  if (schema?.enum) {
    return (
      <div className="fld">
        <span className="fld-k">{label(node.key)}</span>
        <div className="seg">
          {(schema.enum as string[]).map(o => (
            <button key={o} className={value === o ? 'on' : ''} onClick={() => set(o)}>{o}</button>
          ))}
        </div>
      </div>
    );
  }
  if (schema?.type === 'boolean') {
    return (
      <div className="fld">
        <span className="fld-k">{label(node.key)}</span>
        <button className={`tog${value ? ' on' : ''}`} onClick={() => set(!value)}>
          {value ? 'on' : 'off'}
        </button>
      </div>
    );
  }
  if (schema?.type === 'number') {
    return (
      <div className="fld">
        <span className="fld-k">{label(node.key)}</span>
        <input className="num" type="number" value={value ?? ''} step="0.1"
          onChange={e => set(e.target.value === '' ? 0 : Number(e.target.value))} />
      </div>
    );
  }
  if (schema?.pattern === '^#[0-9A-Fa-f]{6}$') {
    return (
      <div className="fld">
        <span className="fld-k">{label(node.key)}</span>
        <input className="col" type="color" value={value ?? '#B9C0CC'}
          onChange={e => set(e.target.value)} />
      </div>
    );
  }
  const long = (schema?.maxLength ?? 0) > 120;
  return (
    <div className={long ? 'fld col' : 'fld'}>
      <span className="fld-k">{label(node.key)}</span>
      {long
        ? <textarea value={value ?? ''} rows={3} onChange={e => set(e.target.value)} />
        : <input value={value ?? ''} onChange={e => set(e.target.value)} />}
    </div>
  );
}

/** An array of objects: reorder, remove, append. The structural half of editing. */
function ListField({ slideId, node }: { slideId: string; node: Node }) {
  const rows: any[] = node.value ?? [];
  const item = node.schema.items;
  const write = (next: any[]) => store.setByPath(slideId, node.path, next);
  const blank = () => Object.fromEntries(
    Object.entries<any>(item.properties).map(([k, s]) =>
      [k, s.type === 'number' ? 0 : s.type === 'boolean' ? false : '']));
  const max = node.schema.maxItems ?? 24;
  const min = node.schema.minItems ?? 0;

  return (
    <div className="listf">
      <div className="listf-h">
        <span>{label(node.key)}</span>
        <button disabled={rows.length >= max}
          onClick={() => write([...rows, blank()])}>+ add</button>
      </div>
      {rows.map((r, i) => (
        <div className="listf-row" key={i}>
          <div className="listf-ops">
            <button disabled={i === 0}
              onClick={() => { const n = [...rows]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; write(n); }}>↑</button>
            <button disabled={i === rows.length - 1}
              onClick={() => { const n = [...rows]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; write(n); }}>↓</button>
            <button className="rm" disabled={rows.length <= min}
              onClick={() => write(rows.filter((_, j) => j !== i))}>✕</button>
          </div>
          {walk(item.properties, r, `${node.path}.${i}`, 3).map(n => (
            n.schema?.type === 'array' && n.schema.items?.properties
              // metrics inside a panel, rows inside a group: recurse, or an
              // &lt;input&gt; renders "[object Object]" and editing it corrupts data
              ? <ListField key={n.path} slideId={slideId} node={n} />
              : <Field key={n.path} slideId={slideId} node={n} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Inspector({ slide }: { slide: Slide }) {
  const def = registry[slide.type];
  const nodes = useMemo(
    () => walk(def.propSchema, slide.props),
    [def, slide.props, slide.id],
  );
  const lists = nodes.filter(n => n.schema?.type === 'array');
  const fields = nodes.filter(n => n.schema?.type !== 'array');

  return (
    <aside className="insp">
      <div className="insp-h">
        <strong>{def.label}</strong>
        <code>{slide.id}</code>
      </div>
      <div className="insp-body">
        <div className="fld">
          <span className="fld-k">surface</span>
          <div className="seg">
            {(['light', 'white', 'dark', 'accent'] as const).map(t => (
              <button key={t} className={(slide.tone ?? 'light') === t ? 'on' : ''}
                onClick={() => store.setTone(slide.id, t)}>{t}</button>
            ))}
          </div>
        </div>
        {fields.map(n => <Field key={n.path} slideId={slide.id} node={n} />)}
        {lists.map(n => <ListField key={n.path} slideId={slide.id} node={n} />)}
      </div>
      <p className="insp-foot">
        Built from the slide's schema — the same one the agent's tools are typed against.
      </p>
    </aside>
  );
}
