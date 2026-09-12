# Redline — STATUS

**Last updated**: 2026-09-12
**Standing**: not submitted anywhere; kept as a reference implementation and as the
evidence behind the spec feedback in `docs/findings.md`.

| | |
|---|---|
| Live | https://minjikim89.github.io/redline/ |
| Repo | https://github.com/minjikim89/redline (public, MIT) |
| Deploy | GitHub Actions → Pages, on every push to `main` |
| Tests | `npm test` — 159 unit (Node 22.22+) · `node e2e/scenarios.mjs` — CDP browser checks · `npm run evals` — WebMCP evals smoke |

## What it is

A slide-deck editor where a person and an agent both have hands in the same typed
model. You circle something and write in the margin; the mark resolves to
`{slideId, elementId}` and an agent reads that queue with WebMCP tools, edits the
live deck, and replies on the same pin. The agent may correct a fact; it may not
rewrite an argument.

## 2026-09-03 pass (from three independent reviews)

1. **Input validation in code** — the browser does not check `inputSchema`; a
   dropped `text` used to erase a headline. Every call is validated first.
2. **Revisions / `STALE_READ`** — the agent cannot write over a hand edit it has
   not read. Optimistic concurrency between person and agent.
3. **Page-side sweep stop** — "■ stop sweep" in the toolbar; the tool reports
   `applied/remaining/stoppedBy` to the agent. Caller abort and person stop are
   told apart; internal errors are no longer reported as cancellations.
4. **Tools follow the page** — before a deck is open only `open_deck` exists; the
   review set appears when a deck opens; conditional tools follow the queue.
5. `attach_research` never half-applies; `read_slide` trims to the output budget;
   text-field enum derived from the registry (adds `body`, `eyebrow`, `footnote`…).
6. `list_slides` reports `unavailableTools` with reason and remedy (spec #262);
   ▶ watch a pass runs through `getTools()`/`executeTool()` (in-page agent);
   entry screen and unsupported panel name the models that have WebMCP on;
   `public/llms.txt` written as an agent manual (Lighthouse Agentic Browsing 1.00).
7. Node 22.22+ declared (`engines`, `.nvmrc`); `webmcp-evals` installed;
   README rewritten with the contradicts framing, the corrected comparison table,
   and a prompt-injection section; `docs/findings.md` and `docs/pattern.md` added.

## Smoke check, by hand

- ChatGPT desktop browser: on the entry screen the address bar shows **1** site
  tool; after opening the sample, **11**; resolve the visualize note → **10**.
- Ask the agent to make the source lines consistent; press **■ stop sweep** while it
  runs; the agent should report what landed.
- Retype a headline by hand after the agent has read the slide, then ask it to
  edit that slide: it must re-read first (`STALE_READ`).

## Spec feedback filed upstream (2026-09-06), and what came back (through 2026-09-12)

All of `docs/findings.md` is on the record in `webmachinelearning/webmcp`.

| | |
|---|---|
| [#298](https://github.com/webmachinelearning/webmcp/issues/298) | §6.4: page-enforced write boundaries as a mitigation for agent over-reach (carries the guardrail eval table) |
| [#299](https://github.com/webmachinelearning/webmcp/issues/299) | Let a tool deliver a final result on caller abort |
| [#300](https://github.com/webmachinelearning/webmcp/issues/300) | Clarify that unregistration must not fail an in-flight execution |
| [#282 comment](https://github.com/webmachinelearning/webmcp/issues/282#issuecomment-5556231683) | the two-layer refusal envelope this page returns |
| [#262 comment](https://github.com/webmachinelearning/webmcp/issues/262#issuecomment-5556231767) | `unavailableTools`: naming the tools that are absent, and why |
| [#278 comment](https://github.com/webmachinelearning/webmcp/issues/278#issuecomment-5556231850) | Chrome 152 accepts only a JSON string, against a spec that says object |

#298 cites [#288](https://github.com/webmachinelearning/webmcp/issues/288) as the limit
of what it proposes: guards in a tool implementation bind the tool path only, so a user
agent that also drives the page can write around them. #96 (agent identity and granted
scope) is complementary, not the same mechanism.

### Responses, 2026-09-07 to 09-12

| Thread | What came back |
|---|---|
| #278 | `beaufortfrancois`, who owns the Chromium CLs, replied to the tracking we supplied: *"I plan to reland this CL this week."* Both halves sit under crbug 489045948; the object-input CL (8250826) is still open, the parsed-schema CL (8248081) landed and was reverted the same day for an unrelated extension-packaging failure. |
| #282 → **#308** | `AshrafAhmed9` (Consequence, WebMCP Challenge) hit the same problem independently, then filed **[#308](https://github.com/webmachinelearning/webmcp/issues/308)**, a unified proposal citing Consequence and Redline as the two motivating cases. It uses the framing we offered: one boundary problem wearing three costumes, not three granularity asks. He also held off a planned `throw` rework after we pointed out it would lose the reason at the boundary today. |
| #262 | `zekariasasaminew` adopting the `unavailableTools` pattern at application level, and proposing a two-class split (recoverable prerequisite vs policy boundary) plus a platform-level `toolchange` detail. |
| #300 | `mysticalseeker24` reproduced it independently on a booking app, with a worse case than ours (`confirm_booking` — an irreversible commit reported as a failure, where the obvious recovery is to repeat it). They compared our narrowed workaround against theirs and **switched to ours**. |
| #298 | Same person, first substantive support. Contributed a fourth enforcement shape: **absence from the registered set**, with a properties table, plus the accessibility argument for why the intuitive fix to the #288 limit is closed off. |
| #299 | Same person, and the most useful response received: their probe shows Chrome 152 invokes `execute` with **one argument and no signal**, so a tool cannot observe a caller abort at all. The write loop therefore runs to completion while the caller receives `AbortError`. |

### Issue bodies edited in response

- **#298** — `consequentialHint` added to the §6.4 enumeration (it landed in #217 on 09-03 and was missed at filing; [correction comment](https://github.com/webmachinelearning/webmcp/issues/298#issuecomment-5560007088)); **(d) enforcement by absence** added with credit; **(c)** restated from a reporting convenience to "without it there is no cancellation of the write at all"; the #288 limit now names why CAPTCHA-style hardening is closed off on accessibility grounds.
- **#299** — split into two asks, with "a tool must be able to observe the abort" as the precondition; the `AbortSignal.any()` description corrected, since that branch is conditional and does not fire on Chrome 152.
- **#300** — workaround narrowed from "defer the whole re-sync" to "skip only the unregistration of a tool that is currently executing", which is what the code actually does.

Two of those are the same pattern: on #299 and #300 the code was right and the write-up was looser than the code, and an outside implementer found both by reading the issue text against their own build. The #298 slip was a different kind — a spec enumeration that had gone stale three days before filing, found by re-reading `index.bs`.

## Open, and deliberately not done yet

- **Archive this repo** once the issue discussion settles. Held open on purpose: the
  three issues argue from this implementation, and an archived banner above that
  argument reads as abandoned. Nothing here needs maintenance in the meantime.
- **Join the Web Machine Learning CG** if #298 moves toward spec text. `CONTRIBUTING.md`
  gates *substantive contributions (pull request)* on CG membership under the W3C CLA;
  issues and comments are not gated, spec text would be. Status as of 09-12: #298 has one
  independent implementer supporting it and contributing to it, and no editor response yet.
  Note that §6 is explicitly non-normative, so a §6.4 entry is a recommendation rather than
  a conformance requirement — which is fatal for #288's ask (it needs a UA to honour
  something) but not for #298's (the page enforces it in its own code).

## Deferred, with reasons

- **Keyboard path for drawing a note** — the anchor model would support it; not
  built in time.
- **Pan/scroll when zoomed past fit** — content outside the viewport is unreachable.
- **Tone round trip on import** — export writes inline background hex; reading it
  back would couple the model to the format.
- **barsPair / flow / figures / panels / timeline collapse to `cards` on foreign
  re-import** — there is no prose that means "bar chart". Specified behaviour,
  pinned by the round-trip test.
