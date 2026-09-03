# Devpost submission — the four required answers

> Everything here is checkable against the repo; nothing claims a capability that
> isn't running at https://minjikim89.github.io/redline/.

**Tagline:** A person and an agent edit one live deck. Stale writes are refused
with a diff; the agent may correct a fact but not rewrite an argument.

---

## Why this use case is a strong fit for WebMCP

The brief asks for a web where humans and agents interact, collaborate, and
create together. When a person and an agent work on the same live document, the
hard part isn't collaboration — it's collision. Redline is a deck review surface
where both have hands in one typed model. A hand-drawn mark resolves to
`{slideId, elementId}`, so "this one" finally has a referent. Every slide carries
a revision, so an agent that writes over an edit it hasn't read is refused with a
diff of what the person changed (`STALE_READ`). Writes outside the slides the
person marked are refused (`OUT_OF_SCOPE`). And when the agent verifies a figure
that undercuts the slide's headline, it flags the claim and stops — a number is a
fact and a headline is a position, and only one of those is the agent's to change.

Deck tools have solved generation. What they have not solved is the loop after
it — and that loop breaks for a structural reason, not a quality one.

The moment you fix a slide by hand, the model goes blind. It holds a copy of what
it produced, not what is on your screen. Ask it to "make the rest match" and it
regenerates from that stale copy and overwrites the work you just did. This is not
a prompt problem. A regular MCP server runs outside the page: it cannot see the
edit you made by hand, and it cannot know which element you are looking at. Both
facts are the whole problem.

WebMCP removes both, because the tools run inside the tab you are both looking at:

- **"This one" resolves.** A hand-drawn mark carries `{slideId, elementId[]}`. No
  prose description, no guessing from pixels.
- **Manual edits stay visible — and protected.** `read_slide` returns live state and
  a revision. A write that arrives after you changed the slide is refused with
  `STALE_READ` and what changed in between. The agent cannot overwrite your hand.
- **The change is witnessed.** Tools mutate the deck in front of you. You watch the
  chart re-form; a sweep that takes time has a stop button, and the agent is told
  what landed.

Review is also the *right shape* for this API. Chrome's own WebMCP demos are
transactions — book a table, build a pizza, search flights — where the human states
an intent and steps back. Review is an iteration in which the human keeps
authority. That only works when both parties are looking at the same surface.

## How it creates a better user experience

You mark up a deck the way you mark up paper. Circle something; write in the
margin. There is no syntax and no mode to learn: a press that lands on text puts
the caret in that text, a press on open space starts a mark.

The notes are not a chat message. They are state in the document — a queue with
four kinds (`fix`, `research`, `visualize`, `explain`) that survives reload, that
the next person sees, and that the agent reads with a tool and writes back onto.
When it replies, the reply is pinned where the question was, not buried in a
transcript.

The marks are also the agent's permission. By default it may only write to slides
that carry an open note; a sweep across the deck lands one slide at a time in front
of you with a stop button. Every tool call — including refused ones — is traced onto
the page, so what the agent did is legible rather than taken on faith. And nothing
here calls a model: the page supplies structure, the agent supplies intelligence.
No keys, no cost, no setup. Open the URL.

## What people and agents can do together that was difficult or impossible before

You have always been able to leave a comment on a design for a human colleague.
You have never been able to leave one **for an agent**, because an agent had no
way to know where "here" is — or to know that you had changed "here" since it
last looked.

The clearest case showed up while testing, and we did not stage it. A note on
slide 8 said the HYBE figures were a year behind. GPT-5.6 read the queue, opened
the actual DART filing, and came back with H1 2026: ₩285.3B revenue and ₩13.5B
operating *profit*. The 2024 operating loss the slide rested on had reversed —
which means the slide's own headline, *"Subscription Pays, Commerce Doesn't"*, no
longer followed from its figures.

So `attach_research` takes an optional `contradicts`. The agent wrote the sourced
figure, flagged the claim it undercut, and stopped. The claim is outlined on the
artboard with what was found and why; the author decides. **A number is a fact and
an argument is a position: the agent may correct the first and may only question
the second.** That boundary is drawn at the API level, not in a prompt. As far as we
can tell, no collaboration tool draws it.

The other new thing is quieter: two parties editing one document without either
overwriting the other. Every slide carries a revision; the agent's reads are
recorded; a stale write is refused with a diff. That is optimistic concurrency
between a person and an agent, on the same surface, in the browser.

We measured it rather than asserting it. A harness hands a model the same tool
contracts the page registers, with the page's guards on and off, ten runs per arm:

| arm | outcome | completion | page refusals |
|---|---|---|---|
| race · guards ON | hand edit destroyed 0/10 | task completed 10/10 | stale refusals 20 |
| race · guards OFF | hand edit destroyed 10/10 | task completed 10/10 | stale refusals 0 |
| injection · guards ON | agent followed the injection 0/10 · landed 0/10 | task completed 10/10 | refused writes 0 |
| injection · guards OFF | agent followed the injection 0/10 · landed 0/10 | task completed 10/10 | refused writes 0 |
| adversary (scripted, follows the injection) · guards ON | unmarked headlines rewritten 0/9 | — | refused writes 9 |
| adversary (scripted, follows the injection) · guards OFF | unmarked headlines rewritten 8/9 (the ninth has no headline field) | — | refused writes 0 |

With the guards off, a model doing exactly what it was asked overwrites the
person's hand edit every time; with them on, never, and it still finishes every
time. Our defence does not rely on the model not being fooled: a scripted agent
that follows the injection by construction still cannot write outside the slides
the person marked. Spec §6.4 lists no mitigation for this direction; we have
drafted one (`docs/findings.md`).

## How WebMCP was implemented

**The deck is a typed model; there is no HTML escape hatch.** Slides are React
components with declared prop schemas (`src/deck/registry.ts`). That single
declaration types the agent's tools, generates the person's properties panel, and
lets a mark survive the reflow the agent's own fix causes — notes anchor to
`{slideId, elementId}`, never to coordinates. There is deliberately no
`update(slideId, props)` tool; every writer takes a named field, an enum derived
from the registry, or a typed array.

**Twelve tools in three tiers, and the page decides which exist.** Before a deck
is open: one tool, `open_deck`. While a deck is open: `list_slides`, `read_slide`,
`list_open_annotations` (all `readOnlyHint`, the text ones `untrustedContentHint`),
`set_slide_text`, `set_series`, `edit_items`, `reply_to_annotation`,
`resolve_annotation`. Only while a note of the matching kind is open, and
unregistered via `AbortController` when it closes: `set_chart_form` (visualize),
`attach_research` (research), `unify_across_slides` (fix). Registration re-syncs on
every page change; the rail shows the live count, and `toolchange` keeps it honest.

**Input is validated in code.** The browser does not check arguments against
`inputSchema` (spec issue #92; Chrome 152 passes them through). Every call runs
through a small validator first — required, type, enum, lengths, ranges, unknown
fields — and comes back `INVALID_INPUT` with the schema's own words if it fails.

**Revisions.** Every slide's revision ticks on any change from either side,
including undo. `read_slide` records what the agent saw; point writers refuse
stale writes with `STALE_READ`, `changedSince: [{by, fields}]`, and a hint. The
sweep skips stale slides rather than overwriting them.

**A sweep the person can stop.** `unify_across_slides` runs on
`AbortSignal.any([callerSignal, pageSignal])`. **■ stop sweep** in the toolbar aborts
the page signal between slides, and the tool returns `CANCELLED` with `applied`,
`remaining` and `stoppedBy`. We learned the hard way that the caller's abort
cannot carry this back (the spec discards the tool's resolution), so the page-owned
signal is the only path that can — see `docs/findings.md`, which also carries a
drafted spec issue.

**Missing tools explain themselves.** `list_slides` reports `unavailableTools` —
which conditional tools are not registered right now, why, and what the person can
do to bring them back (spec issue #262). An agent stops hunting for
`set_chart_form` and asks for a visualize note instead.

**The page is its own agent client.** ▶ watch a pass discovers the tools with
`getTools()` and calls them with `executeTool()` — the spec's in-page-agent API —
so the scripted pass and a connected agent share one dispatch path.

**Scope, errors, budget.** A scope switch (default: noted slides only) makes point
writes outside the marked slides come back `OUT_OF_SCOPE`, stated up front by
`list_slides`. Every error is `{ok:false, error:{code, message, …recovery},
retrySafe}`. Read tools fit their lists to Chrome's 1.5K output budget.

**Tests.** `npm test` runs 159: importer edge cases, the store's history and queue,
revisions, validation, every tool including cancellation from both sides, and the
export→import round trip. `e2e/scenarios.mjs` drives real Chrome over CDP. `npm run
evals` runs the WebMCP evals smoke suite against the live tools.

Of the reference implementations we read on 2026-09-03 (Chrome's `pizza-maker`,
`react-flightsearch`, `french-bistro`, `webmcp-maze`; Vercel's storefront, `vercel/shop`
PR #498): they register once and clean up on unmount; Vercel re-validates on the
server and marks untrusted output; none we read validates in the page, keeps a
person-owned write scope, or tracks revisions. Created during the submission period;
the full history starts 2026-08-31.

---

## Testing instructions (Devpost form)

**Live URL:** https://minjikim89.github.io/redline/ — no login, no keys.

**ChatGPT desktop app:** open the URL in the built-in browser with **GPT-5.6 Sol or
Terra** (Luna has WebMCP disabled). The address bar's site-tools indicator shows
**1** tool on the entry screen. Ask the agent to *open the sample deck and work
the open notes*. After it opens the deck the indicator shows **11**.

**Chrome 149+:** enable `chrome://flags/#enable-webmcp-testing`, relaunch, open
the URL. The rail's "WebMCP live · N tools" panel mirrors what the browser sees;
DevTools → Application → WebMCP lists and runs the tools (input is a JSON string).

**Three things to try:**

1. Resolve the *visualize* note on slide 6 (or ask the agent to). The tool count
   drops from 11 to 10 and `set_chart_form` disappears; draw a new visualize note
   and it returns.
2. Ask the agent to make the source lines consistent, then press **■ stop sweep**
   in the toolbar while it runs. The agent reports what landed and what did not.
3. After the agent has read a slide, retype its headline by hand, then ask the
   agent to edit that slide. Its write is refused with `STALE_READ` until it reads
   again.

**Without an agent:** ▶ watch a pass runs the queue as an in-page agent — it
discovers the tools with `getTools()` and calls them with `executeTool()`, so every
call takes the browser's own dispatch path; it is labelled as scripted. `npm test` (Node 22.22+), `npm run
evals` and `e2e/scenarios.mjs` are described in the README.

**Measured:** Lighthouse 13.4.1 *Agentic Browsing* category 1.00 on the live URL
(registered tools 11, schema validity pass, agent accessibility tree pass, CLS 0).
An agent manual is served at `/redline/llms.txt`. Chrome's evals smoke suite: 7/7
steps, every call `ok:true`. Unit tests 156; CDP browser checks pass per phase.
