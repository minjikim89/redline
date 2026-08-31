# Devpost submission — draft

> Working answers for the four required questions. Everything here is checkable
> against the repo; nothing claims a capability that isn't running.

---

## Why this use case is a strong fit for WebMCP

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
- **Manual edits stay visible.** `read_slide` returns live state, including the
  sentence you typed a second ago.
- **The change is witnessed.** Tools mutate the deck in front of you. You watch
  the chart re-form; you do not get a file back and hope.

Review is also the *right shape* for this API. Chrome's own WebMCP demos are
transactions — book a table, build a pizza, search flights — where the human
states an intent and steps back. Review is an iteration in which the human keeps
authority. That only works when both parties are looking at the same surface.

## How it creates a better user experience

You mark up a deck the way you mark up paper. Circle something; write in the
margin. There is no syntax and no mode to learn: a press that lands on text puts
the caret in that text, a press on open space starts a mark.

The notes are not a chat message. They are state in the document — a queue with
four kinds (`fix`, `research`, `visualize`, `explain`) that survives reload, that
the next person sees, and that the agent reads with a tool and writes back onto.
When it replies, the reply is pinned where the question was, not buried in a
transcript somewhere else.

Every tool call is traced onto the page — name, arguments, outcome — so what the
agent did is legible rather than something you take on faith. And nothing here
calls a model: the page supplies structure, the agent supplies intelligence. No
keys, no cost, no setup. Open the URL.

## What people and agents can do together that was difficult or impossible before

You have always been able to leave a comment on a design for a human colleague.
You have never been able to leave one **for an agent**, because an agent had no
way to know where "here" is.

The clearest case showed up while testing, and we did not stage it. A note on
slide 8 said the HYBE figures were a year behind. GPT-5.6 read the queue, opened
the actual DART filing, and came back with H1 2026: ₩285.3B revenue and ₩13.5B
operating *profit*. The 2024 operating loss the slide rested on had reversed —
which means the slide's own headline, *"Subscription Pays, Commerce Doesn't"*, no
longer followed from its figures.

So `attach_research` takes an optional `contradicts`. The agent wrote the sourced
figure, flagged the claim it undercut, and stopped. The claim is outlined on the
artboard with what was found and why; the author decides.

Ask a chatbot for a company's latest results and it answers correctly and
uselessly — it has never seen your slide 8, so it cannot know the number it just
gave you invalidates that slide's argument. On this page it can, because the deck
and the tools share one address space.

The tool deliberately will not rewrite the claim. A number is a fact and an
argument is a position: the agent may correct the first and may only question the
second.

## How WebMCP was implemented

**The deck is a typed model; there is no HTML escape hatch.** Slides are React
components with declared prop schemas (`src/deck/registry.ts`). That single
declaration does three jobs: it types the agent's tools, it generates the person's
properties panel, and it is what lets a mark survive the reflow the agent's own
fix causes — notes anchor to `{slideId, elementId}`, never to coordinates.

There is deliberately no `update(slideId, props: object)` tool. An over-general
writer wins every routing decision and collapses the surface back into string
editing. Every writer takes a named field, an enum, or a typed array.

**Ten tools. Three of them only exist while you need them.**

Always registered: `list_slides`, `read_slide`, `list_open_annotations` (all
`readOnlyHint`), `set_slide_text`, `set_series`, `reply_to_annotation`,
`resolve_annotation`.

Registered only while a note of that kind is open, and unregistered via
`AbortController` when it closes — so *marking up the deck authors the agent's
toolset in real time*:

| Tool | Appears when |
|---|---|
| `set_chart_form` | a `visualize` note is open |
| `attach_research` | a `research` note is open |
| `unify_across_slides` | a `fix` note is open |

Spec surface used, and how it compares to the official reference implementations
(pizza-maker, react-flightsearch, french-bistro, Vercel's storefront):

| | reference implementations | here |
|---|---|---|
| dynamic registration / unregistration | none of them | 3 tools, driven by the queue |
| `execute` receiving an `AbortSignal` | none of them | `unify_across_slides`, stoppable mid-sweep |
| `untrustedContentHint` | Vercel only | on everything returning human text or fetched data |
| structured errors carrying recovery | Vercel only | every failure, with the valid ids or values |
| output budget | Vercel only | `list_slides` held under the documented 1.5K |

Registration happens before first paint, and every registration — permanent ones
included — is owned by an `AbortController` and aborted before re-registering.
Swallowing a duplicate-name error instead leaves the *first* registration live and
drops the new one silently under React StrictMode and HMR.

Errors never come back as a bare string:

```js
{ ok: false,
  error: { code: "NOT_FOUND", message: 'No slide "s99".', knownSlideIds: [...] },
  retrySafe: true }
```

**Import and export.** The entry screen reads an exported HTML deck into the model
and the toolbar writes one back out. The round trip is covered by tests, because
it is the only real proof of the claim the architecture rests on: the model is the
contract, so any tool that emits slides can hand work over and the agent picks it
up with the same tools.

**Tests.** `npm test` runs 78: the importer and its edge cases, the store's
history and queue, the tool layer (including cancellation, error shape, and a
regression guard that keeps the chart-form enum from drifting from what the
renderer can actually draw), and the export→import round trip. Two of those tests
exist because writing them found real defects: a tool that could never succeed
because it addressed a prop no slide type has, and a headline figure being eaten
as a label because a bare number is technically uppercase.

---

## Still to decide

- **The name.** "Redline" is a working title. Devpost's own guidance is that the
  name is the first thing judges see and should not be left to a model.
- **Demo video.** The research beat takes ~2 minutes live because the agent reads
  a real filing. Suggested cut: run `visualize` and `fix` live (~30s), and show
  the research result as state the deck already carries.
