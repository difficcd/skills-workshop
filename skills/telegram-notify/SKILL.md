---
name: telegram-notify
description: Two-way Telegram link between the user and the sessions on this machine - report to them when they are away, take their instructions from the phone, route a message to the session it names, wake an idle session when one arrives, and set the link up on a new machine. LOAD WHEN — the user asks to be messaged, briefed or notified; a long task finishes; you are blocked and need their answer; a Telegram message arrives for this session; the user wants to drive or check sessions from their phone; the user asks whether Telegram is connected or why it is not answering; a bot token, chat id, hook or watcher needs configuring. DO NOT LOAD — building a periodic status report or heartbeat (a P0 violation), another messenger, or developing a Telegram bot itself.
---

# Telegram notify

**The user drives the sessions on this machine from their phone, and the sessions talk back.**
Both directions are quiet by design: sending is by hand on three occasions, receiving goes
through hooks and one watcher per session. The reasoning behind every rule here, with the
incidents that produced it: **[references/design.md](references/design.md)**.

`<s>` below means `~/.claude/skills/telegram-notify/scripts`.

## P0 — never

| # | Rule | Why |
|---|---|---|
| 0-1 | **Never build automatic or periodic sending** — no heartbeat, poll-and-report, cron, sending hook. A command the agent runs once is fine; a wait for *receiving* (`watch.mjs`) is fine | "Working on X" every N minutes is noise, and once built the user has to hunt it down themselves |
| 0-2 | **Never put the token in a repository.** It lives in `~/.claude/local/telegram.env` only | Committed is stolen |
| 0-3 | **Never print a token or chat id verbatim.** Use the masked output | It survives in transcripts and screenshots |
| 0-4 | **Read it as the user before sending.** No progress narration, no self-reporting | See "When to send" |
| 0-5 | If the user says stop, **kill the processes too** — deleting a script does not stop a shell that already read it. `pkill -f 'sendMessage\|tg_heartbeat\|tg_poll'`, then check cron / Task Scheduler / harness background tasks | Messages kept arriving for hours after the files were gone |
| 0-6 | **Never end a turn on "I will keep going" without sending** (modes 2–3). Send *before* the closing message | From the outside that is indistinguishable from a crash |

## Mode — ask once, then obey it

`node <s>/mode.mjs` shows it; `mode.mjs 1|2|3` sets it. `TG_MODE=3` overrides one command.

| mode | terminal | telegram | when |
|---|---|---|---|
| 1 | full | never | at the desk — a message would duplicate the screen |
| 2 | full | at the moments that matter | **default** — here, but may step away |
| 3 | **terse** (a few lines, no long summaries) | everything | away — the message *is* the report |

In mode 1 `tg.mjs` / `report.mjs` print what would have gone and exit 0. **In modes 2 and 3 a
stop is a send** (P0-6): finished, blocked, waiting, or "I will carry on next turn" — send first.

## When to send — three occasions, no others

1. **The user asked** — briefing, update, ping
2. **Work stops** — finished, blocked, waiting on an answer. The one worth most
3. **You judge it worth it** — rarely: a long job finished, something hard to undo happened

Test: *would they have acted differently had they known while away?* If not, write it to the terminal.

## How to send

```bash
node <s>/report.mjs --now "doing" --done "finished" --next "then"    # status: fixed shape
node <s>/report.mjs --blocked "what only the user can do"            # 🔴 in the preview
node <s>/tg.mjs "text"        # anything else; `echo text | node <s>/tg.mjs` works too
```

`report.mjs` appends a machine-written line — clock, branch, last commit and its age, uncommitted
count — so two reports side by side show whether anything moved, whatever the prose says. Field
rules: [references/reporting.md](references/reporting.md). Both print `200` on success; with no
credentials they print the setup command and exit `2`.

## Reading what the user sent

Nothing listens in the background; the inbox is a **mailbox, not a stream**, so reading late
loses nothing. **Tell a first-time user this** — unsaid, it reads as "the integration is broken".

```bash
node <s>/tg-read.mjs             # what is waiting
node <s>/tg-read.mjs --consume   # and mark it read
```

Read at natural breaks in a long job, right before a report, and when asked why you have not
answered. Reading and acting are separate: leave what you cannot act on unconsumed.

### Hooks — detection that does not depend on remembering

`stop-hook.mjs` on `Stop` reads the inbox at every turn end, sends the report in mode 3, and on
new mail returns `decision: block` so the turn continues and answers. `session-start.mjs` on
`SessionStart` prints what is waiting, plus the watcher instruction when that is on.
`node <s>/install.mjs --json` carries the exact hook block; any failure prints nothing and exits 0.

### Several sessions, one bot — numbers

`getUpdates` acknowledges the whole bot at once, so fetched mail goes into a **spool** and each
session takes only its share. **Each project gets a permanent number; the user puts it first.**

```
2 run the tests    -> session 2 only        ?    -> the bot replies with the map
1,3 run the tests  -> each once             *    -> every session open when it was sent
run the tests      -> whichever session stops first (fine with one open; a coin toss with two)
```

`node <s>/route.mjs` prints the map as the user sees it (open / closed / never run, read off
transcript mtimes). **Say once:** without a number the message goes to whoever finishes first;
send `?` for the numbers. Spooled mail for a session that never returns is dropped after a day.

### A watcher — a message wakes an idle session

Between turns nothing runs, so `watch.mjs` holds Telegram's long poll open **for one session,
while it lives**, and prints one line per message addressed here. Run it under **Monitor**:

```
Monitor({ command: 'node ~/.claude/skills/telegram-notify/scripts/watch.mjs',
          description: 'Telegram messages for this session', persistent: true })
```

- `watch.mjs --on` makes every new session arm one from the SessionStart hook; `--off` reverts.
  **When the hook prints the `Monitor(...)` call, run it before anything else.** One per session.
- A session started without it arms one when the user says they will write from Telegram.
- Answer each line with `tg.mjs`. The watcher sends nothing itself except the map for `?`.
- Two watchers on one bot take turns holding the poll; nothing is lost, the loser is ≤ 2 s behind.
- It stops when its session ends. `tasklist` / `ps` for `watch.mjs` is the whole audit — one left
  after its session is a bug: kill it and say so.

### Sessions that could collide

Same machine, same repo, same port — sessions cannot see each other. Use the map as the meeting point:

```bash
node <s>/route.mjs --note "rebasing feature/x onto main"       # what this session is doing ('' clears)
node <s>/route.mjs                                              # what the others say
node <s>/route.mjs --tell 2 "hands off package.json, 10 min"   # a message for session 2 (`1,3`, `*`)
```

**Say what you are doing when it can collide, read the map before you collide, tell the other
session when you have to.**

### Starting a session from a message — the bridge

`bridge.mjs` under an OS scheduler runs `claude -p` on what arrives when no session is open.
**It competes with the Stop hook and wins** — treat the two as mutually exclusive.
`bridge.mjs --install` prints the scheduler command and installs nothing; on Windows
`install-bridge.ps1` is the installer. **Hand it over; do not run it for them**, and say plainly
first: *anyone who can message the bot can make an agent run on this machine; the token is the
only thing in the way.* `reachability.mjs` probes what the machine allows; details in
[references/reachability.md](references/reachability.md).

## Setting it up

```bash
node <s>/install.mjs            # what is true, what is next, which lines are the USER's
node <s>/tg-setup.mjs --check   # exit 0 connected; exit 2 → references/setup.md
node <s>/tg-setup.mjs <TOKEN>   # finds the chat id, saves, sends a test message; token printed masked
```

Steps marked **USER** (bot token, permission rules, scheduled task) are theirs on purpose: do the
agent steps, hand them their lines. `install.mjs --perms` prints the narrow `permissions.allow`
block — never widen it to a blanket `PowerShell(*)`.

Credentials are one file, `~/.claude/local/telegram.env`. New project: nothing to do. New machine:
re-run setup. `TG_TOKEN` / `TG_CHAT` in the environment win over the file (CI, containers).

## references/

| File | When |
|---|---|
| `design.md` | why any rule above is the way it is; changing the mechanism |
| `reporting.md` | wording the report fields |
| `setup.md` | first setup, failure codes |
| `reachability.md` | making it work between sessions; the bridge/hook conflict |

Tests: `node --test skills/telegram-notify/test/*.test.mjs`
