# Redline

**Annotate a deck. Your agent works the queue.**

Every AI deck tool can *generate*. None of them can *edit with you*. The moment you
fix a slide by hand, the model goes blind: it can't see what you changed, so asking it
to "make the rest match" regenerates from its own stale memory and destroys your work.

Redline fixes the loop. You pin a note onto the exact element you're looking at. The
agent reads that queue, sees the live deck state, makes the change, and writes back on
the same pin. Nothing is described in prose; nothing is guessed from pixels.

> **Status:** built for the WebMCP Challenge. Requires Chrome 149+ with
> `chrome://flags/#enable-webmcp-testing`, or the ChatGPT desktop app's built-in browser.

---

## Why this is a WebMCP problem, not an MCP problem

A regular MCP server runs outside the page. It cannot know which element you have in
front of you, and it cannot see the edit you just made by hand. Both facts are the
whole problem here.

WebMCP tools run *inside the tab you are looking at*, so:

- **"This one" finally resolves.** A note carries `{slideId, elementId}`. The agent and
  the human are provably pointing at the same thing.
- **Manual edits stay visible.** `read_slide` returns live state, including whatever you
  just typed. There is no stale copy to drift from.
- **The change is witnessed.** Tools mutate the deck the human is watching. You see the
  chart re-form; you don't get a file back and hope.

## What people and agents can do together that was hard before

You can leave a comment for a human colleague on any design tool. You have never been
able to leave one **for an agent**, because an agent had no way to know where "here" is.

Redline makes the review loop bidirectional:

| | |
|---|---|
| **Human → agent** | Pin a note to a region. Four kinds: `fix`, `research`, `visualize`, `explain`. |
| **Agent → human** | Reply on the same pin. "Changed this, here's why", or "I need X first". |
| **Batch** | "Apply slide 7's treatment to the rest" acts on the model, not on strings. |

## Implementation

### The deck is a typed model, never HTML

Slides are React components with declared prop schemas
([`src/deck/registry.ts`](src/deck/registry.ts)). That choice does two jobs:

1. **It's what makes tools typed.** Component props *are* the JSON Schema. An agent picks
   a chart form from an enum; it cannot hand back malformed markup.
2. **It's what makes annotations survive edits.** Notes anchor to `{slideId, elementId}`,
   never to coordinates. Fixing note #1 reflows the layout — with pixel anchors, notes
   #2 through #8 would then point at the wrong things.

There is deliberately **no `edit_html` escape hatch**. An over-general tool would win
every routing decision and collapse the typed surface back into string editing.

### Tools

Always registered:

| Tool | |
|---|---|
| `list_slides` | `readOnlyHint` — deck outline |
| `read_slide` | `readOnlyHint` — live props + the schema of what may be set |
| `list_open_annotations` | `readOnlyHint` — the work queue with anchors |
| `update_slide_props` | typed patch; rejects keys outside the slide's schema |
| `reply_to_annotation` | agent writes back on the pin |
| `resolve_annotation` | close a note once the change is really in |

**Registered dynamically** ([`syncConditionalTools`](src/webmcp/tools.ts)) — these exist
only while a matching note is open, so *pinning a note authors the agent's toolset in
real time*:

| Tool | Appears when |
|---|---|
| `set_chart_form` | a `visualize` note is open |
| `attach_research` | a `research` note is open |

```js
document.modelContext.registerTool({
  name: "set_chart_form",
  description: "Change how a slide draws its data. A pie is only readable for 2-4 parts of a whole.",
  inputSchema: {
    type: "object",
    properties: {
      slideId:   { type: "string" },
      chartForm: { type: "string", enum: ["pie", "bar", "column"] },
      rationale: { type: "string" },
    },
    required: ["slideId", "chartForm"],
    additionalProperties: false,
  },
  execute: async ({ slideId, chartForm }) => { /* mutates the live deck */ },
}, { signal: controller.signal });   // aborting unregisters when the note closes
```

### No API keys

The page supplies structure; the agent supplies intelligence. `attach_research` takes a
finding the agent already produced and pins it to the slide. Nothing here calls a model,
so the app is static, free to run, and open to anyone with the URL.

## Run it

```bash
npm install
npm run dev     # http://localhost:5180  (localhost is a secure context — file:// is not)
```

Enable `chrome://flags/#enable-webmcp-testing` and relaunch, or open the URL in the
ChatGPT desktop app's browser. The left rail reports how many tools registered.

## Demo deck

`src/deck/sampleDeck.ts` ships *From Screen to Cart*, a brief on Korean content as a
commerce engine. **All figures in it are placeholders** pending sourced research.

It carries three flaws on purpose, because a review tool needs something to review:

1. a nine-category pie chart, which no one can read
2. a stale figure with no source
3. three chart slides with inconsistent units and source lines

## License

MIT — see [LICENSE](LICENSE).
