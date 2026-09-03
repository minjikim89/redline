# Redline

**A slide deck you and your agent both have hands in — with one rule: the agent may correct a fact, but it may not rewrite an argument.**

Every AI deck tool can *generate*. None of them can *edit with you*. The moment you
fix a slide by hand, the model goes blind — it holds a copy of what it produced, not
what is on your screen — so "make the rest match" regenerates from stale memory and
destroys your work.

Redline closes that loop, and then draws a line inside it. Click any text and rewrite
it; the edit lands in the same typed model the agent's tools write to, so `read_slide`
returns what you just typed, and a tool that tries to write over an edit it has not
seen is refused. When something needs more than a retype, mark it the way you'd mark
paper: circle it, write beside it. The mark resolves to the elements underneath, the
agent edits the live deck, and writes back on the same pin. And when the agent
verifies a number that undercuts a headline, it flags the claim and stops — because
a number is a fact and a headline is a position, and only one of those is the
agent's to change.

> Live: **https://minjikim89.github.io/redline/** — open it in the ChatGPT desktop
> app's browser (GPT-5.6 Sol or Terra), or in Chrome 149+ with
> `chrome://flags/#enable-webmcp-testing`. The sample deck is already marked up;
> ask the agent to *open the sample deck and work the open notes*.

```
12 tools — 1 before a deck is open, 8 while one is, 3 that exist only while a note
           of that kind is open (registered and unregistered via AbortController).
OUT_OF_SCOPE   writes outside the slides the person marked are refused.
STALE_READ     writes over an unread human edit are refused, with the diff.
INVALID_INPUT  every call is validated in code — the browser does not check
               inputSchema (spec issue #92).
contradicts    a verified figure that undercuts a claim flags it; the claim is not rewritten.
■ stop sweep   a batch edit is stoppable from the page, and the agent still learns what landed.
Lighthouse Agentic Browsing 1.00 · 159 unit tests · CDP browser checks · evals smoke 7/7 · llms.txt.
Created during the submission period; full history from 2026-08-31.
```

---

## Why this needs WebMCP and not MCP

A regular MCP server runs outside the page. It cannot know which element you have in
front of you, and it cannot see the edit you just made by hand. Both facts are the
entire problem here.

- **"This one" finally resolves.** A mark carries `{slideId, elementId[]}`. The agent
  and the human are provably pointing at the same thing — no prose description, no
  guessing from pixels.
- **Manual edits stay visible — and protected.** `read_slide` returns live state and
  a revision. A write that arrives after you moved the slide on comes back
  `STALE_READ` with what changed in between. There is no stale copy to drift from,
  and no way to overwrite yours by accident.
- **The change is witnessed.** Tools mutate the deck the human is watching. You see
  the chart re-form; you don't get a file back and hope. A sweep that takes time has
  a stop button, and the agent is told what landed.

Chrome's own WebMCP demos are transactions — book a table, build a pizza, search
flights. The human states an intent and steps back. Review is not a transaction. It
is an iteration where the human keeps authority, and that only works when both
parties are looking at the same surface.

## What a person and an agent do together here

| | |
|---|---|
| **Human → agent** | Circle a region, write a note. Four kinds: `fix`, `research`, `visualize`, `explain`. The marks are the work order: by default the agent may only write to slides that carry one. |
| **Agent → human** | Reply on the same pin — what changed and why, or what it needs first. When a verified figure contradicts a claim, flag the claim; the author decides. |
| **Batch, interruptibly** | "Make the source lines consistent" sweeps the deck one slide at a time in front of you, and **■ stop sweep** ends it between slides. |

**See the toolset change.** Open the sample, then resolve the *visualize* note on
slide 6: the tool count in the rail drops from 11 to 10 and `set_chart_form` is gone.
Draw a new *visualize* note anywhere and it comes back. Before you open a deck at
all, the page exposes exactly one tool, `open_deck`. Marking up the deck authors the
agent's toolset.

---

## Implementation

### The deck is a typed model. There is no HTML escape hatch.

Slides are React components with declared prop schemas
([`src/deck/registry.ts`](src/deck/registry.ts)). That single declaration does three
jobs:

1. **It types the agent's tools.** Component props *are* the JSON Schema. The agent
   picks a chart form from an enum; the text-field enum is derived from the registry,
   so it cannot drift from what a slide can hold.
2. **It generates the person's properties panel.** Same schema, other side.
3. **It makes marks survive edits.** Notes anchor to `{slideId, elementId}`, never to
   coordinates. Fixing the first note reflows the slide — with pixel anchors every
   other note would then point at the wrong thing.

There is deliberately **no `update(slideId, props: object)` tool**. An over-general
writer wins every routing decision and collapses the rest of the surface back into
string editing. Chrome's guidance is explicit: *"Be careful not to create overlapping
tools."* Every writer here takes a named field or a typed array.

### Twelve tools. Which ones exist depends on what is on the page.

**Before a deck is open** — one tool:

| Tool | |
|---|---|
| `open_deck` | opens the sample or continues the saved session. Nothing else is registered, because there is nothing to review yet. |

**While a deck is open** — always:

| Tool | |
|---|---|
| `list_slides` | `readOnlyHint` — deck outline plus the current edit scope, inside the 1.5K output budget |
| `read_slide` | `readOnlyHint` + `untrustedContentHint` — live props, annotatable regions, and the slide's **revision** |
| `list_open_annotations` | `readOnlyHint` + `untrustedContentHint` — the queue, with anchors and threads |
| `set_slide_text` | one named field, `field` is an enum derived from the registry |
| `set_series` | typed `{label, value}[]`, addressed by the series names `read_slide` advertises |
| `edit_items` | structural editing — append, remove, replace or move one item in a slide's list, validated against that list's item schema |
| `reply_to_annotation` | agent writes back on the pin |
| `resolve_annotation` | close a note once the change is really in |

**Only while a note of that kind is open**, and unregistered via `AbortController`
when it closes:

| Tool | Appears when | Notable |
|---|---|---|
| `set_chart_form` | a `visualize` note is open | enum of forms, validated against the slide's own registry entry |
| `attach_research` | a `research` note is open | `untrustedContentHint`; requires `source` and `asOf`; can raise a `contradicts` flag |
| `unify_across_slides` | a `fix` note is open | long-running; stoppable from the page between slides |

Registration follows the store: every change to the page re-syncs the registered
set, and every registration is owned by an `AbortController` (the spec's only way to
unregister). Aborting before re-registering is what makes StrictMode and HMR safe —
swallowing a duplicate-name error would leave the *first* registration live.

### Input is validated in code, not left to the schema

Neither the spec nor Chrome promises that the browser checks a tool's arguments
against its `inputSchema` before calling `execute` (spec issue #92 is open; Chrome
152 hands the raw object through). Before this was in place, a call that dropped
`text` wrote `undefined` into the headline the person was looking at. Now every call
runs through [`validate.ts`](src/webmcp/validate.ts) first — required, type, enum,
lengths, ranges, item counts, unknown fields — and a bad call comes back with the
schema's own words:

```js
{ ok: false,
  error: { code: "INVALID_INPUT",
           message: "The call does not match set_slide_text's input schema.",
           problems: [{ path: "text", message: "is required" }],
           inputSchema: { … } },
  retrySafe: true }
```

### The agent cannot write over an edit it has not seen

Every slide carries a revision that ticks on any change, from either side — a tool
write, a retype by hand, an undo. `read_slide` records the revision the agent saw.
A point write that arrives after the person has moved the slide on is refused:

```js
{ ok: false,
  error: { code: "STALE_READ",
           message: '"s04" changed after you read it (rev 3 → 4). Read it again before writing.',
           readRev: 3, currentRev: 4,
           changedSince: [{ by: "human", fields: ["title"] }],
           hint: "Call read_slide, then retry against the current values." },
  retrySafe: true }
```

This is optimistic concurrency between a person and an agent on one document. The
agent's own writes advance its view, so it never trips over itself; a slide it never
read is simply unread, not stale. The sweep applies the same rule per slide and
skips anything that moved.

### The marks are the work order

A review session produced the failure this guards against: asked to fix two noted
slides, an agent also "improved" several nobody had marked. A scope switch on the
page (default: **noted slides only**) makes every point-write tool refuse a slide
that carries no open note:

```js
{ ok: false,
  error: { code: "OUT_OF_SCOPE",
           message: 'The person has scoped edits to the slides they marked…',
           notedSlideIds: ["s04", "s06", "s08"] },
  retrySafe: true }
```

`list_slides` states the scope up front (`editableSlides`), so a well-behaved agent
never even hits the refusal. `unify_across_slides` is exempt on purpose — it is the
watched batch, landing slide by slide in front of the person, with a stop button.

### A sweep the person can stop

`unify_across_slides` runs on a signal combined from two sources: the one the
agent's host passes to `execute`, and one the page owns. **■ stop sweep** appears in
the toolbar while a sweep runs; pressing it aborts between slides and the tool
returns what landed and what did not:

```js
{ ok: false,
  error: { code: "CANCELLED", message: "Stopped partway by the person watching.",
           applied: ["s04", "s05"], remaining: ["s07", "s08", "s10"], stoppedBy: "person" },
  retrySafe: false }
```

One honest limit, learned from the spec: when the *caller* aborts, the spec discards
the tool's own resolution, so that report cannot reach the agent — it lands on the
on-page trail instead. Only the page-side stop can report back. See
[docs/findings.md](docs/findings.md).

### When the answer breaks the argument

`attach_research` takes an optional `contradicts`. An agent that verifies a figure and
finds it undercuts something the slide still asserts raises the conflict — and stops
there. The claim is outlined on the artboard, the author sees what was found and why,
and decides.

Ask a chatbot for a company's latest results and it answers correctly and uselessly:
it has never seen slide 8, so it cannot know the figure it just gave you invalidates
that slide's headline. On this page it can, because the deck and the tools share one
address space. The tool will not rewrite the claim. **A number is a fact and an
argument is a position; the agent is allowed to correct the first and only allowed
to question the second.**

### Every call is visible

Tool traffic is invisible by nature, which makes it hard to trust. Each invocation —
including refused ones — is traced onto the page: name, arguments, outcome. A person
watching can see exactly what the agent did, in order.

### Measured, not argued

The claims above are testable, so they were tested. `scripts/guardrail-eval.mts`
hands a model the same tool contracts the page registers and dispatches its calls
to the same implementations, with the page's guards on and off, ten runs per arm.
The task asks the agent to rewrite the very headline the person retypes, so the
hand-typed words are replaced in both arms — that is the task. What the guard
changes is whether the agent wrote over them *without having read them*:

| arm | outcome | completion | page refusals |
|---|---|---|---|
| race · gpt-4.1 · guards ON | wrote over an unread hand edit 0/10 · hand edit seen before every write 10/10 | task completed 10/10 | stale refusals 20 |
| race · gpt-4.1 · guards OFF | wrote over an unread hand edit 10/10 · hand edit seen before every write 0/10 | task completed 10/10 | stale refusals 0 |
| race · gpt-5.4 · guards ON | wrote over an unread hand edit 0/9 · hand edit seen before every write 9/9 | task completed 9/9 | stale refusals 18 |
| race · gpt-5.4 · guards OFF | wrote over an unread hand edit 8/8 · hand edit seen before every write 0/8 | task completed 8/8 | stale refusals 0 |
| adversary (scripted, follows the injection) · guards ON | unmarked headlines rewritten 0/9 | — | refused writes 9 |
| adversary (scripted, follows the injection) · guards OFF | unmarked headlines rewritten 8/9 (the ninth has no headline field) | — | refused writes 0 |

Injection (model arm, 20 runs): the model followed the injected instruction in 0/10 runs with guards on and 0/10 with guards off — it did not distinguish the arms, which is why the deterministic adversary arm exists. gpt-5.4: 3 of 20 runs lost to network errors and excluded.

Read it as three sentences. With the guards off, a model doing exactly what it
was asked wrote over the person's edit unseen every time — it had no way to know
the person had typed. With them on, that write was refused every time, the agent
re-read, and it still finished the task every time; the refusal costs one
re-read. This is not a model-capability gap: what the person typed has no path
to the agent unless the page provides one, and gpt-4.1 and gpt-5.4 behave the
same. A scripted agent that follows an injected "rewrite every headline"
instruction rewrote 8 of 9 unmarked slides with the guards off and none with them
on. The app itself calls no model; only the harness does. Raw results, including
a `handEditSurvived` field that is false in both arms, are in `evals/results/`.

### Prompt injection, and what this page does about it

Our defence does not rely on the model not being fooled. An agent that is fully
convinced by injected text still has its writes refused by the page: scope,
revisions and cancellation are enforced in the tool implementations, not in a
prompt. That is the mitigation §6.4 of the spec does not yet list; see
[docs/findings.md](docs/findings.md#0-a-fourth-mitigation-for-64-page-enforced-write-boundaries).

Every tool that returns human-written or externally-sourced text (`list_slides`,
`read_slide`, `list_open_annotations`, `attach_research`) carries
`untrustedContentHint`, so an agent's host can spotlight or sanitise it. Nothing on
the page instructs the agent; tool descriptions describe tools. No tool can leave
the deck — there is no navigation, no network call, no purchase — and the only
cross-cutting write is scoped by the person and stoppable by the person. Read-only
tools are marked `readOnlyHint` so the host can skip confirmation where nothing
changes.

### No API keys

The page supplies structure; the agent supplies intelligence. `attach_research` takes
a finding the agent already produced and pins it to the slide. Nothing here calls a
model, so the app is static, free to run, and open to anyone with the URL.

### Measured against the reference implementations

Compared with Chrome's `pizza-maker`, `react-flightsearch` and `french-bistro` demos
and Vercel's storefront (`vercel/shop` PR #498), as read on 2026-09-03:

| | reference implementations | here |
|---|---|---|
| registration that follows page state | register once; Vercel and Chrome's `webmcp-maze` clean up on unmount | 12 tools in three tiers, re-synced on every page change |
| `execute` honouring an `AbortSignal` | not used for long-running work | `unify_across_slides`, stoppable from the page and by the caller |
| `untrustedContentHint` | Vercel only (none of Chrome's 15 demos) | on everything returning human text or fetched data |
| input validated in code | Vercel re-validates in Server Actions | every call, against the tool's own schema, before `execute` |
| a person-owned edit scope | none | `OUT_OF_SCOPE`, stated up front by `list_slides` |
| optimistic concurrency with the person | none | `STALE_READ` with what changed |
| structured errors carrying recovery | Vercel only | every failure, with the valid ids, values or schema |

---

## Bringing a deck in — and back

Redline does not generate slides. The entry screen takes an exported HTML deck and
reads it into the typed model — `src/deck/importHtml.ts`.

A Redline export carries the model itself in a JSON island, so the round trip is
**lossless**: every slide type, figure and source is restored exactly, and the
report says so ("restored exactly, nothing re-guessed from markup"). That is the
architectural claim made concrete: **the model is the contract.** Any tool that
emits slides can hand work over, and the agent picks it up with the same tools.
[docs/pattern.md](docs/pattern.md) describes the pattern for any typed document.

Foreign HTML goes through a heuristic reader that is conservative on purpose: it
claims a slide type only when the structure is unambiguous and otherwise leaves the
text as prose, because a confident wrong guess is worse than a plain slide. A file
with nothing readable in it is refused with a reason.

`?import=<url>` runs the same parser on a hosted file. A sample export ships at
`/exported-deck-sample.html`.

## The session survives you

The deck, the queue and the scope persist in `localStorage`. Close the tab
mid-review and the entry screen offers to continue where you left off; an agent's
edit no longer evaporates on refresh. `?fresh=1` ignores the saved session,
`?blank=1` opens an unmarked deck.

## The deck

*From Screen to Cart* — a briefing on Korean content as a commerce engine. It renders
from the typed model at the size it was authored (1920×1080, scaled to fit), so every
measurement is the one its author chose. Figures and sources are carried over intact.

Three things the agent fixes on camera:

| | |
|---|---|
| **s06** | a pie drawn over three export lines that are *not* parts of one whole, so the chart asserts a total that means nothing |
| **s08** | the HYBE panel reports 2024 while the DearU panel beside it reports Q4 2025 — and the current filing reverses the headline's premise |
| **s04 / s05 / s07** | three different source-line conventions |

None of them is a bad slide. They are the kind of defect that survives a careful
authoring pass, which is exactly why catching them is worth a tool.

---

## Run it

Requires **Node 22.22+** (`.nvmrc` is set; the test runner's jsdom needs it).

```bash
npm install
npm run dev        # http://localhost:5180 — localhost is a secure context; file:// is not
npm test           # 159 unit tests: importer, store, revisions, validation, tools, round trip
npm run evals      # webmcp-evals smoke against the dev server (uses installed Google Chrome; no API key)
npm run check:data # refuses to ship unsourced figures
```

Lighthouse 13.4.1's *Agentic Browsing* category scores the live URL 1.00 (registered
tools, schema validity, agent accessibility tree, CLS 0). An `llms.txt` is served at
`/redline/llms.txt`, written for an agent meeting the tools for the first time; the
audit looks at the origin root, which a GitHub Pages project site does not own, so it
reports that check as not applicable.

Browser checks (`e2e/scenarios.mjs`) drive a real Chrome over CDP — see the file
header for the two commands to start it.

`?blank=1` opens an unmarked deck. `?slide=6` deep-links a slide. `?replay=1` runs the
scripted pass on load. **▶ watch a pass** in the toolbar runs the queue end to end
without an agent attached. Where the browser exposes WebMCP it is an in-page agent
in the spec's sense — it discovers the tools with `getTools()` and calls them with
`executeTool()`, so every call takes the browser's own dispatch path — and the page
is, in that moment, its own agent client. It is labelled as scripted in the UI
because it is: the tool calls are real, the sentences the agent "says" are not.

## License

MIT — see [LICENSE](LICENSE).
