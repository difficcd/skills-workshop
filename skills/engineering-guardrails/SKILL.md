---
name: engineering-guardrails
description: Rules for not accumulating the structural debt that forces a large refactor later. LOAD WHEN — writing a new feature, module or component; a file is growing or state is piling up; deciding where something belongs; writing tests; choosing what to refactor; reviewing code. DO NOT LOAD — pure visual styling, documentation-only work, throwaway scripts.
---

# Engineering guardrails

One line: **what forces a rewrite later is not file length, it is the absence of a seam.**

These came out of taking a 4,300-line React component apart. What cost real time was never the
length — it was **duplicated logic**, **failures that succeeded silently**, and **rules nobody
checked**. Every item below came from something that actually broke, and most carry a runnable
check.

---

## P0 — these are what force the refactor

| # | Rule | What actually happened |
|---|---|---|
| 0-1 | **Never write the same logic twice.** The second time you reach for it, extract it there and then | Every real bug came out of consolidating copies. Seven copies of the timeline gutter width surfaced a dead wheel-zoom. Three copies of "is this bitmap decoded yet" could each have cached a blank layer. Three hand-rolled scratch canvases disagreed about clearing after a resize |
| 0-2 | **Never leave a path that quietly does nothing.** Say it, block it, or throw | `patchLayer(layers, id, …)` mapped over the list and matched nothing — a paste evaporated with no error. Pasting into a hidden layer landed and was invisible. A writer with zero frames still produced bytes |
| 0-3 | **Never build a mirror.** One fact, one place; derive the rest | `currentCut` was looked up by hand thirteen times under five names (`cut`, `cc`, `src`, `A`, `primary`). A piece of state holding another's length drifts the moment one path updates only one of them |
| 0-4 | **Attach a runnable check to every rule.** Documents alone are not followed | An index nobody updates is worse than none — you learn to distrust it, then you stop looking. It held only once it was checked |
| 0-5 | **Write the why next to the number**, not at the top of the file | `DECODED_CAP = 120; // must exceed the prefetch window` — the most important property was a trailing comment. Violate it and eviction fights the prefetcher, which **reads as stutter, not as a memory problem** |

---

## P1 — where does it go

**Decide by seam cost.** Whether a group can be extracted is set not by its size but by **how many
names it reads that it does not own**.

```bash
node ~/.claude/skills/engineering-guardrails/scripts/seams.mjs src/App.jsx
node ~/.claude/skills/engineering-guardrails/scripts/seams.mjs src/App.jsx --group tool,setTool,color
```

Measured, in one file:

| group | names | lines | **reads** | verdict |
|---|---|---|---|---|
| drawing (`startDraw`/`onDraw`/`stopDraw`) | 35 | 598 | **53** | cannot leave — drawing genuinely touches everything |
| bitmap cache | 23 | 298 | 19 | hard |
| tool settings (colour, width, tool) | 28 | 42 | **4** | extracted |
| audio track | 11 | 86 | **4** | extracted |

**The largest function is rarely the best seam.** Measure, then pick.

| reads | meaning |
|---|---|
| ≤ 6 | good seam; this comes out in an afternoon |
| 7–20 | possible, but you inject that many names. Look for a smaller group first |
| > 20 | cannot leave. **Extract what it reads instead** |

Groups that score low are one of two shapes: **settings** (read everywhere, written almost
nowhere) or **things that know nothing of the outside** (the audio track knows nothing of cuts,
layers, the canvas or the timeline). Those go first.

### Decide the seam before writing the feature

Before adding anything, answer in one line: **what does this need to know?** More than five and it
is usually doing two jobs. Cutting now is cheaper than measuring later and being surprised.

- Pure computation goes in `core/` from the start — no canvas, no DOM, no state
- Anything touching the browser is injected, so a test can swap it
- **Never mix relative and absolute units.** Progress (0–1) and seconds/Hz in the same structure
  means that changing the timebase moves only half of it

## P2 — tests

| Rule | Why |
|---|---|
| **Check it can fail.** Break the code deliberately and confirm the test catches it | Two tests once compared a function against its own inlining. They could not fail. Watching them pass felt like verification |
| **Pin the property, not the value** | "neighbouring slices agree exactly at their shared edge" outlives "gw is 720" |
| **Promote a property that lives only in a comment** | The constant in P0-5. It is a test now |
| **Suspect the environment** | A golden ZIP fixture passed only in my timezone. CI runs UTC |

## P3 — standing checks

Each exists because of one incident.

```bash
node ~/.claude/skills/engineering-guardrails/scripts/unused-imports.mjs src server
node ~/.claude/skills/engineering-guardrails/scripts/seams.mjs <big-file> --max-lines 800
```

| Check | What it stops |
|---|---|
| **unused-imports** | Dead imports left by extractions. They break nothing, so they are invisible — while making a file's header **lie about what the file needs**. Thirty-three had piled up. It also catches the same name imported twice, which a plain usage check cannot: both copies are "used" |
| **reachability** | Code left behind when a feature was cut from the UI. A group that only references itself is dead however busy it looks |
| **helper index** | Reimplementing a helper that exists. A four-thousand-line file does not announce what it already has |
| **hook-dependency baseline** | Growing stale-closure risk. Do not demand zero — **pin the current count** and fail on growth |
| **i18n** | Untranslated strings |

**Use baselines.** Demanding zero violations of a codebase that already works gets the check
turned off. Pinning today's number and failing on growth is what actually holds.

---

## More

- **[references/decisions.md](references/decisions.md)** — decisions that cost something: the full
  silent-failure list, derive vs store, when a reducer, when a hook
- **[references/checks.md](references/checks.md)** — wiring the checks into a project, building a
  baseline, and verifying the checks themselves
