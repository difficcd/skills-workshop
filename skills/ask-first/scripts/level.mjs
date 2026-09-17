#!/usr/bin/env node
// The question threshold: read it, set it, or print the one-line rule for it.
//
//   node level.mjs              -> "mid"
//   node level.mjs high|mid|low -> sets it, prints the rule
//   node level.mjs --rule       -> the one line the hook injects
//
// One JSON file under ~/.claude/local, so it is per machine and outside every repository.
// Node 18+, no dependencies.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DIR = process.env.CLAUDE_ASK_DIR || path.join(os.homedir(), '.claude', 'local');
export const FILE = path.join(DIR, 'ask-first.json');
export const LEVELS = /** @type {const} */ (['high', 'mid', 'low']);
export const DEFAULT = 'mid';

/** The rule for each level, as one line the agent can act on. */
export const RULES = {
    high: 'ask only when the readings lead to materially different work AND a wrong guess is expensive (deletes, sends, half an hour of rework); otherwise pick, say which, build.',
    mid: 'ask when the readings lead to materially different work; otherwise pick, say which, build.',
    low: 'ask whenever more than one reading exists (scope, placement, naming, format, audience) - but never what the code or the repo already answers.',
};

/** @returns {'high'|'mid'|'low'} */
export function getLevel() {
    try {
        const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        return LEVELS.includes(j.level) ? j.level : DEFAULT;
    } catch { return DEFAULT; }
}

/** @param {string} level */
export function setLevel(level) {
    if (!LEVELS.includes(/** @type {any} */ (level))) throw new Error(`level must be one of ${LEVELS.join(', ')}, not "${level}"`);
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ level, at: new Date().toISOString() }, null, 2) + '\n');
    fs.renameSync(tmp, FILE);
    return level;
}

/** The line the hook injects: level and rule together, so the agent needs no lookup. */
export const rule = (level = getLevel()) => `ask-first: level ${level} - ${RULES[level]}`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const arg = process.argv[2];
    if (!arg) { console.log(getLevel()); process.exit(0); }
    if (arg === '--rule') { console.log(rule()); process.exit(0); }
    try { console.log(rule(setLevel(arg))); } catch (e) { console.error(e.message); process.exit(2); }
}
