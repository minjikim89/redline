/**
 * Input validation for tool calls.
 *
 * Neither the spec nor Chrome promises that the browser checks a tool's
 * arguments against its `inputSchema` before calling `execute` (spec issue
 * #92 is still open, and Chrome 152 hands the raw object straight through).
 * An agent that drops a required field or sends a number as a string would
 * otherwise write `undefined` into the deck the person is watching.
 *
 * This covers the subset of JSON Schema the registry and the tool schemas
 * actually use: type, required, enum, additionalProperties, min/max length,
 * minimum/maximum, min/max items, pattern, nested properties and items.
 */
export interface Problem { path: string; message: string }

const typeOf = (v: unknown) =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;

export function validate(schema: any, value: unknown, path = ''): Problem[] {
  if (!schema || typeof schema !== 'object') return [];
  const out: Problem[] = [];
  const at = path || '(input)';

  if (schema.type) {
    const t = typeOf(value);
    const want: string[] = Array.isArray(schema.type) ? schema.type : [schema.type];
    const ok = want.some(w => w === t || (w === 'integer' && t === 'number' && Number.isInteger(value)));
    if (!ok) {
      out.push({ path: at, message: `expected ${want.join(' | ')}, got ${t}` });
      return out;                                   // no point checking further
    }
  }

  if (schema.enum && !schema.enum.includes(value))
    out.push({ path: at, message: `must be one of ${schema.enum.map(String).join(', ')}` });

  if (typeof value === 'string') {
    if (schema.maxLength != null && value.length > schema.maxLength)
      out.push({ path: at, message: `longer than ${schema.maxLength} characters` });
    if (schema.minLength != null && value.length < schema.minLength)
      out.push({ path: at, message: `shorter than ${schema.minLength} characters` });
    if (schema.pattern && !new RegExp(schema.pattern).test(value))
      out.push({ path: at, message: `does not match ${schema.pattern}` });
  }

  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum)
      out.push({ path: at, message: `below minimum ${schema.minimum}` });
    if (schema.maximum != null && value > schema.maximum)
      out.push({ path: at, message: `above maximum ${schema.maximum}` });
  }

  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems)
      out.push({ path: at, message: `needs at least ${schema.minItems} item(s)` });
    if (schema.maxItems != null && value.length > schema.maxItems)
      out.push({ path: at, message: `holds at most ${schema.maxItems} item(s)` });
    if (schema.items) value.forEach((v, i) => out.push(...validate(schema.items, v, `${path}[${i}]`)));
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const props = schema.properties ?? {};
    for (const k of schema.required ?? [])
      if (!(k in obj) || obj[k] === undefined)
        out.push({ path: path ? `${path}.${k}` : k, message: 'is required' });
    for (const [k, v] of Object.entries(obj)) {
      const p = path ? `${path}.${k}` : k;
      if (k in props) out.push(...validate(props[k], v, p));
      else if (schema.additionalProperties === false)
        out.push({ path: p, message: `is not a known field (known: ${Object.keys(props).join(', ')})` });
    }
  }

  return out;
}
