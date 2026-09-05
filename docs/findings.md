# What building Redline taught us about WebMCP

Notes from implementing against the spec (Draft CG Report, 2 September 2026),
Chrome 152 with `chrome://flags/#enable-webmcp-testing`, and the ChatGPT desktop
browser. Each item was hit in practice, not read about.

## 0. A fourth mitigation for §6.4: page-enforced write boundaries

§6.4 lists three mitigations — input-length limits, shared attack evals, and the
`untrustedContentHint` annotation. All three address one direction: a site
misleading an agent. §6.3.2's *Current Gaps* ends with "no verification mechanism …
no behavioral contracts … agents must assume good faith from site developers."
Nothing in §6 addresses the other direction: an agent, misled or simply
over-eager, exceeding the scope the person delegated on a site that trusted it.

Redline implements that missing mitigation, and it does not depend on the model
staying unpersuaded:

- **Scope is owned by the page, not the prompt.** A write outside the slides the
  person marked returns `OUT_OF_SCOPE`. The read tool states the scope up front.
- **Concurrency is owned by the page.** A write over a slide the person changed
  since the agent's last read returns `STALE_READ` with the diff. The agent cannot
  overwrite a hand it has not seen.
- **Long-running writes are stoppable by the page.** A sweep runs on a
  page-owned signal combined with the caller's; the person's stop is reported back
  as `CANCELLED` with what landed.
- **Facts and positions are separated at the API.** The research writer may
  correct a figure; it may only *flag* a claim (`contradicts`).

Our defence does not rely on the model not being fooled. An agent that is fully
convinced by injected text still has its writes refused by the page. Measured
(`scripts/guardrail-eval.mts`, gpt-4.1 and gpt-5.4, 10 runs per arm): with the
guards off the model wrote over a hand edit it had not read 10/10 times; with them
on, 0/10, at no cost to task completion. The hand-typed words are replaced in both
arms because the task is to rewrite that field; the guard's promise is "not
unseen", and the raw results say so explicitly. A scripted agent that follows an injected "rewrite every headline"
instruction rewrote 8 of 9 unmarked slides with the guards off and 0 of 9 with
them on. Tables in `evals/results/guardrails-gpt-4.1.md` and `evals/results/guardrails-gpt-5.4.md`. This is the
"behavioral contract" §6.3.2 says is missing — expressed as structured refusals
that a host can surface uniformly. Proposed as a §6.4 addition below (draft issue 3).

## 1. The browser does not validate tool input against `inputSchema`

Spec issue [#92](https://github.com/webmachinelearning/webmcp/issues/92) is open;
Chrome 152 passes whatever the agent sent straight to `execute`. A call that dropped
a required `text` field reached the tool body and wrote `undefined` into a headline.
Any tool that mutates state must validate in code. The spec's own guidance
("validate strictly in code, loosely in schema") is right, but easy to read as
advice rather than as a requirement. See `src/webmcp/validate.ts`.

## 2. A cancelled tool's result never reaches the caller

Per §3.1 *cancel a pending tool execution*, aborting the `signal` passed to
`executeTool()` removes the pending execution and rejects the caller's promise with
the abort reason; the tool's natural resolution is discarded. Verified in Chrome 152:
the caller gets `AbortError`, and the `{applied, remaining}` payload the tool built is
lost.

Consequence for long-running tools: **partial-progress reports are structurally
impossible on the caller's abort path.** The only way a person can stop a sweep *and*
have the agent learn what landed is a page-owned signal, combined with the caller's
via `AbortSignal.any()`, so the tool resolves normally with a `CANCELLED` payload.
That is what `unify_across_slides` does. It would help if the spec allowed a tool to
return a final value on abort (an `onabort` result, or delivering the settled value
if it arrives before the rejection is dispatched).

## 3. Registration time and page state can disagree

Registering before first paint (so an agent connecting during startup sees the full
set) means tools exist before the user has opened anything. In the first build, the
entry screen — no deck on screen — already advertised 11 review tools, and
`list_slides` returned a deck nobody had opened. An agent could edit a document the
person was not looking at, which defeats the shared-surface premise.

Fix: the registered set follows the page's own state. Before a deck is open, one
tool (`open_deck`) exists; opening a deck swaps in the review set; closing the last
note of a kind removes that kind's tool. The `toolchange` event is the right hook for
the page's own UI to reflect this.

## 4. Origin-keyed agent clusters are the default; GitHub Pages is fine

The spec rejects `registerTool()` unless the agent cluster is origin-keyed. Chrome
has defaulted to origin-keyed clusters since 115 unless a page sends
`Origin-Agent-Cluster: ?0` or sets `document.domain`. GitHub Pages cannot set
headers, and `window.originAgentCluster === true` there in Chrome 152; registration
works. Hosts that *can* set headers should still send `Origin-Agent-Cluster: ?1`
explicitly, as the Netlify starter does.

## 5. `executeTool()` input: object in the spec, string in Chrome 152

The spec changed `executeTool()` to take an object (#246, 2026-08-17). Chrome 152
still requires a JSON string; passing an object fails with
`UnknownError: Failed to parse input arguments`. Anyone testing from DevTools or a
script should `JSON.stringify` the input until Chrome catches up.

## 6. Optimistic concurrency between a person and an agent is not in the model

WebMCP gives an agent live access to a page, but nothing in the API expresses "the
person changed this since you read it". With both parties editing one document that
is the common case. Redline adds a revision per slide, records what the agent last
read, and refuses stale writes with a diff (`STALE_READ`). A `readOnlyHint`-style
annotation for "returns a revision" and a standard error shape for stale writes
would let hosts surface this uniformly.

## 7. Chrome 152 and the description budget

Chrome's guidance caps tool descriptions at 500 characters and per-tool output at
1.5K. Nothing enforces this; the cost is that agents start ignoring long tools.
`list_slides` and `list_open_annotations` fit their lists to the budget and report
`omitted`; `read_slide` trims long lists and reports `trimmed`.

## 8. Unregistering a tool while it runs kills its execution (Chrome 152)

A tool whose own success changes page state can unregister itself: `open_deck`
flips the store, the store subscription re-syncs registrations, and the abort
lands while `execute` is still on the stack. In Chrome 152 the caller then gets
`UnknownError: The operation failed for an unknown transient reason` even though
the tool completed and its side effects are on screen. Minimal repro: a tool that
aborts its own registration signal inside `execute` fails; the same abort deferred
by one macrotask succeeds; aborting a *different* tool succeeds.

Chrome's docs say 153 preserves in-flight executions after unregistration; the
spec landed this in #248. Until that is everywhere, the page must not unregister a
running tool. Redline tracks executing tools, leaves them registered during a
re-sync, and re-syncs once they return.

## Draft issue 2 for webmachinelearning/webmcp

> **Title:** Clarify that unregistration must not fail an in-flight execution
>
> A tool whose side effect changes page state may cause the page to unregister
> that very tool (via the registration signal) before `execute` resolves. Chrome
> 152 then rejects the caller's `executeTool()` promise with `UnknownError`
> although the tool completed. #248 preserves in-flight executions; it would help
> to state explicitly, in the tool execute steps, that a tool removed from the
> tool map after its execute steps began still delivers its result, and to add a
> WPT case for self-unregistration.

## Draft issue 1 for webmachinelearning/webmcp

> **Title:** Let a tool deliver a final result on caller abort
>
> Per §3.1, when the caller aborts `executeTool()`, the pending execution is removed
> and the promise is rejected with the abort reason; the tool's own resolution is
> discarded. For long-running tools that apply changes incrementally (a batch edit
> landing item by item), the caller therefore cannot learn what was applied before
> the abort. In practice we had to add a page-owned signal and combine it with the
> caller's so the tool could resolve normally with a partial-progress payload.
>
> Proposal: allow `execute` to observe `signal.aborted`, finish promptly, and have
> that settled value delivered to the caller (e.g. reject with an `AbortError` whose
> `cause` carries the tool's result, or resolve if the tool settles within the same
> task). This keeps cancellation semantics while making partial progress reportable.

## Where this sits among the open spec discussions (read 2026-09-03)

| Issue | Asks | What this page already does |
|---|---|---|
| [#282](https://github.com/webmachinelearning/webmcp/issues/282) (opened 2026-09-02) | a structured way to signal a tool's *refusal*, distinct from success and from a schema error | two layers: `validate.ts` returns `INVALID_INPUT` with `problems` for schema failures; the tool body returns `OUT_OF_SCOPE` / `STALE_READ` / `NOT_APPLICABLE` for deliberate refusals, each with recovery fields and `retrySafe` |
| [#262](https://github.com/webmachinelearning/webmcp/issues/262) | context is lost when tools appear or disappear | `list_slides` reports `unavailableTools` — which conditional tools are not registered right now, why, and what the person can do to bring them back |
| [#278](https://github.com/webmachinelearning/webmcp/issues/278) | `executeTool` argument encoding | measured: Chrome 152 accepts only a JSON string (§5) |
| [#92](https://github.com/webmachinelearning/webmcp/issues/92) | who owns validation | the page does (§1) |
| [#248](https://github.com/webmachinelearning/webmcp/issues/248) (closed) | in-flight executions after unregistration | still fails in Chrome 152; page-side workaround (§8) |

### Comment drafted for #282

> We hit exactly this while building a review tool on WebMCP and ended up with two
> layers, both returned as ordinary tool results rather than thrown errors:
>
> 1. **Schema failures** — the page validates input itself (the browser does not,
>    #92) and returns `{ ok:false, error:{ code:"INVALID_INPUT", problems:[…],
>    inputSchema }, retrySafe:true }`.
> 2. **Deliberate refusals** — `OUT_OF_SCOPE` (the person limited where the agent
>    may write, with the allowed ids), `STALE_READ` (the person changed the slide
>    after the agent read it, with `changedSince`), `NOT_APPLICABLE` (the slide
>    type has no such field, with the fields it does have). Each carries what the
>    agent needs to recover, plus `retrySafe`.
>
> Live at https://minjikim89.github.io/redline/ ; the shape is documented in
> https://github.com/minjikim89/redline/blob/main/docs/pattern.md . What we would
> want from the spec is a conventional envelope (`ok`, `error.code`, `retrySafe`)
> that hosts could surface uniformly — today every site invents its own.

### Comment drafted for #262

> One mitigation that worked for us: the read tool that stays registered reports
> the tools that are *not* currently registered, with the reason and the way
> back. In our case `list_slides` returns
> `unavailableTools:[{ name:"set_chart_form", because:"no visualize note is open",
> how:"circle a chart and mark it visualize" }]`, inside the output budget. The
> agent stops hunting for a tool and asks the person for the state that enables
> it. It does not replace a spec-level answer (a `toolchange` payload with reasons
> would be better), but it closes the gap today.

Note: #146 (`toolactivated` / `toolcancel`) is closed in the spec; a third-party
review measured that Chrome 152 does not fire `toolactivated` for imperative
tools and that only `toolchange` is observable. Not independently verified here.

## Draft issue 3 for webmachinelearning/webmcp

> **Title:** §6.4: add page-enforced write boundaries as a mitigation for agent over-reach
>
> §6.4's mitigations all address a site misleading an agent. §6.3.2 *Current Gaps*
> notes there are no behavioral contracts and agents must assume good faith. The
> reverse direction — an agent exceeding the scope a person delegated on a site
> that exposed write tools — has no listed mitigation, and it is the direction
> prompt injection actually exploits: the injected instruction lives in the site's
> content, and the damage lands on the site's own data.
>
> We would like §6.4 to name a mitigation that does not depend on the model
> resisting injection: the page enforces, in the tool implementation, (a) a
> person-owned write scope (writes outside it are refused with a structured
> error naming the allowed targets), (b) optimistic concurrency against the
> person's own edits (writes over unread changes are refused with a diff), and
> (c) page-owned cancellation for long-running writes. A live implementation
> with these three, plus a fact/claim separation on the research writer, is at
> https://minjikim89.github.io/redline/ (source and error shapes:
> https://github.com/minjikim89/redline/blob/main/docs/pattern.md). Related: #282
> (structured refusals), #262 (why tools are absent).
