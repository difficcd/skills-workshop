# ask-first

Korean: [README.ko.md](README.ko.md)

**When a request can be read more than one way, the agent asks before it builds — at a
threshold you set.**

Two failures, one week apart, from the same user: "stop asking and go" during a refactor
where every question was already answered by the plan, and "why didn't you ask" after a
feature was built at the wrong scope and two rounds were lost to the guess. Neither is the
right rule for the other week. So the rule has a dial.

| level | the agent asks when… | otherwise |
|---|---|---|
| **high** | the readings lead to materially different work **and** a wrong guess is expensive (deletes, sends, half an hour of rework) | picks, says which, builds |
| **mid** (default) | the readings lead to materially different work | picks, says which, builds |
| **low** | more than one reading exists at all — scope, placement, naming, format, audience | still never asks what the code already answers |

At every level: one question a turn, two or three readings with the recommended one first,
and a default so a user who is away is not a user who is blocked.

## Install

```
Install ask-first from https://github.com/difficcd/skills-workshop into ~/.claude/skills/
```

Then, optionally, the hook that states the level on every prompt (so it holds across sessions
without the skill being loaded):

```bash
node ~/.claude/skills/ask-first/scripts/install.mjs --on
```

It merges one `UserPromptSubmit` entry into `~/.claude/settings.json` and touches nothing
else; `--off` removes exactly that entry.

## Use

```bash
node ~/.claude/skills/ask-first/scripts/level.mjs           # mid
node ~/.claude/skills/ask-first/scripts/level.mjs low       # ask at the slightest doubt
node ~/.claude/skills/ask-first/scripts/level.mjs high      # ask only when it really matters
```

Or just say it: "ask me only when it really matters" / "ask before you touch anything". The
agent sets the level and says it back.

## Files

```
SKILL.md                 the rule, the three levels, how to ask, what never to ask
scripts/level.mjs        read / set the level (~/.claude/local/ask-first.json)
scripts/prompt-hook.mjs  the UserPromptSubmit hook: one line of context per prompt
scripts/install.mjs      --on / --off for that hook
test/                    node --test skills/ask-first/test/ask-first.test.mjs
```

Node 18+, no dependencies.
