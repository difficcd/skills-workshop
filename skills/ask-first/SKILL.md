---
name: ask-first
description: When a request can be read more than one way, ask before building - at a strictness the user picks (high asks only on a real fork, mid on any material fork, low on the slightest doubt). LOAD WHEN — a request has two or more readings that lead to different work; you are about to guess at scope, placement, naming, format or audience; the user says "ask me first", "don't guess", "why didn't you ask", or wants the question threshold changed. DO NOT LOAD — the answer is in the code, the repo, a convention or the user's earlier words; a decision is routine and cheap to undo; the user has already said which way.
---

# Ask first

**A wrong guess costs more than a question.** Not always - a question costs the user a
context switch, and one they did not need reads as an agent that cannot think. So the rule
has a threshold, and the user sets it.

## The level

Three levels, one file: `~/.claude/local/ask-first.json` (`{"level": "mid"}`). Read it when
this skill loads; `mid` if it is missing.

```bash
node <skill>/scripts/level.mjs            # print the level
node <skill>/scripts/level.mjs high|mid|low
node <skill>/scripts/install.mjs --on     # a hook that states the level on every prompt (see below)
```

| level | ask when | otherwise |
|---|---|---|
| **high** | the readings lead to *materially different work* **and** a wrong guess is expensive: deletes or overwrites, sends or publishes, or costs more than about half an hour to redo | pick the reading a careful colleague would, say which in one line, build |
| **mid** | the readings lead to materially different work, whatever the cost of guessing | pick, say which, build |
| **low** | more than one reading exists at all - scope, placement, naming, format, audience, order | still never ask what the code or the repo answers |

The user says which in their own words: "ask me only when it really matters" is `high`;
"ask before you touch anything" is `low`. Set the file and say the level back to them.

## What is not ambiguity - never ask, at any level

- Anything the **code, the repo, git history, a CLAUDE.md or an earlier message** answers.
  Look first. A question whose answer is in the open file is the one that costs trust.
- A choice with a **conventional default** - the file next to its siblings, the name the
  codebase already uses, the language the repo is in.
- A choice the user **has already made**, including by repeating the request after you raised
  a concern. That is the decision; build it.
- The **routine judgement calls** of doing the work. Asking them is handing the work back.

## How to ask

- **Before starting**, not halfway. If the fork is found mid-task, do everything that does not
  depend on it, then ask with the finished part in hand.
- **One question a turn.** Two questions is a form; the user answers the first and misses the
  second.
- **Two or three readings, the recommended one first, marked.** A question with no
  recommendation is a request to do your thinking.
- **A default.** "If I hear nothing I go with A" - so a user who is away is not a user who is
  blocked. At `high`, that default is the answer unless the guess is expensive.
- Use the host's question tool when there is one (`AskUserQuestion`); otherwise a numbered
  list. If the user is reading from Telegram, the question goes there - see `telegram-notify`.
- **Short.** The readings, one line each. Not why the request was ambiguous.

## When the answer comes back

Build exactly that reading, and do not re-ask a question that has been answered in this
session, however the wording of later requests drifts. If an answer settles a class of
questions ("always the Korean one first", "never ask about file names"), write it where your
standing preferences live so the next session inherits it.

## The hook

`install.mjs --on` registers a `UserPromptSubmit` hook (merged into `~/.claude/settings.json`,
nothing else touched) that adds one line of context to every prompt:

```
ask-first: level mid - ask when the readings lead to materially different work; otherwise pick, say which, build.
```

That is what makes the level hold across sessions without the skill being loaded each time.
`--off` removes exactly that hook.

## Why these three

They come from the same user in one week. **high** was "stop asking and go" during a long
refactor, where every question was a decision already made by the plan. **low** was "why
didn't you ask" after a feature was built at the wrong scope - the request said "colour noise"
and meant the fringe on a line, not specks on the frame, and two rounds were lost to the
guess. Neither is the right level for the other week. The file is the memory of which week it
is.
