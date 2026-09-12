---
name: monotone-accent-ui
description: Dark/light UI system built on neutral surfaces plus one accent colour. LOAD WHEN — creating or changing a UI component; CSS/style/layout changes; changing interaction behaviour; popups, modals, toasts; form or input changes; theme/dark-mode support; any "make it more visible / stand out" request. DO NOT LOAD — backend-only work, API/schema-only work, algorithms, data migrations with no UI change, documentation work.
---

# Neutral surfaces + one accent

Rules take priority **P0 → P3**. On conflict, the lower number always wins.
Values and implementation code live in `references/`. **Open only what you need** (do not read all of it).

---

## SCOPE RULE — before every other rule

- Change **only the surfaces the request needs**. Do not opportunistically redesign neighbouring UI.
- When the request names a location, **keep the existing layout** unless a structural move is genuinely required.
- "Add one button" does not come with spacing cleanup, radius unification, colour improvements or mobile fixes.
- If an animation, geometric placement or reference-image request **reads two or more ways, do not guess** — ask, or offer two or three variants.

---

## P0 — never (above design quality)

| # | Rule | What breaks |
|---|---|---|
| 0-1 | **Never delete or overwrite existing data.** Before a destructive action (reset, clean-up, bulk move) take a snapshot and show an `Undo N` button in the same place | The user's records are gone |
| 0-2 | **Never build a standing two-way mirror.** A structure that wipes and regenerates the target every time the source changes keeps overwriting what the user fixed on the target side → **add once, on the click**, leave existing items alone (block duplicates by id or text) | Edits keep reverting |
| 0-3 | **No native browser UI**: `prompt/alert/confirm`, `<select>`, `input[type=number\|date\|time\|color\|checkbox]`, textarea resize handles | Theme collapse + per-platform behaviour |
| 0-4 | **Never break an existing interaction.** Check that a new handler, overlay or gesture does not swallow existing clicks, focus or drags | Silent regression |
| 0-5 | **No unrequested redesign** (SCOPE RULE) | Lost trust + unreviewable diff |
| 0-6 | **Commit or back up** before a structural change or data migration | Cannot be undone |

---

## P1 — the design system (values)

**One line**: every surface is neutral; emphasis is the one accent and nothing else. Do not add colours to distinguish things — distinguish by **intensity, size and border**.

- Do not introduce primaries (green = success, red = danger). Danger is solid accent too.
- Text and icons on an accent background are **always `var(--accent-contrast)`** (never a hard-coded `#fff`). It is computed from luminance → `references/theme.js`
- **No dark-only colours**: `rgba(255,255,255,0.05)` vanishes in light → `color-mix(in srgb, var(--text-main) 5%, transparent)`
- The full token set (dark/light palettes + 8 accent colours) → `references/tokens.css`

### "Make it more visible" means raise size, contrast, border or intensity
It does **not** mean change the colour to red. The answer is always a solid accent background + `--accent-contrast` text, or an accent border.

### The accent-intensity ladder — `color-mix(in srgb, var(--accent-color) N%, transparent)`

| N | Use |
|---|---|
| 4–8% | block / section background tint |
| 12–16% | icon-chip background, **selected row** background |
| 20–26% | count badge, intermediate progress step |
| 30–45% | emphasised border (30%), dashed border · add button (45%) |
| 55–70% | strong border |
| **100% solid + `--accent-contrast`** | the **end point** of active / selected / emphasised. UI whose purpose is emphasis starts here |

8–14% translucency is background only. Used for emphasis, the feedback "I can't see it" always comes back.

### Scales

| Axis | Values |
|---|---|
| radius | `50%` circles · `6–8px` small controls / inputs · `10–12px` inner blocks · `14–16px` emphasised blocks · `18–22px` panels · `999px` pills |
| font-size | `0.62–0.68rem` badges / meta · `0.7–0.78rem` secondary labels · `0.8–0.86rem` body · `0.9–1.05rem` card titles · `1.15rem+` section titles |
| font-weight | `600` body emphasis · `700` labels · `800` default headings · `900` badges / numbers (no thin weights) |
| gap | `0.3–0.4rem` icon + text · `0.5–0.6rem` items in a row · `0.7–1rem` blocks |
| padding | mini control `0.26rem 0.62rem` · default button `0.5rem 1.1rem` · card `1.1–1.3rem` · section `1.75rem` |
| icons | `10–13` inline / badge · `14–16` button · `17–18` section header · `20–24` hero |
| transition | `all 0.2s` default, `0.15s` fine |
| numbers | `fontVariantNumeric: 'tabular-nums'` |

Finished per-component styles (button, pill, badge, panel, selected / drop states) → `references/recipes.md`

### Screen composition (UX)

When building a new screen, block or flow, keep the five below and open `references/ux-patterns.md` for the concrete patterns.

1. **"Now" is a first-class citizen** — today, the current time, what is imminent go at the top of the first screen. Ahead of any saved scroll or selection.
2. **Separate collect → act → archive** — an inbox you write to any time, an action area holding only today's items, an archive where the past accumulates. The user only moves things.
3. **Every block is a self-sufficient card** — each card carries its own add input and actions. Never send the user to another screen.
4. **Move or archive instead of delete** — take destructive actions out of the main path (send to yesterday, archive, hide).
5. **The empty state tells the next action** — not "no data" but "press ★ to pick today's tasks".

---

## P2 — implementation patterns

The full **Rule / USE / implementation / WHY** of each item is in `references/recipes.md`. This is only the index.

| Situation | Rule (one line) |
|---|---|
| Popups, date and time pickers | body portal + `position: fixed` + viewport correction. Clipped by an ancestor's `overflow` is a bug |
| Confirmation dialogs | inline two-step — first click shows solid accent `Delete?`, second click executes |
| Numeric input | `type="text" inputMode="numeric"` + digits-only filter. Spinners, wheel and ↑↓ change the value silently |
| Drag | drag state in `useState` remounts an inline component and the drag breaks → `useRef` + direct DOM style |
| Gesture start | `if (e.target.closest('button, a, input')) return;` — otherwise it swallows the child button's click |
| Inline-edit keys | the same item rendered in two lists opens two editors under `id` alone → `` `${listKind}:${id}` `` |
| Multi-select | Shift = range (visible order, anchor kept) · Ctrl/Cmd = toggle · Esc = clear · a drop inside the group is ignored |
| Text input | auto height from content (scrollHeight), kept after reload |
| Rapid entry | Enter adds and keeps the input (repeat), Esc cancels, blur commits what was being typed |
| Anything that appears by itself | every auto-shown thing gets a suppress option ("not again today") |
| Remembered state | save view mode, selection, scroll — but on a screen with a time axis, **the current point (today, now)** wins over the saved value |
| Periodic reset | once on mount + every 60 s + on tab return, check the boundary (date etc.). Same interval → do not even call the save function (zero writes). First run records the reference value only and leaves existing data alone |
| Layout | labels that must not break mid-word (CJK, compounds) `nowrap`, button groups `flexWrap`, grid children `min-width: 0`, wide tables `overflow-x: auto` |
| Accessibility | interactive hit area ≥ 24px, focus ring is an accent outline, respect `prefers-reduced-motion` |

---

## P3 — QA (runnable verification)

**Run before finishing. Every count must be 0.**

```bash
node references/verify.mjs src    # anywhere (Node is enough)
bash references/verify.sh  src    # bash environments
```

Either one. If neither script can run, run the greps directly.

```bash
grep -rn "prompt(\|alert(\|confirm(" src/ --include=*.jsx --include=*.tsx   # 0
grep -rn 'type="number"\|type="date"\|type="time"\|type="checkbox"' src/    # 0
grep -rn "<select" src/ --include=*.jsx --include=*.tsx                     # 0
grep -rn "rgba(255, *255, *255" src/ --include=*.jsx --include=*.tsx        # 0 (dark-only colour)
grep -rn "color: *'#fff'\|color: *\"#fff\"" src/                            # 0 (must be --accent-contrast)
```

**Check by eye (cannot be automated)**

1. No wrapping or clipping at narrow widths
2. The longest label (translations, CJK included) does not break a button
3. **Both light and dark** are right
4. The result is not hidden off-scroll, collapsed, clipped by `maxHeight`, or on an unrendered path
5. Entry, exit, display and recovery of every new state are all defined
6. Does the same defect exist on another surface — did you fix the **category**, not the instance (the greps above catch this)

---

## references/

Files inside this skill folder. The path is `<folder of this SKILL.md>/references/…`.

| File | When to open |
|---|---|
| `tokens.css` | seeding the system into a new project (copy-paste) |
| `theme.js` | building the accent-contrast computation and theme application |
| `recipes.md` | actually drawing a component (RULE / USE / implementation / WHY) |
| `ux-patterns.md` | **designing a screen or flow** — dashboard composition, the three time zones, collect → today, global search, empty-state copy |
| `verify.mjs` / `verify.sh` | the P0 · P3 check before finishing |
| `project-skill-template.md` | making a separate skill for project-specific rules |

Project-specific facts (paths to reusable components, screen lists, storage keys, domain state) **do not go in this skill.**
Copy `references/project-skill-template.md` into a separate `<project>-ui` skill, and delegate to this one rather than repeating it.
