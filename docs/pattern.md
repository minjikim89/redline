# The pattern: a reviewable document surface for a person and an agent

Redline is a slide editor, but nothing in its WebMCP surface is about slides. The
same shape fits any document with a typed model: a contract, a spreadsheet, a
design file, a report. Five parts.

## 1. A typed model is the contract

The document is data with a schema per object type (`registry.ts`). Components
render it; tools mutate it; the properties panel is generated from it. Nobody edits
markup. The export carries the model as a JSON island, so any tool that emits the
format can hand over, and the round trip is lossless.

**Adopt:** `{objectId, type, props}` with a JSON Schema per `type`. Derive the
agent's enums from the schema so they cannot drift.

## 2. Marks anchor to model elements, never to coordinates

A note carries `{objectId, elementId[]}`. The stroke is decoration; the anchor is the
reference. When a fix reflows the layout, every other mark still points at the right
thing, and "this one" has a referent both parties can name.

**Adopt:** every annotatable region renders with `data-el-id`; resolve a gesture to
the ids under it at mark time.

## 3. The queue is the work order, and it authors the toolset

Open notes are state in the document, not chat. The agent reads them with a tool and
writes back on the same pin. Which tools exist follows the queue: a `visualize` note
registers the chart tool; closing the last one unregisters it. Before a document is
open, only the tool that opens one exists.

**Adopt:** compute the wanted tool set from page state; re-sync on every state
change; own every registration with an `AbortController`.

## 4. The person owns the write scope and the stop button

Default scope: only objects carrying an open note. Point writes outside it come back
`OUT_OF_SCOPE`, and the read tools state the scope up front. A batch tool lands
changes one at a time in front of the person, with a page-owned abort signal
combined with the caller's, so stopping it reports what landed.

**Adopt:** a scope switch in the UI; `AbortSignal.any([callerSignal, pageSignal])`
in long-running tools.

## 5. Revisions make the shared surface honest

Every object carries a revision that ticks on any change from either side. Read
tools return it and record what the agent saw; writers refuse with `STALE_READ` and a
diff when the person moved on. Facts and positions are distinguished at the API
level: a tool may correct a figure, and may only *flag* a claim.

**Adopt:** per-object revision outside undo history; `staleness(objectId)` before
every write; a `contradicts` field on the research writer instead of a rewrite.

---

Error shape used throughout, so an agent can recover in one step:

```js
{ ok: false, error: { code, message, ...recovery }, retrySafe: boolean }
```

Codes: `NOT_FOUND`, `INVALID_INPUT`, `NOT_APPLICABLE`, `OUT_OF_SCOPE`,
`STALE_READ`, `CANCELLED`, `ERROR`.
