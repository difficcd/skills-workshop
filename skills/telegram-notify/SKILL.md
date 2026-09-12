---
name: telegram-notify
description: Two-way Telegram link between the user and the sessions on this machine - report to them when they are away, take their instructions from the phone, route a message to the session it names, wake an idle session when one arrives, and set the link up on a new machine. LOAD WHEN — the user asks to be messaged, briefed or notified; a long task finishes; you are blocked and need their answer; a Telegram message arrives for this session; the user wants to drive or check sessions from their phone; the user asks whether Telegram is connected or why it is not answering; a bot token, chat id, hook or watcher needs configuring. DO NOT LOAD — building a periodic status report or heartbeat (a P0 violation), another messenger, or developing a Telegram bot itself.
---

# Telegram notify

One line: **the user talks to the sessions on this machine from their phone, and the sessions
talk back.** Leave the computer on; from Telegram, see which sessions are open, give one of them
an instruction, get its report, wake it when it is idle.

Both directions are built to be quiet. Sending is by hand and on three occasions only — never a
heartbeat, never a poll that reports. Receiving goes through the hooks and one watcher per
session, which cost nothing when nobody writes. The only way an agent reaches a user who has
walked away is also the easiest way to become noise, so half of this skill is how to send and
how to listen; the other half is how not to.

---

## P0 — never

| # | Rule | Why |
|---|---|---|
| 0-1 | **Never build automatic or periodic sending.** No heartbeat or poll script, cron, scheduler, sending hook, or repeating report task. What is banned is a **loop running in the background that sends**, not a command the agent invokes once (`tg-read.mjs` is fine) and not a wait for receiving (`watch.mjs`, see "A watcher") | "Working on X" every N minutes is not information, it is noise. Once built, the user has to turn it off themselves |
| 0-2 | **Never put the token in a repository.** Credentials live in `~/.claude/local/telegram.env` and nowhere else | Committed is stolen. That file belongs to no repo |
| 0-3 | **Never print a token or chat id verbatim.** Use the masked output when confirming | It survives in transcripts, logs and screenshots |
| 0-4 | **Read it as the user before sending.** No progress narration, no self-reporting | See "When to send" |
| 0-5 | If the user says stop, **kill the processes too** | See the box below |
| 0-6 | **Never end a turn on "I will keep going" without sending** (modes 2 and 3). Stopping is the one occasion that matters most | This was violated: a turn ended with "I will carry on extracting the pure pieces", then stopped. Nothing arrived. From the outside that is indistinguishable from a crash |

### Deleting the file does not stop it

What actually happened: heartbeat and poll scripts were deleted and messages kept arriving for
hours. The shell had already read the files into memory and several processes were still alive.

**Deleting ≠ stopping.** Find the processes, kill them, and check the scheduler too.

```bash
# macOS / Linux
pkill -f 'sendMessage|tg_heartbeat|tg_poll' || true
crontab -l 2>/dev/null | grep -i telegram        # must print nothing
```

```powershell
# Windows
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -match 'sendMessage|tg_heartbeat|tg_poll' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Get-ScheduledTask | Where-Object { $_.TaskName -match 'telegram|tg' }   # must print nothing
```

If the agent harness has background tasks or scheduling, that is a second source. Check it too.

---

## Mode — ask once, then obey it

The user picks where reporting goes. It is a property of where **they** are, not of the work.

```bash
node ~/.claude/skills/telegram-notify/scripts/mode.mjs        # what is set
node ~/.claude/skills/telegram-notify/scripts/mode.mjs 2      # set it
```

| mode | terminal | telegram | when |
|---|---|---|---|
| **1** | full | **never** | the user is at the desk. A message would duplicate what they can already see |
| **2** | full | at the moments that matter | the default. They are here but may step away |
| **3** | **terse** | everything | they are away. Keep the terminal short to save tokens; the message is the report |

`tg.mjs` and `report.mjs` both check it: in mode 1 they print what would have gone and exit `0`,
so nothing is lost and no send happens. `TG_MODE=3` overrides for a single command.

**In mode 3 the terminal answer stays short** — a few lines, no long summaries, no repeated tables.
That is the point of the mode: the tokens go into the work, and the account of it goes by message.

**In modes 2 and 3, a stop is a send.** See P0-6. Before ending a turn, ask: did work stop here?
Finished, blocked, waiting, or "I will carry on next turn"? Then send, and send *before* writing
the closing message so a stop cannot slip out unannounced.

## When to send — three occasions, no others

1. **The user asked** — for a briefing, an update, a ping
2. **Work stops** — finished, blocked, or waiting on an answer. This is the one worth most
3. **You judge it worth it** — rarely. A long job finished, or something hard to undo happened

> The test, in one line: **would they have acted differently had they known while away?**
> If not, do not send. Write it to the terminal.

## How to send

**Use `report.mjs` for status.** Fixed shape, and half of it is filled in by the machine:

```bash
node ~/.claude/skills/telegram-notify/scripts/report.mjs --now "what you are doing" --done "what just finished"
node ~/.claude/skills/telegram-notify/scripts/report.mjs --blocked "what only the user can do"
```

```
🟢 my-app · 18:27          ← 🔴 when blocked, so the notification preview alone tells them
now: writing the retry tests
done: login form validation
next: refactor the checkout screen
⎇ feat/checkout · ● payment retry (12m ago) · uncommitted 3   ← read from git, not written by you
```

That last line is the point. Free text **cannot answer "is this session alive?"** — an agent
stuck for an hour can still write "working on it", and it reads identically to a healthy report.
The clock, branch, last commit and its age, and the uncommitted count come from the machine, so
two reports side by side reveal whether anything moved, whatever the prose claims. That line goes
out even with no fields at all.

Field rules and how to word them: **[references/reporting.md](references/reporting.md)**.

**For anything else:**

```bash
node ~/.claude/skills/telegram-notify/scripts/tg.mjs "text"
echo "text" | node ~/.claude/skills/telegram-notify/scripts/tg.mjs
```

Both print `200` on success. With no credentials they print the setup command and exit `2`.
`scripts/tg.sh` does the same for machines without Node.

---

## Reading what the user sent

This channel is **not send-only** — but nothing is listening in the background either. Listening
needs a loop, and a loop is what P0-1 bans. So reading happens **once, when the agent asks** —
or, for one open session, through a watcher that wakes it (see "A watcher" below).

```bash
node ~/.claude/skills/telegram-notify/scripts/tg-read.mjs             # what is waiting
node ~/.claude/skills/telegram-notify/scripts/tg-read.mjs --consume   # and mark it read
```

`getUpdates` holds everything since the last acknowledged offset. It is a **mailbox, not a
stream**, so reading late loses nothing — which is what makes on-demand reading a complete design
rather than a lossy one.

**When to read:** at each natural break in a long job, immediately before sending a report, and
whenever the user asks why you have not answered. Leave a message you could not act on
unconsumed and it will still be there next time — reading and acting are separate decisions.

> **Tell any first-time user this:** the bot is not listening in the background. A message they
> send waits quietly until the agent goes to read it. Unsaid, it reads as "the integration is
> broken" — which is exactly how it was read.

### Automatic detection — a hook, not a habit

**A skill is a document.** It changes what the agent does once it is already acting; nothing in a
turn reads the inbox or sends a report by itself. That is why P0-6 kept being broken and why
messages sat unread: both depended on the agent remembering.

A **hook** is executed by the harness, so neither does any more. Wire `stop-hook.mjs` to `Stop`:

```json
{ "hooks": { "Stop": [{ "hooks": [{ "type": "command",
  "command": "node ~/.claude/skills/telegram-notify/scripts/stop-hook.mjs", "timeout": 30 }] }] } }
```

At every stop it reads the inbox, sends the report **in mode 3**, and — if anything arrived —
returns `decision: block` with the messages, so the turn **continues and answers** instead of
ending on something never seen. It cannot loop: the messages are consumed before the block, so
the next stop finds an empty inbox.

What it takes out of the inbox is only **its own** mail — see "Several sessions, one bot" below.

Mode 2 deliberately does **not** auto-report: the terminal already reached them, and a message on
every turn end is the noise P0-1 exists to prevent. There, P0-6 stays a judgement call.

On `SessionStart`, `session-start.mjs` prints what is already waiting (unconsumed) into the new
session's context - and, when the watcher is switched on for the machine, the instruction to arm
it (see "A watcher"):

```json
{ "hooks": { "SessionStart": [{ "hooks": [{ "type": "command",
  "command": "node ~/.claude/skills/telegram-notify/scripts/session-start.mjs", "timeout": 20 }] }] } }
```

Any failure prints nothing and exits 0 — a broken notifier must never be able to trap a session.

### Several sessions, one bot

One chat, one bot, but often several agents running at once - one per project. They all read the
same inbox, and `getUpdates` acknowledges the **whole bot** at once: there is no way to take one
message and leave another. So whichever session stopped first consumed everything, and a message
meant for another project was eaten by a session it was not addressed to and never seen by the one
it was for.

`route.mjs` fixes that with the smallest thing that works: **each project gets a number, and the
user puts the number at the front of the message.**

```
2 run the tests        -> project 2, and nowhere else
1,3 run the tests      -> projects 1 and 3, each once
* run the tests        -> every session open at that moment
run the tests          -> whoever stops first (right when only one session is open)
?                      -> the bot replies with the list
```

```bash
node ~/.claude/skills/telegram-notify/scripts/route.mjs     # the list, as the user is shown it
```

```
Put the number first to pick a session:
1 my-app
2 other-app    (closed)
3 old-app      (never run)
```

Numbers are handed out the first time a project's hook runs and never reused, so a number the
user has learned keeps pointing at the same project. The list is sent to them automatically the
first time a new project takes one - that is the only moment it is worth a message, and it is
also the moment their copy of the list went out of date.

**Whether a session is open is read, not registered.** The register only grows, so without this
the list fills up with places nobody is working, and a number can point at a session that ended
days ago - the message then sits in the spool waiting for something that is never coming back. The
harness already writes the answer down: every session keeps a transcript at
`~/.claude/projects/<encoded cwd>/<session id>.jsonl` and touches it as it works, so the newest
mtime in that directory is when that project was last doing something. Nothing has to register
itself, and a session that dies leaves no state behind to clean up. Measured on a real machine: two
open sessions at 0-1 minutes, every closed one at 50 minutes or more - the signal separates cleanly.

Closed rows are **marked, not dropped**. Removing one would take away a line the user may still be
reading, and a number that vanishes between reading the list and typing it is the one failure the
numbers exist to prevent.

**A message with no number goes to whichever session stops first, not to all of them.** One
session, deliberately. It also means an unaddressed message can land somewhere you did not mean,
which is worth saying out loud: that is exactly how one arrived in the wrong project on the day
this was built.

Under it, `stop-hook.mjs` no longer consumes into itself. It drains Telegram into a **spool file**
and takes only its own share out: messages addressed to its number, plus unaddressed ones. Mail
for a project that is not open waits there for it, and is dropped after a day so a message cannot
surface out of nowhere a fortnight later.

A message with several addressees stays in the spool until the last of them has taken it; each
takes it once. `*` is resolved **when the message is spooled**, against the sessions open at that
moment (the session doing the spooling counts as open even if its transcript has gone quiet), so
"everyone" means everyone who was there when it was sent - a session opened tomorrow does not get
today's broadcast, and a closed one is not waited for. Which sessions count as open is the same
measurement the list shows.

Each spool operation is a read, a decision, and a write back, and two Stop hooks can end a turn in
the same second: both read the same array, both write, and the second rename wins - so a message
one session already took reappears and is delivered twice. Atomic writes cannot fix that; only
excluding the other reader can. An exclusive-create lock file (`wx`) does it with no library and no
daemon. A lock older than a minute belonged to a process that died holding it and is taken over,
and if the lock cannot be had at all the work is done **unlocked** rather than skipped - a
duplicate beats silence, which is the failure this whole skill exists to prevent.

**Say this to the user once:** without a number, the message goes to whichever session finishes
first - which is fine with one session open, and a coin toss with two. Send `?` to be reminded of
the numbers.

```bash
node --test skills/telegram-notify/test/route.test.mjs    # 22 tests
```

### A watcher — a message wakes an idle session

The Stop hook reads the inbox **when a turn ends**. Between turns — the agent idle, waiting for
the user to type — nothing runs, so a message sent then sits until someone presses enter in the
terminal. From the phone that is a bot that does not answer.

`watch.mjs` closes that gap **for one session, while it lives**. It prints one line per message
addressed to this session; run it under the harness's **Monitor** tool, where every stdout line is
an event that wakes the session, and the session answers as if the line had been typed:

```
Monitor({ command: 'node ~/.claude/skills/telegram-notify/scripts/watch.mjs',
          description: 'Telegram messages for this session', persistent: true })
```

**Arming it is the session's job, not the user's.** One setting for the machine:

```bash
node ~/.claude/skills/telegram-notify/scripts/watch.mjs --on      # every new session arms one at start
node ~/.claude/skills/telegram-notify/scripts/watch.mjs --off     # back to arming by hand
```

While it is on, the `SessionStart` hook prints the exact `Monitor(...)` call above into every new
session's context, and **the session's first act is to run it** - before reading the user's
request, before anything else. That is what turns "tell each window to listen" into a switch the
user flips once. A session that starts without the hook, or with the setting off, arms it when the
user says they will be writing from Telegram. One per session; `persistent: true`, because the
point is to be there whenever the message comes. `install.mjs` shows whether the setting and the
hook agree.

How it works: one `getUpdates` request held open for up to 50 s — Telegram's long poll, which is
what the `waitSec` argument of `inbox()` in `tg-read.mjs` turns on (every other caller leaves it
at 0 and returns at once). When something arrives it goes into the **same spool the Stop hook
uses**, is acknowledged, and only this session's share comes out — its own number, `*`, or no
number. Another session's mail stays in the spool for that session and does not wake this one.
The spool is checked on **every pass**, not only after this process fetched something: a message
addressed here may have been fetched by another session's hook or watcher, and Telegram will never
show it to this one. What is printed has already left the spool, so the next stop does not deliver
it again. Nothing is delivered twice, and nothing is delivered to the wrong session, because the
routing code is the one the hook already runs.

Answer with `tg.mjs`. The watcher sends nothing on its own account; the one thing it answers is
`?`, with the session map, when the mode allows sending — a question about the wiring, not worth
waking a session for.

**Two sessions, two watchers.** Telegram allows one open `getUpdates` per bot. A second watcher
cuts the first off — measured: `Conflict: terminated by other getUpdates request`. The loser
leaves the poll to the winner for 15 s and reads the spool every 2 s instead — the winner spools
for everyone — then asks for the poll again, so a winner that has gone is replaced. Nothing is
lost, and the loser is at most 2 s behind. Measured with two watchers for 60 s: each yielded
twice, four extra requests a minute in total. A session without a watcher still gets its mail at
its next stop.

```bash
node ~/.claude/skills/telegram-notify/scripts/watch.mjs --once   # exit after the first message: checks the wiring
node --test skills/telegram-notify/test/watch.test.mjs             # 6 tests
```

### What it costs — measured

Measured on one laptop - Intel Core i5-1340P (12 cores / 16 threads), 16 GB RAM, Windows 11 Pro,
Node 22 - with one bot. The network figures are the round trip to `api.telegram.org` from that
machine and will differ by line; memory and CPU are a Node process's and should be similar
anywhere.

| Piece | When it runs | Cost |
|---|---|---|
| Watcher (`watch.mjs`) | one process per session, for the session's life | 50 MB RSS, 47 ms CPU per minute (0.08 % of one core), 13 threads, 1 TCP connection kept alive; one request per 50 s while idle ≈ 0.8 KB/min ≈ 1 MB/day; zero events on a quiet day |
| Stop hook (`stop-hook.mjs`) | once per turn end | one `node` start (170–190 ms) + one `getUpdates` (350 ms–3.8 s measured, pure network); 1.2–3.1 s wall in total, at the moment the turn is already over |
| SessionStart hook (`session-start.mjs`) | once per session | same shape as the Stop hook: 1.2–2.5 s |
| Map / setting commands (`route.mjs`, `watch.mjs --status`) | when asked | 180–230 ms, no network |
| Spool, registry, lock | on every hook or watcher pass | three small JSON files in `~/.claude/local`; the spool is read and written under a lock that is held for milliseconds |
| *N* sessions | | *N* watchers, so *N* × 50 MB and *N* × 0.08 % CPU; the poll is held by one at a time, the others yield (above) — with two, four extra requests a minute |

Nothing runs between sessions. A hook or watcher that cannot reach Telegram prints nothing and
retries later; none of them can block a turn for longer than the hook timeout.

### When the session ends

Everything the skill starts belongs to a session, and goes with it:

- **The watcher.** The harness kills its monitor tasks when the session ends — observed on every
  session end so far: no `watch.mjs` process outlives the session that started it. For the end
  that is not observed (the harness dying without cleaning up), the watcher checks on every pass
  that the process which started it is still alive, and stops if it is not. So it can never keep
  contending for the poll with nobody to wake.
- **The hooks** run to completion or time out; they hold nothing open.
- **The spool.** Mail for a session that never comes back is dropped after 24 h; a lock left by a
  process that died is taken over after 60 s.
- **The registry** keeps the session's number (so the user's list stays valid) and marks the row
  closed off its transcript's age; there is nothing to clean up.

`tasklist` / `ps` for `watch.mjs` is the whole audit. If a session ended and one is still there,
that is a bug — kill it and say so.

### Sessions that could collide

Two sessions on one machine cannot see each other, and can be in the same repo, on the same file,
on the same port. Before touching something another open session may also be touching, use the
map as the meeting point:

```bash
node ~/.claude/skills/telegram-notify/scripts/route.mjs --note "rebasing feature/x onto main"   # what this session is doing
node ~/.claude/skills/telegram-notify/scripts/route.mjs                                          # what the others say they are doing
node ~/.claude/skills/telegram-notify/scripts/route.mjs --tell 2 "hands off package.json, 10 min" # a message for session 2 (`1,3`, `*` too)
```

A note is one line next to the session's number, visible to the user on `?` and to every other
session on the map; `--note ""` clears it. A message left with `--tell` goes through the spool
and reaches the other session the way the user's messages do — at its next stop, or at once if
it has a watcher — marked `(session N)` so it is read as coming from a session. A broadcast does
not come back to its sender. Nothing new to run: the mailbox that already exists.

The rule: **say what you are doing when it can collide, read the map before you collide, and tell
the other session when you have to.** The user sees the notes too, which is how they choose a
number.

**Its relation to P0-1.** That rule bans loops that *send* — heartbeats, periodic reports, anything
producing messages nobody asked for. The watcher is the other direction: a **wait for receiving**.
It sends nothing; its idle cost is one open connection, and a quiet day produces zero events. And it
is tied to the session — listed under the harness's tasks, stopped with one `TaskStop`, gone when
the session ends. It cannot outlive its owner and it cannot multiply, which are the two failures the
detached shell loop actually had.

### "Message the bot and have a session start"

The hook above only helps **inside a session that is already running**. Making a message *start*
one needs something that runs when nothing else does — `bridge.mjs`, called by an OS scheduler.

**It competes with the Stop hook, and it wins.** Both consume the same `getUpdates` offset, so a
few-minute schedule takes the messages a hook firing at the end of a turn would have delivered
into the live session. Treat the two as mutually exclusive — Stop hook while the user sits at a
session, bridge while they are away. What the user reports when it happens, and the one-line off
switch, are in [`references/reachability.md`](references/reachability.md).

```bash
node ~/.claude/skills/telegram-notify/scripts/bridge.mjs --install   # prints the command; installs nothing
node ~/.claude/skills/telegram-notify/scripts/bridge.mjs --dry       # what it would run
```

On Windows `scripts/install-bridge.ps1` is the ready-made task installer: `-WorkDir` picks the
directory it answers from, and it refuses to install over a wired Stop hook unless given `-Force`.
Hand it over; do not run it for them.

One poll: read the inbox, and if anything arrived, run `claude -p` on it and send the answer back.
**It is not a loop** — it reads once and exits, so the scheduler owns the cadence and the OS owns
the off switch. That is the difference from the detached shell loop that once kept sending for
hours after its script was deleted.

Guards, each for a failure that actually matters:

- **A lock file**, so a two-minute schedule cannot start a second agent on the same repo while the
  first is working. It carries a pid and a time, so a crashed run cannot block forever
- **Messages are consumed only once the lock is held**, so a refused poll leaves them for the next
- **A run timeout**, so one hung agent does not wedge every later poll
- Every failure is logged and swallowed; a bridge that can trap the machine is worse than one that
  misses a message

**Say this to the user before they install it:** anyone who can message the bot can make an agent
run on that machine, and the bot token is the only thing in the way. Do not install it where that
trade is not acceptable, and revoke the token with @BotFather if it ever leaks. **Do not install
it for them** — hand over the command so they own the off switch, and give them the stop line in
the same breath.

### "Make it work after the session ends"

The default is that nothing runs between sessions. Whether that can change **depends on the
machine, so probe rather than guess**:

```bash
node ~/.claude/skills/telegram-notify/scripts/reachability.mjs
```

It reports what is possible and **installs nothing**. The criteria, the four candidates, and what
must be done when building one: **[references/reachability.md](references/reachability.md)**.

In one line: usually the answer is an **OS scheduler plus a headless run**, and what makes it
different from the incident above is that a **named** task is listed and stops with one command.
If you build one, hand the user the stop command in the same breath.

---

## Setting it up

**Start here, always.** One command says what is already true and what the next step is:

```bash
node ~/.claude/skills/telegram-notify/scripts/install.mjs
```

```
✓ 1. credentials present
✓ 2. mode 2 (mode.mjs 1|2|3 to change)
✓ 3. Stop hook wired - the inbox is read when a turn ends
· 4. 6 permission rule(s) missing - USER: paste `install.mjs --perms` into ~/.claude/settings.json
✓ 5. bridge is possible (Windows Task Scheduler) - USER: run `bridge.mjs --install`
```

Steps 1, 4 and 5 are marked **USER** and cannot be done by the agent, on purpose. Only a person
can create a bot with @BotFather. And installing persistent automation — or granting the
permission that would let it be installed — is the call that keeps a chat message from being able
to run anything on the machine. An agent that could do that quietly is the thing worth being
unable to do.

So: **run the checklist, do the agent steps, hand the user their lines.** Do not try to install
the scheduled task yourself; the permission classifier will stop you, and it is right to.

`install.mjs --perms` prints the exact `permissions.allow` block. The rules are narrow by design —
`Bash(node <this skill's scripts>/*)` and the four scheduler verbs naming **one** task. A blanket
`PowerShell(*)` would buy the same convenience and hand over the machine.

`install.mjs --json` also carries the hook block, so it never has to be reconstructed from prose.

### Checking the link alone

```bash
node ~/.claude/skills/telegram-notify/scripts/tg-setup.mjs --check
```

- exit `0` → connected. It prints the bot and the destination. Done
- exit `2` → needs setting up. Open **[references/setup.md](references/setup.md)** and follow it

Once you have a token:

```bash
node ~/.claude/skills/telegram-notify/scripts/tg-setup.mjs <TOKEN>          # finds the chat id
node ~/.claude/skills/telegram-notify/scripts/tg-setup.mjs <TOKEN> <CHAT>   # when several exist
```

It saves, then **sends a test message** so a setup cannot end "succeeded but cannot send". The
token is printed masked — **do not write it out again**.

Failure codes and their causes are in [references/setup.md](references/setup.md).

---

## Moving it

Credentials are one file, `~/.claude/local/telegram.env`, and belong to no project.

- **New project** — nothing to do
- **New machine** — create that file (re-run setup, or copy it)
- **A different bot per project** — `TG_TOKEN` / `TG_CHAT` in the environment win over the file
- **CI or a container** — inject those variables; it works with no file at all
