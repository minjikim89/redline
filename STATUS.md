# Redline — STATUS

**Last updated**: 2026-09-02 (quality overhaul pass)
**External deadline**: 2026-09-04 05:00 KST (OpenAI WebMCP Challenge, Devpost) — **D-2**

| | |
|---|---|
| Live | https://minjikim89.github.io/redline/ |
| Repo | https://github.com/minjikim89/redline (public, MIT) |
| Deploy | GitHub Actions → Pages, on every push to `main` |
| Tests | `npm test` — 137 unit · `node e2e/scenarios.mjs` — phases A–K green (new K covers scope, edit_items, persistence, note editing, lossless round trip). Harness note: restart vite before a run — editing files mid-run splits the harness's store module from the app's via `?t=` invalidation |

## What it is

A slide-deck editor where a person and an agent both have hands in the same typed
model. You circle something and write in the margin; the mark resolves to
`{slideId, elementId}` and an agent reads that queue with WebMCP tools, edits the
live deck, and replies on the same pin.

Deliberately **not** a generator. Generation is solved; the loop after it is not —
the moment you fix a slide by hand, the model goes blind.

## Quality overhaul (2026-09-02, from a real ChatGPT-desktop session)

A first real session surfaced four product failures; all fixed and committed:

1. **Round trip was lossy** — export→import collapsed 9 of 12 slide types into
   junk cards ("2025, +5" heads). Export now embeds the typed model as a JSON
   island; import restores exactly. Foreign HTML keeps the (improved) heuristics;
   unreadable files are refused with a reason.
2. **No persistence** — the agent's own edits vanished on reload ("the deck
   session had reset"). Deck/queue/scope persist in localStorage; entry screen
   offers Continue. `?fresh=1` ignores the save.
3. **No scope control** — agent bulk-"fixed" slides nobody marked. New scope
   switch (default noted-only) + `OUT_OF_SCOPE` errors; `unify_across_slides`
   exempt as the watched, cancellable batch. `edit_items` adds structural
   editing (remove a block instead of rewriting around it).
4. **Notes felt like a toy and were immutable once pinned** — notes are now
   compact comment cards (expand on hover), editable after pinning (body+kind),
   clear asks first, conflict rewrite is inline (no `prompt()`).

## Blockers

**None technical.** Two decisions are outstanding and both are the user's:

1. **The name.** `Redline` is a working title. Devpost guidance: the name is the
   first thing judges see and should not be left to a model. Changing it means
   README, SUBMISSION.md, repo name, and the Pages base path in `vite.config.ts`.
2. **Demo video.** Not recorded. The research beat runs ~2 minutes live because the
   agent reads an actual DART filing.

## Next

1. **Name it**, then rename repo + `base` in `vite.config.ts` + README + SUBMISSION.md.
2. **Verify in the ChatGPT desktop in-app browser** against the deployed URL — this
   is the one check that cannot be automated (a subagent cannot drive the native
   app). Watch for: 11 tools in one snapshot; `set_chart_form` choosing `cards`;
   the amber conflict banner on s08; the source sweep going through
   `unify_across_slides` once rather than `set_slide_text` three times.
3. **Record the 3-minute video.** Proposed cut: entry screen and upload (20s) →
   the problem stated (25s) → circle the pie, agent re-forms it and replies (45s) →
   source sweep with a mid-way stop (30s) → the HYBE conflict shown as state the
   deck already carries (40s) → tool trail and conditional tools appearing (20s).
   Must be the real agent, not `▶ watch a pass` — Devpost forbids overstating what
   is running.
4. **Submit on Devpost.** After the deadline nothing may be touched — not the
   submission, not the repo, not the live site — until winners are announced.

## Assets

- `~/Downloads/From Screen to Cart.html` — the sample deck exported as standalone
  16:9 HTML, for uploading on camera. Regenerate with
  `npx vite-node scripts/emit-decks.mts -- ~/Downloads`.
- `public/exported-deck-sample.html` — a neutral second fixture the entry screen
  can fetch ("no file handy? try one").
- `SUBMISSION.md` — the four required Devpost answers, drafted.

## Where the WebMCP work actually sits

`src/webmcp/tools.ts` is the whole surface. Eleven tools; three exist only while a
note of the matching kind is open and are unregistered via `AbortController` when
it closes — so marking up the deck authors the agent's toolset. Nothing calls a
model: the page supplies structure, the agent supplies intelligence, so there are
no API keys and judges pay nothing.

Measured against the official reference implementations (Chrome's pizza-maker,
react-flightsearch, french-bistro; Vercel's storefront): dynamic registration and
`AbortSignal`-in-`execute` appear in **none** of them; `untrustedContentHint`,
structured errors and an output budget appear only in Vercel's.

## Deferred, with reasons

- **Pan/scroll when zoomed past fit** — content outside the viewport is
  unreachable. Only matters if the demo zooms in.
- **Tone round trip on import** — export writes inline background hex; reading it
  back would couple the model to the format, which the architecture explicitly
  refuses.
- **barsPair / flow / figures / panels / timeline collapse to `cards` on
  re-import** — there is no prose that means "bar chart". Specified behaviour,
  pinned by the round-trip test.
