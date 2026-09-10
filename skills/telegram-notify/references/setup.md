# Setting up the link

Only needed when `--check` returned exit `2` (not configured).

---

## 1. The token — only the user can get it

An agent has no Telegram account and cannot create a bot. Tell the user:

> In Telegram, message **@BotFather** with `/newbot`, pick a name and a username (it must end in
> `_bot`), and it gives you a token shaped like `123456789:AA...`. Paste that here.
>
> Then **open a chat with the bot you just made and send it any message.**
> A bot cannot start a conversation, so it only learns where to write once you have written to it.

Leaving out that second paragraph is what makes the next step fail with `no chat found`. It is the
most common failure by far.

**For a channel instead of a chat:** create the channel → add the bot as an **administrator** →
post anything. The chat id will be a negative number starting `-100`. That is normal.

## 2. Save

```bash
node ~/.claude/skills/telegram-notify/scripts/tg-setup.mjs <TOKEN>
```

It finds the chat id from `getUpdates`, writes `~/.claude/local/telegram.env` with mode `0600`,
and **sends a test message**. If several chats have written to the bot it prints them and stops;
pass the one the user picks as a second argument:

```bash
node ~/.claude/skills/telegram-notify/scripts/tg-setup.mjs <TOKEN> <CHAT_ID>
```

**Do not write the token out again.** The script prints it masked.

## 3. Confirm

```bash
node ~/.claude/skills/telegram-notify/scripts/tg-setup.mjs --check   # must be 0
node ~/.claude/skills/telegram-notify/scripts/report.mjs --now "checking the link"
```

---

## Exit codes

| Code | Meaning | Do |
|---|---|---|
| `0` | fine | — |
| `1` | token rejected, or the test message failed | see the table below |
| `2` | no credentials | start at step 1 |
| `3` | `no chat found` | the user has not messaged the bot yet — repeat step 1's second paragraph |
| `4` | several chats | pass the chosen id as the second argument |

## API errors

| Response | Cause | Do |
|---|---|---|
| `401 Unauthorized` | wrong or revoked token | reissue with @BotFather `/token` |
| `403 Forbidden: bot was blocked by the user` | the user blocked the bot | unblock in the chat |
| `403 … not enough rights` | the bot is not an admin of the channel | make it one |
| `400 chat not found` | wrong chat id, or the channel was deleted | re-check with `--check` |
| `429 Too Many Requests` | sending too often | **a sign P0-1 is being violated.** Look for automatic sending still alive |
| `200` but nothing arrives | it went to a different chat | `--check` prints the destination's name |

## Where the credentials live

```
~/.claude/local/telegram.env        # 0600, belongs to no project, in no repo
  TG_TOKEN='...'
  TG_CHAT='...'
```

`TG_TOKEN` / `TG_CHAT` in the environment win over the file, so CI and containers need only those
and no file. `TG_ENV_FILE` moves the file.

**Never:** a `.env` inside a repository, `settings.json`, a constant in a script, a commit message,
an issue body. Once pushed it stays in the history even if deleted, and the token has to be
revoked and reissued.
