# The report format

The fixed shape an agent uses to tell a user who has walked away where things stand.
`scripts/report.mjs` produces it.

---

## The question it is built to answer

Not "what did you do" but **"is this session still alive, and on what?"**

Free text cannot answer that. An agent can write "still working on it" when nothing has moved for
an hour, and it is indistinguishable, character for character, from a healthy report. The user
reads it and still does not know.

So **half of it is not written by the agent.** The clock, the branch, the last commit and its age,
and the count of uncommitted files are read from the machine. Put two reports side by side and
whether anything actually moved between them shows through, whatever the prose claims.

## The shape

```
🟢 my-app · 18:27
now: writing the retry tests
done: login form validation
next: refactor the checkout screen
⎇ feat/checkout · ● payment retry (12m ago) · uncommitted 3
```

Blocked — **one glyph changes**, because the notification preview alone has to be enough to decide
whether to open it:

```
🔴 my-app · 18:31
blocked: deploy signing key password - only the user has it
⎇ feat/checkout · ● payment retry (16m ago)
```

It sends with no fields at all. The machine-read line alone separates a live session from a
stopped one:

```
🟢 my-app · 18:27
⎇ feat/checkout · ● payment retry (12m ago)
```

## Fields

| Flag | Content | Rule |
|---|---|---|
| `--now` | what is happening right now | One line, starting with a verb. "refactoring"❌ → "writing 3 retry tests"⭕ |
| `--done` | what just finished | Something checkable: a PR number, a filename, a count |
| `--next` | what follows | Omit if unknown |
| `--blocked` | what is stuck | **Write what the user has to do.** Its presence makes it 🔴 |
| `--note` | anything else, one line | Rare |
| `--dry` | print without sending | For checking the shape |

An empty field drops its whole line, so every line you see is information.

### Language

Labels (`now`/`done`/`next`/`blocked`/`uncommitted`, and "12m ago") default to Korean —
`지금`/`직전`/`다음`/`막힘`/`미커밋`, "12분 전". `TG_LANG=en` switches them:

```bash
TG_LANG=en node ~/.claude/skills/telegram-notify/scripts/report.mjs --now "writing tests"
```

The content is written by the agent and is independent of the labels; mixing is fine.

## For work running without supervision — `--next` becomes the most important field

When an agent chains several steps on its own, the user needs to know **what is about to happen**
more than what is happening. Only that lets them decide whether to intervene. `--now` describes
something already done and beyond recall; `--next` has not happened yet.

So in an unsupervised stretch, fill in three:

| | |
|---|---|
| `--done` | the hard-to-undo things first — merges, deletions, pushes, deploys |
| `--next` | **the next hard-to-undo action.** This is their last chance to stop it |
| `--blocked` | what only they can do. Its presence makes it 🔴 |

```bash
node ~/.claude/skills/telegram-notify/scripts/report.mjs \
  --done "merged 3 PRs, cleaned up branches" \
  --next "refactor the payment module - 12 files"
```

**One message per stretch of work**, not per interval of time (P0-1). A "stretch" ends when you
have done something hard to undo, or are about to.

**Read the inbox immediately before reporting** — the user may already have changed direction, and
moving to the next step without knowing that is the most expensive failure an unsupervised loop
has.

## Modes

`mode.mjs` decides whether this is sent at all. In mode 1 the report is still **built** — the
machine-read line goes to the terminal — but nothing is sent. The discipline is the same in every
mode; only the destination changes.

In **mode 3** the terminal reply stays terse and this message carries the account. That makes
`--done` and `--next` do more work: they are the only record the user gets.

## When

The three occasions in SKILL.md. **Work stopping** is what this shape was made for — finished,
blocked, or waiting on an answer.

**Never run it on a timer.** Putting this script in cron, a scheduler or a repeating task is a
P0-1 violation, and `429 Too Many Requests` is the first sign it happened.

## Wording

- It is read on a lock screen. **The first line alone should stand up**
- Put numbers in. "3 tests failing" always beats "some failures"
- No code blocks, no tables, no pasted PR bodies. One line for a link
- No apologies, no promises, no self-assessment. Facts, and what you need
