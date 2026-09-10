---
name: telegram-notify
description: Send the user a Telegram message, read what they sent back, or set the link up on a new machine. LOAD WHEN — the user asks to be messaged, briefed or notified; a long task finishes; you are blocked and need their answer; the user asks whether Telegram is connected or why it is not answering; a bot token or chat id needs configuring. DO NOT LOAD — building a periodic status report or heartbeat (a P0 violation), another messenger, or developing a Telegram bot itself.
---

# Telegram notify

One line: **a channel you send down by hand.** No heartbeat, no poller, no cron, no hook.

It is the only way an agent reaches a user who has walked away, and the easiest way to become
noise. Half of this skill is how to send; the other half is how not to.

---

## P0 — never

| # | Rule | Why |
|---|---|---|
| 0-1 | **Never build automatic or periodic sending.** No heartbeat or poll script, cron, scheduler, sending hook, or repeating watch task. What is banned is a **loop running in the background**, not a command the agent invokes once (`tg-read.mjs` is fine) | "Working on X" every N minutes is not information, it is noise. Once built, the user has to turn it off themselves |
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
needs a loop, and a loop is what P0-1 bans. So reading happens **once, when the agent asks**.

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

Mode 2 deliberately does **not** auto-report: the terminal already reached them, and a message on
every turn end is the noise P0-1 exists to prevent. There, P0-6 stays a judgement call.

Optionally on `SessionStart`, `tg-read.mjs` (without `--consume`) starts a session knowing what is
already waiting.

Any failure prints nothing and exits 0 — a broken notifier must never be able to trap a session.

### "Message the bot and have a session start"

The hook above only helps **inside a session that is already running**. Making a message *start*
one needs something that runs when nothing else does — `bridge.mjs`, called by an OS scheduler.

```bash
node ~/.claude/skills/telegram-notify/scripts/bridge.mjs --install   # prints the command; installs nothing
node ~/.claude/skills/telegram-notify/scripts/bridge.mjs --dry       # what it would run
```

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

When asked to connect Telegram, **check whether it already is.** On anything but a new machine it
usually is.

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
