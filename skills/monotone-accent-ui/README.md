# monotone-accent-ui

A UI system that carries dark and light together on neutral surfaces plus **one accent
colour**, packaged as a **skill** Claude Code / the Claude Agent SDK can run.
Korean: [README.ko.md](README.ko.md).

What sets it apart from the usual "make it clean" guidance is that **every criterion is a number
or a command that can be run.**

- `12–16%` is a selection background; `100% solid` is the end of the emphasis ladder
- "make it more visible" = raise size, contrast, border or intensity — not change the colour
- `node verify.mjs src` → passes at zero violations

Beyond colours and components it covers **how screens are composed** (`ux-patterns.md`): putting
"now" on the first screen, the collect → today → archive flow, three-period time sections, a
command-palette-style global search, how to write empty-state copy. It is the structure a
dashboard-style app used daily converged on.

Bugs that actually shipped — **why a drag stutters**, **why an input reverts** — are promoted to
rules alongside the colour and spacing ones.

---

## Install

**Copy the `skills/monotone-accent-ui` folder whole into a skills directory.** No build, no
package.

```bash
# for every project
cp -r skills/monotone-accent-ui ~/.claude/skills/

# for this project only (this is the one to share with a team — it is committed to the repo)
cp -r skills/monotone-accent-ui <your-project>/.claude/skills/
```

Windows PowerShell:

```powershell
Copy-Item -Recurse skills\monotone-accent-ui "$env:USERPROFILE\.claude\skills\"
```

From the next session on it appears in the list, and the agent loads it by itself for UI work.
To call it directly: `/monotone-accent-ui`.

On an existing codebase, start with the violations (Node 16+, no dependencies):

```bash
node ~/.claude/skills/monotone-accent-ui/references/verify.mjs src
```

---

## Layout

```
skills/monotone-accent-ui/
├── SKILL.md                      # what the agent always reads (about 140 lines)
├── README.md · README.ko.md      # this document, English and Korean
└── references/                   # opened only when needed
    ├── tokens.css                # tokens + base component CSS (copy-paste)
    ├── theme.js                  # accent contrast colour computed automatically · theme application
    ├── recipes.md                # 14 components (RULE / USE / implementation / WHY)
    ├── ux-patterns.md            # 13 screen-composition and flow patterns (dashboard, three time periods, collect → today, global search …)
    ├── verify.mjs                # violation checker (Node, cross-platform)
    ├── verify.sh                 # the same check in bash
    └── project-skill-template.md # skeleton for a project-specific skill
```

`SKILL.md` is a **priority ladder**. On conflict the lower number always wins.

| Tier | Content | Nature |
|---|---|---|
| **SCOPE RULE** | Change only the surface that was asked for. Never redesign adjacent UI on your own | at the top because it is where an agent most easily does damage |
| **P0** | no data loss or overwrite, no native UI, existing interactions preserved | above design quality |
| **P1** | monotone + one accent, contrast colour computed, the intensity ladder, scales | the design system |
| **P2** | portal popovers, drag, edit-key scope, auto height, multi-select | implementation patterns |
| **P3** | the check script + six things to look at by eye | QA |

---

## What it attaches to

- **Framework**: examples are React, but the rules are about the DOM. They apply as-is to Vue,
  Svelte, Astro and vanilla (the checker looks at `.jsx .tsx .js .ts .vue .svelte .astro` by
  default — `--ext` changes that).
- **Styling**: CSS variables only. Works with inline styles, CSS Modules, or Tailwind (map the
  tokens in `theme.extend`).
- **Theme switching**: `tokens.css` supports **all three** — a `data-theme` attribute, a
  `.theme-light` class, and following the OS setting. Keep the one you use and delete the rest.
- **Fonts**: system stack by default. Put the project font at the front of `--font-body`.
- **Language**: the layout rules are written for labels that must not break mid-word (CJK,
  compounds); nothing else depends on language.

---

## Customising

- **Palette**: replace only the values in `:root` and the light block of `references/tokens.css`.
- **Accent choices**: `POINT_COLORS` in `references/theme.js`.
- **Contrast threshold**: the `0.62` in `contrastOn()`. Lower it a little if your accents run bright.
- **Scales**: the P1 table in `SKILL.md`. On a project already running, tally the values in
  actual use and overwrite the table with them:

```bash
grep -rhoE "borderRadius: '[^']+'" src | sort | uniq -c | sort -rn | head
```

- **More checks**: add one `{ label, re, fix }` line to the `CHECKS` array in `verify.mjs`.
  A deliberate exception is skipped when the line ends with `// ui-ok: <reason>`.

---

## Project-specific rules live elsewhere

Paths to reusable components, storage keys, screen lists — none of that goes into this skill.
The moment it does, the skill stops working in other projects.

```
monotone-accent-ui   (global)    principles · values · patterns · verification
        ↓
<project>-ui         (project)   reusable assets · screen list · storage keys · domain rules
        ↓
     the actual components
```

Copy `references/project-skill-template.md` and fill it in. **Delegate, do not duplicate** —
the same rule in two places leaves the agent unsure which one to follow.

---

## License

[MIT](../../LICENSE)
