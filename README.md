# skills-workshop

Personal skills for Claude Code. Korean: [README.ko.md](README.ko.md).

A collection of skills distilled from building real projects: feedback that kept repeating and
**bugs that actually shipped**, promoted to rules. Written as **numbers** and **runnable checks**
rather than "keep it clean".

## Skills

| Skill | What it is |
|---|---|
| [**monotone-accent-ui**](skills/monotone-accent-ui/) ([Korean](skills/monotone-accent-ui/README.ko.md)) | A UI system that carries dark and light on neutral surfaces plus one accent colour. Tokens, an accent-intensity ladder, measured scales, 14 component recipes, 13 screen-composition UX patterns, and a dependency-free violation checker |
| [**engineering-guardrails**](skills/engineering-guardrails/) ([Korean](skills/engineering-guardrails/README.ko.md)) | Rules for not accumulating the structural debt that forces a large refactor later, extracted while taking apart a 4,300-line component — a **seam-cost gauge**, a list of silent failures, derived vs. stored state, five always-on checks and how to keep a baseline |
| [**telegram-notify**](skills/telegram-notify/) ([Korean](skills/telegram-notify/README.ko.md)) | **Leave the computer on and run its sessions from your phone.** The agent reports, you answer with instructions, you pick a session by number (`1 …`, `1,3 …`, `* …`), and an idle session wakes when a message arrives. Two-minute setup, the rules for when to send and when not to, a **status-report format half-filled by a machine so it answers "is this session still alive?"**, and measured overhead. Node 18+, zero dependencies |

## Install

**The easiest way — give Claude this repository's URL and the names of the skills you want.**
There is no build and no package, so cloning and copying a folder is the whole install:

```
Install telegram-notify and engineering-guardrails from
https://github.com/difficcd/skills-workshop into ~/.claude/skills/, then follow each
SKILL.md's "Setting it up" section through to a verified link.
```

The agent clones the repository into a temporary folder, copies only the skill folders you
named into `~/.claude/skills/`, and follows any setup procedure the skill has (for example
`telegram-notify`'s `install.mjs` checklist). Name no skills and it installs all of them. The
steps a person has to do — issuing a bot token, approving hook registration — are spelled out in
that skill's README.

### Telegram works after this one thing — try it

Leave the install to the agent; **the only thing a person makes is one bot token**, in this
order. Two minutes.

1. In Telegram, open **@BotFather**, send `/newbot`, pick a name — it gives you a token shaped
   like `123456789:AA...`
2. **Send the new bot any message** (a bot cannot open a conversation; this is how it learns
   where to write)
3. Hand the token to the agent:

```
Set up Telegram. Token: 123456789:AA...
```

The agent finds the chat id, saves it, and **sends a test message and confirms it reached your
phone**. Approve the hook registration and that is it — reports arrive while you are away, and
you give instructions by replying. For a first test, send the bot `?` from your phone: the list
of open sessions comes back.

**By hand,** copy a skill folder whole into a skills directory.

```bash
# for every project
cp -r skills/<skill-name> ~/.claude/skills/

# for one project only (this is the one to share with a team)
cp -r skills/<skill-name> <your-project>/.claude/skills/
```

Windows PowerShell:

```powershell
Copy-Item -Recurse skills\<skill-name> "$env:USERPROFILE\.claude\skills\"
```

From the next session on it appears in the skill list, and the agent loads it by itself when the
task calls for it. Usage and customisation are in each skill folder's README.

## How the skills are built

- **A priority ladder** — `SCOPE RULE → P0 (never) → P1 (design system) → P2 (implementation patterns) → P3 (QA)`. On conflict, the lower number wins.
- **Short body, details in `references/`** — `SKILL.md`, which the agent always reads, stays around 150 lines; values, code and recipes live in files opened only when needed.
- **No project dependencies** — nothing project-specific (paths to reusable components, storage keys, screen lists). That belongs in a separate skill made from `references/project-skill-template.md`.
- **Verifiable** — not "did you check?" but "does this command exit 0?".

## License

[MIT](LICENSE)
