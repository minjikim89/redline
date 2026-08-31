# Redline

**A slide editor you and your agent both have hands in.**

Every AI deck tool can *generate*. None of them can *edit with you*. The moment you
fix a slide by hand, the model goes blind — it can't see what you changed, so asking
it to "make the rest match" regenerates from stale memory and destroys your work.

Redline closes that loop. Click any text and rewrite it; the edit lands in the same
typed model an agent's tools write to, so `read_slide` returns what you just typed.
And when something needs more than a retype, mark it the way you'd mark paper: circle
it, write beside it. The mark resolves to the elements underneath, so the agent knows
exactly what you meant, edits the live deck, and writes back on the same pin.

Three modes: **edit** rewrites text directly, **note** draws a mark for the agent,
**move** repositions marks.

> Requires Chrome 149+ with `chrome://flags/#enable-webmcp-testing`, or the ChatGPT
> desktop app's built-in browser. Open the URL and the deck is already marked up.

---

## Why this needs WebMCP and not MCP

A regular MCP server runs outside the page. It cannot know which element you have in
front of you, and it cannot see the edit you just made by hand. Both facts are the
entire problem here.

- **"This one" finally resolves.** A mark carries `{slideId, elementId[]}`. The agent
  and the human are provably pointing at the same thing — no prose description, no
  guessing from pixels.
- **Manual edits stay visible.** `read_slide` returns live state. There is no stale
  copy to drift from.
- **The change is witnessed.** Tools mutate the deck the human is watching. You see
  the chart re-form; you don't get a file back and hope.

Chrome's own WebMCP demos are transactions — book a table, build a pizza, search
flights. The human states an intent and steps back. Review is not a transaction. It
is an iteration where the human keeps authority, and that only works when both
parties are looking at the same surface.

## What a person and an agent do together here

| | |
|---|---|
| **Human → agent** | Circle a region, write a note. Four kinds: `fix`, `research`, `visualize`, `explain`. |
| **Agent → human** | Reply on the same pin — what changed and why, or what it needs first. |
| **Batch, interruptibly** | "Make the source lines consistent" sweeps the deck one slide at a time, and you can stop it partway. |

---

## Implementation

### The deck is a typed model. There is no HTML escape hatch.

Slides are React components with declared prop schemas
([`src/deck/registry.ts`](src/deck/registry.ts)). That does two jobs:

1. **It makes tools typed.** Component props *are* the JSON Schema. The agent picks a
   chart form from an enum; it cannot hand back malformed markup.
2. **It makes marks survive edits.** Notes anchor to `{slideId, elementId}`, never to
   coordinates. Fixing the first note reflows the slide — with pixel anchors every
   other note would then point at the wrong thing.

There is deliberately **no `update(slideId, props: object)` tool**. An over-general
writer wins every routing decision and collapses the rest of the surface back into
string editing. Chrome's guidance is explicit: *"Be careful not to create overlapping
tools."* Every writer here takes a named field or a typed array.

### Ten tools, three of which only exist while you need them

Always registered:

| Tool | |
|---|---|
| `list_slides` | `readOnlyHint` — deck outline, kept inside the 1.5K output budget |
| `read_slide` | `readOnlyHint` + `untrustedContentHint` — live props and annotatable regions |
| `list_open_annotations` | `readOnlyHint` + `untrustedContentHint` — the queue, with anchors |
| `set_slide_text` | one named field, `field` is an enum |
| `set_chart_data` | typed `{label, value}[]` |
| `reply_to_annotation` | agent writes back on the pin |
| `resolve_annotation` | close a note once the change is really in |

Registered **only while a note of that kind is open**, and unregistered via
`AbortController` when it closes — so *marking up the deck authors the agent's
toolset in real time*:

| Tool | Appears when | Notable |
|---|---|---|
| `set_chart_form` | a `visualize` note is open | enum of forms, validated against the slide's own registry entry |
| `attach_research` | a `research` note is open | `untrustedContentHint`; requires `source` and `asOf`; can raise a `contradicts` flag |
| `unify_across_slides` | a `fix` note is open | long-running and **cancellable mid-sweep** |

### When the answer breaks the argument

`attach_research` takes an optional `contradicts`. An agent that verifies a figure and
finds it undercuts something the slide still asserts raises the conflict — and stops
there. The claim is outlined on the artboard, the author sees what was found and why,
and decides.

This is the case the loop exists for. Ask a chatbot for a company's latest results and
it answers correctly and uselessly: it has never seen slide 8, so it cannot know the
figure it just gave you invalidates that slide's headline. On this page it can, because
the deck and the tools share one address space.

The tool will not rewrite the claim. A number is a fact and an argument is a position;
the agent is allowed to correct the first and only allowed to question the second.

### Every call is visible

Tool traffic is invisible by nature, which makes it hard to trust. Each invocation is
traced onto the page — name, arguments, whether it succeeded — so a person watching can
see exactly what the agent did, in order.

```js
document.modelContext.registerTool({
  name: "set_chart_form",
  description:
    "Change the visual form a slide uses to draw its data. A pie reads well for two " +
    "to four parts of a whole; a sorted bar reads rank. Say which one the data wants.",
  inputSchema: {
    type: "object",
    properties: {
      slideId:   { type: "string" },
      chartForm: { type: "string", enum: ["cards", "column", "pie"] },
      rationale: { type: "string", maxLength: 220 },
    },
    required: ["slideId", "chartForm"],
    additionalProperties: false,
  },
  execute: async ({ slideId, chartForm }) => { /* mutates the live deck */ },
}, { signal: controller.signal });   // aborting unregisters when the note closes
```

Every registration — permanent ones included — is owned by an `AbortController` and
aborted before re-registering. Swallowing a duplicate-name error instead would leave
the *first* registration live and drop the new one silently under React StrictMode
and HMR.

Errors carry what the agent needs to succeed next time, never a bare string:

```js
{ ok: false,
  error: { code: "NOT_FOUND", message: 'No slide "s99".', knownSlideIds: [...] },
  retrySafe: true }
```

### No API keys

The page supplies structure; the agent supplies intelligence. `attach_research` takes
a finding the agent already produced and pins it to the slide. Nothing here calls a
model, so the app is static, free to run, and open to anyone with the URL.

---

## Run it

```bash
npm install
npm run dev        # http://localhost:5180 — localhost is a secure context; file:// is not
npm run evals      # webmcp-evals smoke: no API key needed
npm run check:data # refuses to ship unsourced figures
```

`?blank=1` opens an unmarked deck. `?slide=6` deep-links a slide. `?replay=1` runs the
scripted pass on load.

**▶ watch a pass** in the toolbar runs the queue end to end without an agent attached,
by calling the same tool implementations in the order an agent calls them. It is
labelled as scripted in the UI because it is: the tool calls are real, the sentences
the agent "says" are not. The demo video shows the real thing.

## The deck

*From Screen to Cart* — a briefing on Korean content as a commerce engine. It renders
from the typed model at the size it was authored (1920×1080, scaled to fit), so every
measurement is the one its author chose. Figures and sources are carried over intact.

Three things the agent fixes on camera. Two were already in the authored deck:

| | |
|---|---|
| **s06** | a pie drawn over three export lines that are *not* parts of one whole, so the chart asserts a total that means nothing — introduced by this port so the re-forming tool has something to act on |
| **s08** | the HYBE panel reports 2024 while the DearU panel beside it reports Q4 2025 — already there |
| **s04 / s05 / s07** | three different source-line conventions — already there |

None of them is a bad slide. They are the kind of defect that survives a careful
authoring pass, which is exactly why catching them is worth a tool.

## License

MIT — see [LICENSE](LICENSE).
