# Wiring the checks in

**Documents are not followed; checks are.** An index nobody updates is worse than none — you learn
to distrust it, then you stop looking. What follows is the order that actually worked.

---

## One command

```json
"check": "npm run typecheck && npm test && node scripts/hook-baseline.mjs && node scripts/helper-index.mjs && node scripts/unreachable.mjs && node ~/.claude/skills/engineering-guardrails/scripts/unused-imports.mjs src && node scripts/i18n-check.mjs && npm run build"
```

Of those, `unused-imports.mjs` (and `seams.mjs --max-lines`) come with this skill. The other
three - `hook-baseline.mjs`, `helper-index.mjs`, `unreachable.mjs`, `i18n-check.mjs` - are
**yours to write** for the project: they need to know its framework, its helper naming and its
i18n library, which is why they cannot be shipped generically. Each is fifty to a hundred lines
of regexes over the source tree; the incident table below says what each has to catch.

Order matters: **cheapest first** — a type error means there is no reason to reach the build. And
there must be **one thing to remember**. Seven checks are fine; two commands are not.

## Use a baseline (this is the important part)

Demanding zero violations of a codebase that already works gets the check turned off. **Pin
today's number and fail on growth.**

```js
// the gist of scripts/hook-baseline.mjs
const baseline = JSON.parse(readFileSync('scripts/hook-baseline.json', 'utf8'));
const now = countWarnings();
if (now > baseline.count) fail(`warnings grew ${baseline.count} → ${now}`);
if (process.env.UPDATE) writeFileSync(...);   // only when moving it on purpose
```

Most remaining warnings were **deliberate**. This app repaints a canvas every frame and holds
heavy caches, so adding every dependency the linter asks for reruns those effects continuously —
which is how a "Maximum update depth exceeded" loop actually happened. Zero is not always right.

## Verify the check itself

**After wiring a check, break something on purpose.** Otherwise you have a check that passes, not
a check that looks.

```bash
# does the import check really bite?
sed -i "1i import { readFileSync } from 'node:fs';" src/core/ids.js
node scripts/unused-imports.mjs        # must exit 1
git checkout src/core/ids.js
```

The same goes for **tests**. Two tests once compared a function against its own inlining. They
could not fail, and watching them pass felt like verification.

## The checks and the incident behind each

| Check | Incident |
|---|---|
| **unused-imports** | Repeated extractions left thirty-three dead imports. They break nothing, so they are invisible — while making a file's header lie about what it needs. One name was even imported twice: **both copies were "used"**, so a plain usage check cannot see it |
| **reachability** | Code left behind when a feature was cut from the UI. **A group that only references itself is dead however busy it looks.** Ask what is reached, not how often a name is mentioned |
| **helper index** | Reimplementing a helper that exists. `clearLiveOverlay` was hand-written four times while the real one sat two hundred lines below. Not carelessness — **a four-thousand-line file does not announce what it already has** |
| **hook baseline** | Growing stale-closure risk |
| **i18n** | Untranslated strings |

**One thing the reachability check taught:** for a hook call, only the *arguments* are a root, not
the names it defines. `useState` is a hook too, so taking the whole line makes every piece of state
a root of itself — and then no state can ever be reported. Everything before the `=` is the
left-hand side and must be left out.

## This skill's scripts

```bash
node ~/.claude/skills/engineering-guardrails/scripts/unused-imports.mjs src server
node ~/.claude/skills/engineering-guardrails/scripts/seams.mjs src/App.jsx
node ~/.claude/skills/engineering-guardrails/scripts/seams.mjs src/App.jsx --group a,b,c
node ~/.claude/skills/engineering-guardrails/scripts/seams.mjs src/App.jsx --max-lines 800
```

`seams.mjs` gives a **ranking, not an answer**. It is a tape measure reading one file with
regexes. Run without `--group` it clusters by name prefix, which is a rough first guess — real
groups rarely match prefixes, so pick candidates by eye and re-measure with `--group`.

The thresholds came from measurement:

| reads | meaning |
|---|---|
| ≤ 6 | good seam; out in an afternoon |
| 7–20 | possible, but you inject that many names. Look for a smaller group first |
| > 20 | cannot leave. **Extract what it reads instead** |

## CI

Some things pass locally and fail in CI. A golden ZIP fixture passed **only in my timezone** — ZIP
records local time, and CI runs UTC.

```bash
TZ=UTC npm test && TZ=America/Los_Angeles npm test && TZ=Pacific/Kiritimati npm test
```

Time, locale, path separators and line endings (CRLF) are the usual suspects.
