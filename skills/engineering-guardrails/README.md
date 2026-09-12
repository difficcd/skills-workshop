# engineering-guardrails

**Rules for not accumulating the structural debt that forces a large refactor later.**
Korean: [README.ko.md](README.ko.md).

A Claude Code skill of engineering rules distilled from actually refactoring a 4,300-line React
component down. What cost real time was never the length — it was duplicated logic, failures
that succeeded silently, and rules nobody checked. Every rule here came from something that
actually broke, and most carry a runnable check. The rules are language-independent.

---

## Why

These came out of taking apart a 4,300-line React component. The expensive part was **not the
length.**

- **Copies of the same logic** — every real bug surfaced while merging copies. Seven versions of
  the timeline-margin calculation hid a dead wheel-zoom; three versions of "is this bitmap
  decoded yet" hid a path that could cache an empty layer
- **Failures that succeed silently** — a paste evaporated without an error, because `patchLayer`
  returned the original untouched when it could not find the id
- **Rules nobody checks** — 33 dead imports had piled up. Nothing broke, so nobody saw them

## The one idea: seam cost

**The biggest function is rarely the best seam.** Whether a group can be pulled out is decided
not by its size but by **how many names it reads that are not its own** — and that cannot be
counted by eye.

```bash
node ~/.claude/skills/engineering-guardrails/scripts/seams.mjs src/App.jsx --group tool,setTool,color,brushSize
```

Measured on that file:

| Group | Names | Lines | **Reads** | Verdict |
|---|---|---|---|---|
| drawing | 35 | 598 | **53** | cannot leave — drawing touches everything by nature |
| bitmap cache | 23 | 298 | 19 | hard |
| tool settings | 28 | 42 | **4** | extracted |
| audio tracks | 11 | 86 | **4** | extracted |

The biggest block could not leave; the blocks it **reads** could. The drawing code stays as it
is, and the file loses 28 names.

## Install

```bash
cp -r skills/engineering-guardrails ~/.claude/skills/
```

```powershell
Copy-Item -Recurse skills\engineering-guardrails "$env:USERPROFILE\.claude\skills\"
```

Node 18+, zero dependencies.

## Layout

```
skills/engineering-guardrails/
├── SKILL.md                    # P0 (what creates debt) → P1 (where things belong) → P2 (tests) → P3 (always-on checks)
├── README.md · README.ko.md    # this document, English and Korean
├── references/
│   ├── decisions.md            # decisions that were paid for — the silent-failure list, derived vs. stored, when a reducer or a hook
│   └── checks.md               # how to attach a check, keep a baseline, and verify the check itself
├── scripts/
│   ├── seams.mjs               # seam-cost gauge — where a file can be cut · --max-lines budget
│   └── unused-imports.mjs      # dead imports (including duplicates, which both count as "used" and so escape linters)
└── test/                       # node --test skills/engineering-guardrails/test/*.test.mjs — each check shown to fail
```

## P0 in five lines

| # | |
|---|---|
| 0-1 | The moment the same logic is written **twice**, extract it there and then |
| 0-2 | Never build a path that **quietly does nothing**. If it cannot act: say so, block, or throw |
| 0-3 | No **mirrors**. Never hold one fact in two places — derive it |
| 0-4 | Every rule gets a **runnable check** |
| 0-5 | Write **why next to the number** |

A real case of 0-5: `DECODED_CAP = 120; // must exceed the prefetch window`. The most important
property in the file was an end-of-line comment. Violate it and eviction fights prefetch — and it
**shows up as stutter, not as a memory problem.** It is a test now.

## One thing about tests

**Check that it can fail.** Two tests once compared a function with an inline copy of itself.
They could never fail, and watching them pass was mistaken for verification.

After adding a test, break the thing on purpose and see whether the test catches it. If it does
not, it is not a test.

## License

[MIT](../../LICENSE)
