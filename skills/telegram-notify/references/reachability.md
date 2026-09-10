# Being reachable after the session ends

The user usually asks it as: *"it used to answer even after the session ended — why not now?"*

**Give them the fact first.** By default this channel does nothing outside a session. Messages
they sent are still sitting in `getUpdates` and are not lost — only immediacy is. What used to
work was almost certainly a **background shell loop**, which is exactly what P0-1 bans (and what
kept sending for hours after its script was deleted).

Then find out whether it can be fixed. **The answer differs per machine, so probe rather than
guess:**

```bash
node ~/.claude/skills/telegram-notify/scripts/reachability.mjs
```

It installs nothing. It only prints what is possible.

---

## The criteria

**Low overhead AND certain.** Both must hold. Slightly cheaper but unproven is a no; certain but
too heavy is also a no. Failing either is a **rejection**, not a compromise.

If nothing passes, stay on `in-session-only` and **say why**. That is the honest default.

## The four candidates

| | certain | overhead | when to pick it |
|---|---|---|---|
| **os-scheduler** | when scheduler + `claude` CLI + credentials are all present | near zero while idle — one HTTPS call per tick, nothing spawned unless a message exists | usually this one |
| **cloud-routine** | always (works with the machine off) | **high** — every tick is a full cloud session, most finding nothing | only when messages must land with the machine off |
| **push-webhook** | not yet | zero — nothing runs until a message arrives | once URL-hook minting is confirmed |
| **in-session-only** | always | none | when the rest are out. The current default |

### os-scheduler — usually the answer

An OS scheduler runs a short poll and starts a headless agent run **only when a message exists**.
Idle cost is one HTTPS call; you pay only when there is something to pay for.

**How this differs from the incident.** The problem then was not polling — it was a **detached
shell loop**: unlisted, unkillable by name, silently multiplying. A *named* scheduled task is none
of those:

```powershell
Get-ScheduledTask -TaskName 'claude-telegram'          # is it there
Disable-ScheduledTask -TaskName 'claude-telegram'      # off, one line
Unregister-ScheduledTask -TaskName 'claude-telegram'   # gone
```

```bash
launchctl list | grep claude-telegram             # macOS
systemctl --user status claude-telegram.timer     # Linux
crontab -l | grep claude-telegram                 # cron
```

**Non-negotiable when building one:**

- **Fix the name** (`claude-telegram`). Without a name none of the commands above work
- **Forbid overlapping runs.** The moment two overlap you have recreated the incident
- The poll **only reads**, and consumes what it handled with `--consume`. Otherwise the same
  instruction runs again on the next tick
- **Hand the user the stop command right there.** Automation nobody knows how to turn off was the
  real failure last time

### The bridge and a live session compete for the same inbox

**This is the one that gets reported as "Telegram stopped reaching my session."**

`getUpdates` acknowledges with an **offset that belongs to the bot, not to the reader**. Both
`bridge.mjs` and `stop-hook.mjs` read the inbox and then re-read it at `last + 1` to consume what
they handled. So the first one to poll takes the message and the other never sees it.

They do not poll on comparable schedules:

| | when it polls | how often it wins |
|---|---|---|
| scheduled bridge | every N minutes, unconditionally | almost always |
| `Stop` hook | only when a turn ends | only when no tick fell inside the turn |

With both installed, a message sent while the agent is mid-turn is answered by a **headless run in
whatever directory the scheduler was pointed at**, and the session the user is watching never
continues. From the outside that is indistinguishable from the channel being broken, which is why
it arrives as a bug report and not as a conflict.

**They are mutually exclusive, and which one is right depends on where the user is:**

- **at a live session** — Stop hook only. The message lands in that session as a `decision: block`
  and the turn keeps going instead of ending. Turn the task off:
  `Disable-ScheduledTask -TaskName 'claude-telegram'`
- **away, nothing open** — bridge only. Nothing else can answer

`install-bridge.ps1` refuses to install over a wired Stop hook for exactly this reason and prints
the choice instead; `-Force` overrides. `Enable-ScheduledTask` puts it back when leaving the desk.

### cloud-routine — certain but expensive

A cloud routine made with `RemoteTrigger` runs whether or not this machine is on. But polling
every few minutes is hundreds of runs a day, nearly all finding nothing. That is precisely the
certain-but-too-expensive case.

Use it only when messages must be caught while the machine is off, and with a **generous
interval**.

### push-webhook — right shape, cannot be built yet

Telegram's `setWebhook` posting straight at a routine URL would wake only when a message exists.
Zero overhead. The hook type genuinely exists:

```
hook_type: must be in list [app, url]
```

But creating one:

```
hook_type=url triggers are minted by the bound session, not created through this API
```

**Minted by a session, not creatable through the triggers API.** Not certain, therefore rejected.
If that minting path is confirmed later this becomes the best option — update this file then.

### in-session-only — the current default

Nothing runs between sessions. `getUpdates` is a **mailbox, not a stream**, so reading late loses
nothing.

## How to tell the user

1. **Answer why it does not work now**, factually — there used to be a background loop, it caused
   an incident, it was removed
2. Show the probe result and **let them choose**. Different machine, different answer
3. If they build one, **give them the stop command**. Every time, no exceptions
4. If nothing passes, say so. Do not attach something uncertain and present it as certain
