# telegram-notify

**Leave the computer on and run its agent sessions from your phone.** The agent reports to you
on Telegram when you are away; you answer with instructions; when several sessions are open you
pick one by number; an idle session wakes up the moment a message for it arrives. Setup, the
rules for when to send and when not to, and a fixed status-report format that answers the one
question free text cannot — *is this session still alive?* — are all included.

Node 18+, zero dependencies. Built for Claude Code; the pieces are plain scripts, see
[Portability](#portability). Korean: [README.ko.md](README.ko.md).

```
phone                                   computer (just switched on)
 ?                    ───────────▶       1 my-app · 2 other-app (closed)
 1 run the tests      ───────────▶       session 1 wakes → runs them → reports
 * what are you doing ───────────▶       every open session answers
 ◀───────────────  🟢 my-app · 18:27  now: writing the retry test …
```

Both directions are built to be quiet. Sending is by hand and on three occasions only — never a
heartbeat, never a poll that reports. Receiving goes through two hooks and one watcher per
session, which cost nothing while nobody writes. The only way an agent can reach a user who has
walked away is also the easiest way to become noise, so half of this skill is how to send and
listen; the other half is how not to.

Throughout, `<s>` stands for `~/.claude/skills/telegram-notify/scripts`.

---

## Why the report looks like this

Hand an agent a long job and walk away, and two things nag:

1. **Is it done? Is it stuck?** — you cannot tell without the terminal
2. **Is it still alive?** — this is the hard one

The second decided the design. A free-text report **cannot answer it**: "working on it" can be
written after an hour of nothing, and reads exactly like the same words from a healthy session.
So **half of every report is not written by the agent:**

```
🟢 my-app · 18:27
now:  writing the retry test for failed payments
done: login form validation
next: refactor the checkout screen
⎇ feat/checkout · ● retry failed payments (12m ago) · 3 uncommitted   ← read by a machine
```

The last line — time, branch, last commit and its age, uncommitted file count — comes from `git`
and the clock. Put two reports side by side and, whatever the sentences say, it is visible
whether anything actually moved between them. The line goes out even when no field is given, so
calling the script with no arguments is itself proof of life.

When the agent is blocked, **one glyph changes**, because the notification preview has to be
enough to decide whether to open it:

```
🔴 my-app · 18:31
blocked: passphrase for the signing key — only you have it
⎇ feat/checkout · ● retry failed payments (16m ago)
```

---

## Install

Copy the folder. No build, no package.

```bash
cp -r skills/telegram-notify ~/.claude/skills/
```

```powershell
Copy-Item -Recurse skills\telegram-notify "$env:USERPROFILE\.claude\skills\"
```

Or hand the agent this repository's URL and the skill's name; it will do the same. From the next
session on, *"set up Telegram"* is enough — the agent follows the checklist.

### Start here

```bash
node <s>/install.mjs
```

One screen: what is already true and what the next step is. Steps marked **USER** cannot be done
by the agent, deliberately — only a person can create a bot, and installing persistent
automation (or granting the permission to) is exactly the point that keeps a chat message from
being able to run anything on the machine. `install.mjs --perms` prints the permission block to
paste: narrow rules that allow this skill's scripts and one named scheduled task, nothing else.

### Link it (once, two minutes)

```bash
node <s>/tg-setup.mjs --check      # already linked?
```

If that prints `2`:

1. In Telegram, **@BotFather** → `/newbot` → copy the token
2. **Send the new bot any message** — skip this and the next step ends with `no chat found`. A
   bot cannot open a conversation; it learns where to write only once you have written to it
3. `node <s>/tg-setup.mjs <TOKEN>`

That finds the chat id, saves it, and **sends a test message to prove the whole path works** —
it never leaves you with credentials saved but nothing deliverable. Procedure, exit codes and
the API error table: [`references/setup.md`](references/setup.md).

That is everything a person has to do: the token, and one message to the bot. Hooks, mode and
the watcher setting are the agent's to configure (with your approval where the harness asks).

---

## Send

```bash
# status report (preferred)
node <s>/report.mjs --now "writing tests" --done "retry logic"
node <s>/report.mjs --blocked "need the signing key passphrase"
node <s>/report.mjs --dry                      # print the format, send nothing

# free text
node <s>/tg.mjs "text"
echo "text" | node <s>/tg.mjs
```

On success the only output is `200`.

Labels are Korean by default; `TG_LANG=en` gives `now` / `done` / `next` / `blocked`.

## Mode — where reports go

A question of **where the user is right now**, not of the task.

```bash
node <s>/mode.mjs        # current mode
node <s>/mode.mjs 2      # set it
```

| Mode | Terminal | Telegram | When |
|---|---|---|---|
| **1** | everything | **nothing** | at the desk — no reason to ring for what is already on screen |
| **2** | everything | key moments only | default: around, but might step away |
| **3** | **terse** | everything | away — terminal trimmed to save tokens, reports by message |

In mode 1, `tg.mjs` and `report.mjs` **print what they would have sent and exit.** Nothing is
lost, nothing rings.

---

## Read — the bot is not listening in the background

**The first thing a new user has to be told.** A message sent to the bot waits quietly until the
agent goes to read it. Listening in the background needs a loop, and a loop that *sends* is what
rule P0-1 forbids. (To have one open session woken by a message, see [Watcher](#watcher--a-message-wakes-an-idle-session).)

```bash
node <s>/tg-read.mjs               # what is waiting
node <s>/tg-read.mjs --consume     # ...and mark it read
```

`getUpdates` is a mailbox, not a stream: reading late loses nothing. Left unsaid, this reads as
"the integration is broken" — which is exactly how a first user reads it.

## Hooks — detection the harness performs, not a habit the agent keeps

**A skill is a document.** It changes what the agent does once it is already acting; nothing in
a turn reads the inbox or sends a report by itself. Anything that depends on the agent
remembering will eventually not happen.

**A hook is run by the harness.** Wire two, in `~/.claude/settings.json`:

```json
{ "hooks": {
  "Stop":         [{ "hooks": [{ "type": "command", "command": "node ~/.claude/skills/telegram-notify/scripts/stop-hook.mjs",     "timeout": 30 }] }],
  "SessionStart": [{ "hooks": [{ "type": "command", "command": "node ~/.claude/skills/telegram-notify/scripts/session-start.mjs", "timeout": 20 }] }]
} }
```

- **Stop** — at every turn end: read the inbox, send the report **in mode 3**, and if anything
  arrived return `decision: block` with the messages, so the turn **continues and answers** instead
  of ending on something never seen. It cannot loop: messages are consumed before the block, so
  the next stop finds an empty inbox. Mode 2 deliberately does not auto-report — the terminal
  already reached you, and a message on every turn end is the noise P0-1 exists to prevent.
- **SessionStart** — prints what is already waiting into the new session's context, and, when the
  watcher setting is on, the instruction to arm the watcher (below).

Both hooks print nothing and exit 0 on any failure. A broken notifier must never be able to trap
a session.

---

## Several sessions, one bot — put the number first

One chat, one bot, but usually one agent per project, all reading the same inbox — and
`getUpdates` acknowledges the **whole bot** at once; there is no way to take one message and
leave another. Without more, whichever session stopped first consumed everything, and a message
meant for another project was eaten by a session it was not addressed to.

`route.mjs` fixes that with the smallest thing that works: **each project gets a number, and you
put the number at the front of the message.**

```
2 run the tests        -> project 2, nowhere else
1,3 run the tests      -> projects 1 and 3, each once
* run the tests        -> every session open at that moment
run the tests          -> whichever session stops first (right when only one is open)
?                      -> the bot replies with the list
```

```bash
node <s>/route.mjs
```

```
Put the number first to pick a session:
1 my-app
2 other-app    (closed)
3 old-app      (never run)
```

Numbers are handed out the first time a project's hook runs and never reused, so a number you
have learned keeps pointing at the same project. The list is sent to you automatically only when
a new project takes a number — the one moment your copy of it went stale.

**Whether a session is open is observed, not registered.** Every session keeps a transcript at
`~/.claude/projects/<encoded cwd>/<session id>.jsonl` and touches it as it works, so the newest
mtime in that directory is when the project last did something. Nothing registers itself, and a
session that dies leaves nothing to clean up. Measured: open sessions read 0–1 minutes, closed
ones 50 minutes and up — the signal separates cleanly. Closed rows are **marked, not dropped**:
a number that vanishes between reading the list and typing it is the one failure the numbers
exist to prevent.

**A message with no number goes to one session — whichever stops first — not to all of them.**
Fine with one session open, a coin toss with two; say so to the user once.

Underneath, hooks and watchers drain Telegram into a **spool file** and take only their own share
out: messages addressed to their number, `*`, or nobody. A message for several sessions stays
until the last of them has taken it; `*` is resolved **when the message is spooled**, against the
sessions open at that moment, so "everyone" means everyone who was there when it was sent. Mail
for a project that is not open waits up to a day, then is dropped so nothing surfaces out of
nowhere a fortnight later. Every spool operation is a read-decide-write under an exclusive-create
lock file (`wx`) — two Stop hooks can end in the same second, and without the lock a message one
session already took would come back and be delivered twice. A lock older than a minute belonged
to a process that died and is taken over; if the lock cannot be had at all the work is done
unlocked — a duplicate beats silence, and silence is the failure this skill exists to prevent.

```bash
node --test skills/telegram-notify/test/route.test.mjs    # 22 tests
```

## Watcher — a message wakes an idle session

The Stop hook reads the inbox **when a turn ends**. Between turns — the agent idle, waiting for
you to type — nothing runs, so a message sent then sits until someone presses enter in the
terminal. From the phone that is a bot that does not answer.

`watch.mjs` closes that gap **for one session, for as long as it lives**. It prints one line per
message addressed to this session; run under the harness's **Monitor** tool, each line is an
event that wakes the session, which then answers as if the line had been typed:

```
Monitor({ command: 'node ~/.claude/skills/telegram-notify/scripts/watch.mjs',
          description: 'Telegram messages for this session', persistent: true })
```

**Arming it is the session's job, not yours.** One setting for the machine:

```bash
node <s>/watch.mjs --on       # every new session arms a watcher at start
node <s>/watch.mjs --off      # back to arming by hand
node <s>/watch.mjs --status
```

While it is on, the SessionStart hook prints the exact `Monitor(...)` call into every new
session's context, and **the session's first act is to run it** — before reading your request.
That turns "tell each window to listen" into a switch flipped once. A session that starts without
the hook, or with the setting off, arms it when you say you will be writing from Telegram.
`install.mjs` shows whether the setting and the hook agree.

How it works: one `getUpdates` request held open for up to 50 s (Telegram's long poll). Whatever
arrives goes into the **same spool the hooks use** and is acknowledged; only this session's
share comes out. The spool is checked on **every pass**, not only after this process fetched
something — a message for this session may have been fetched by another session's hook or
watcher, and Telegram will never show it again. What is printed has already left the spool, so
the next stop does not deliver it twice.

The watcher sends nothing on its own account. The one thing it answers is `?`, with the session
list, when the mode allows sending — a question about the wiring, not worth waking a session
for. Everything else the session answers itself, with `tg.mjs`.

**Two sessions, two watchers.** Telegram allows one open `getUpdates` per bot; a second watcher
cuts the first off (`Conflict: terminated by other getUpdates request`). The loser leaves the poll
to the winner for 15 s and reads the spool every 2 s meanwhile — the winner spools for everyone —
then asks for the poll again, so a winner that has gone is replaced. Nothing is lost, the loser is
at most 2 s behind, and two watchers cost four extra requests a minute between them (measured over
60 s). A session without a watcher still gets its mail at its next stop.

**Its relation to P0-1.** That rule bans loops that *send*. The watcher is the other direction: a
wait for receiving. Its idle cost is one open connection, and a quiet day produces zero events.
It is tied to the session — listed under the harness's tasks, stopped with one call, gone when the
session ends — so it cannot outlive its owner or multiply, which are the two failures a detached
shell loop actually has.

```bash
node <s>/watch.mjs --once                                  # exit after the first message: checks the wiring
node --test skills/telegram-notify/test/watch.test.mjs     # 6 tests
```

## Sessions that could collide

Two sessions on one machine cannot see each other, and can be in the same repository, on the
same file, on the same port. The session list is where they meet:

```bash
node <s>/route.mjs --note "rebasing feature/x onto main"     # what this session is doing
node <s>/route.mjs                                           # what the others say they are doing
node <s>/route.mjs --tell 2 "hands off package.json, 10 min" # a message for session 2 (`1,3`, `*` too)
```

A note is one line next to the session's number, visible to you on `?` and to every other
session on the list; `--note ""` clears it. A message left with `--tell` goes through the spool
and reaches the other session the way yours do — at its next stop, or at once if it has a
watcher — marked `(session N)` so it reads as coming from a session. A broadcast does not come
back to its sender. Nothing new runs: it is the mailbox that already exists.

The rule for agents: **say what you are doing when it could collide, read the list before you
collide, and tell the other session when you have to.** You see the notes too — that is how you
choose a number.

## When a session ends

Everything the skill starts belongs to a session and goes with it:

- **The watcher.** The harness kills its monitor tasks when the session ends — observed on every
  session end so far; no `watch.mjs` has outlived the session that started it. For the end that is
  not observed (the harness dying without cleaning up), the watcher checks on every pass that the
  process which started it is still alive, and stops if it is not.
- **The hooks** run to completion or time out; they hold nothing open.
- **The spool** drops mail for a session that never comes back after 24 h; a lock left by a dead
  process is taken over after 60 s.
- **The registry** keeps the number (so your list stays valid) and marks the row closed from the
  transcript's age. Nothing to clean up.

`ps` / `tasklist` for `watch.mjs` is the whole audit. One left after its session ended is a bug.

## What it costs — measured

One laptop: Intel Core i5-1340P (12 cores / 16 threads), 16 GB RAM, Windows 11 Pro, Node 22, one
bot. Network figures are the round trip to `api.telegram.org` from that machine and will differ
by line; memory and CPU are a Node process's and should be similar anywhere.

| Piece | Runs | Cost |
|---|---|---|
| Watcher (`watch.mjs`) | one process per session, for its life | 50 MB RSS, 47 ms CPU per minute (0.08 % of one core), 13 threads, one TCP connection kept alive; one request per 50 s while idle ≈ 0.8 KB/min ≈ 1 MB/day; zero events on a quiet day |
| Stop hook | once per turn end | one `node` start (170–190 ms) + one `getUpdates` (350 ms–3.8 s, pure network); 1.2–3.1 s wall in total, after the turn is already over |
| SessionStart hook | once per session | same shape: 1.2–2.5 s |
| List / setting commands | when asked | 180–230 ms, no network |
| Spool, registry, lock | on every hook or watcher pass | three small JSON files in `~/.claude/local`; the lock is held for milliseconds |
| *N* sessions | | *N* watchers: *N* × 50 MB, *N* × 0.08 % CPU; one holds the poll, the others yield — two together add four requests a minute |

Nothing runs between sessions. A hook or watcher that cannot reach Telegram prints nothing and
retries later; none can hold a turn longer than the hook timeout.

---

## Starting a session from a message — when none is open

*"Make it work after the session ends"* has a different answer on every machine. Probe, do not
guess:

```bash
node <s>/reachability.mjs
```

It reads the OS, the `claude` CLI, the available scheduler and the credentials, scores four
candidates by **certainty and overhead**, and picks one. It installs nothing — the choice is the
user's. Criteria and reasoning: [`references/reachability.md`](references/reachability.md).

Hooks and the watcher help only **inside a session that is already running**. For a message to
*start* one, something has to run when nothing else does: `bridge.mjs`, called by the OS
scheduler.

```bash
node <s>/bridge.mjs --install     # prints the install command; installs nothing
node <s>/bridge.mjs --dry         # what it would run
```

One poll: read the inbox, and if anything arrived, run `claude -p` on it and send the answer
back. **It is not a loop** — it reads once and exits, so the scheduler owns the cadence and the OS
owns the off switch. A lock file (no second agent on the same repository), consumption only once
the lock is held, and a run timeout each guard against a failure that actually happens.

On Windows, [`scripts/install-bridge.ps1`](scripts/install-bridge.ps1) is the ready-made task
installer; `-WorkDir` picks the directory it answers from.

```powershell
cd ~/projects/my-app; ./install-bridge.ps1              # answer from this folder
Disable-ScheduledTask -TaskName 'claude-telegram'      # off, one line
```

### The trap — the bridge and the Stop hook compete for one inbox

The `getUpdates` offset is **one per bot, not one per reader**. The bridge and the Stop hook both
read the inbox and then consume with `last + 1`, so **whichever polls first takes the message and
the other never sees it** — and the two do not poll at comparable rates:

| | Polls | Wins |
|---|---|---|
| scheduled bridge | every few minutes, unconditionally | almost always |
| Stop hook | only when a turn ends | only if no bridge tick fell inside that turn |

With both on, a message sent while you are working is **run headless in whatever directory the
scheduler points at**, and the session you are actually looking at ends with nothing. From
outside that is indistinguishable from a broken channel, so it gets reported as a bug.

**They are mutually exclusive, and which is right depends on where you are:**

| Situation | Keep on |
|---|---|
| at the desk, a session open | **Stop hook only** — messages land in that session as `decision: block` and the turn continues |
| away, no session open | **bridge only** — nothing else can answer |

`install-bridge.ps1` **refuses** to install over a wired Stop hook and prints this choice
instead. `-Force` if you really want both, and `Disable-ScheduledTask` while you are at the desk.

> **Say this before installing it:** anyone who can message the bot can make an agent run on this
> machine, and the bot token is the only thing in the way. The agent should **not install it for
> you** — it hands over the command so you own the off switch.

---

## Layout

```
skills/telegram-notify/
├── SKILL.md                  # what the agent reads
├── README.md · README.ko.md  # this document, English and Korean
├── references/
│   ├── setup.md              # linking procedure · exit codes · API error table
│   ├── reporting.md          # the report format and per-field wording rules
│   └── reachability.md       # reaching the machine after the session ends — four candidates and the criteria
├── scripts/                  # Node 18+, no dependencies
│   ├── install.mjs           # start here — checklist + the permission block
│   ├── tg-setup.mjs          # link a bot · --check
│   ├── tg.mjs                # send free text
│   ├── report.mjs            # the fixed-format status report (a machine fills half)
│   ├── mode.mjs              # where reports go — 1 terminal / 2 both / 3 telegram
│   ├── tg-read.mjs           # read what the user sent, on demand (not a loop)
│   ├── stop-hook.mjs         # Stop hook — read the inbox, report in mode 3, continue the turn
│   ├── session-start.mjs     # SessionStart hook — what is waiting + the watcher instruction
│   ├── route.mjs             # session numbers, the list, the spool, notes, session-to-session mail
│   ├── watch.mjs             # the watcher — run under Monitor, wakes an idle session
│   ├── reachability.mjs      # can the machine be reached between sessions — probe only
│   ├── bridge.mjs            # start a session from a message (called by the OS scheduler)
│   ├── install-bridge.ps1    # Windows task installer — refuses over a wired Stop hook
│   └── tg.sh                 # sending in bash, for when Node is not available
└── test/                     # node --test skills/telegram-notify/test/*.test.mjs
```

---

## P0 — what this skill exists to prevent

| # | Rule |
|---|---|
| 0-1 | **Never build automatic or periodic sending** — no heartbeat, poller, cron, scheduler, sending hook or repeating report task. What is banned is a loop that **sends**; a wait for receiving (`watch.mjs`) is not that |
| 0-2 | **Never put the token in a repository** — `~/.claude/local/telegram.env`, mode `0600`, and nowhere else |
| 0-3 | Never print a token or chat id verbatim — masked output only |
| 0-4 | Read it as the user before sending — no progress narration |
| 0-5 | If the user says stop, **kill the processes too** |

### 0-1 and 0-5 come from the same incident

Deleting heartbeat and poll scripts does not stop them: the shell had already read the files
into memory, and several processes stayed alive and kept sending for hours. **Deleting the file
is not stopping.** `SKILL.md` carries the commands, per OS, to find and kill the processes.

> "Working on X" every N minutes is not information, it is noise. The test for a message: **would
> the user, away from the desk, have acted differently for knowing this?**

---

## Portability

Credentials live in one file, `~/.claude/local/telegram.env`, independent of any project.

| Situation | To do |
|---|---|
| a new project | nothing |
| a new machine | create that file (rerun setup, or copy it) |
| a different bot per project | `TG_TOKEN` / `TG_CHAT` in the environment override the file |
| CI · containers | inject the same variables; no file needed |
| the file elsewhere | `TG_ENV_FILE` |
| English report labels | `TG_LANG=en` |
| the scratch directory elsewhere | `CLAUDE_TG_DIR` (registry, spool, lock) · `CLAUDE_PROJECTS_DIR` (transcripts, for liveness) |

**Another messenger.** Replace `send()` in `scripts/tg.mjs` — Slack, a Discord webhook, anything
that returns `{ ok, status, body }` — and `report.mjs` works unchanged. The format, the
occasions and P0 do not depend on the channel. Reading and routing are Telegram-shaped in one
place: `inbox()` in `tg-read.mjs` and its `getUpdates` offset.

**Another harness.** The scripts are plain Node and know nothing about who calls them. What the
harness has to provide, and where this skill uses it:

| Need | Used for | In Claude Code |
|---|---|---|
| run a command when a turn ends, and let it continue the turn | reading the inbox, answering before stopping | the `Stop` hook and `decision: block` |
| put text into a session's context when it starts | showing what is waiting, arming the watcher | the `SessionStart` hook |
| run a background process whose stdout lines wake the agent | the watcher | the `Monitor` tool |
| a per-project activity signal | which sessions are open | transcript mtimes under `~/.claude/projects` |

Without the third, everything still works; messages arrive at the next turn end instead of at
once. Without the fourth, raise `CLAUDE_TG_LIVE_MIN` or treat every registered session as open.

## License

[MIT](../../LICENSE)
