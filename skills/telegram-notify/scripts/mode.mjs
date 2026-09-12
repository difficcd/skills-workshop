#!/usr/bin/env node
// Which channels the agent reports on.
//
// Three modes, because "notify me" means different things at different moments and the user is
// the only one who knows which. At the desk, a Telegram message is a buzz for something already
// on screen. Away from it, the terminal is a wall nobody is looking at.
//
//   1  terminal only        - never send. The user is here and watching
//   2  both                 - terminal in full, Telegram at the moments that matter
//   3  Telegram only        - keep the terminal terse and save the tokens; report by message
//
//   node mode.mjs           print the current mode
//   node mode.mjs 2         set it
//   node mode.mjs --json
//
// Stored beside the credentials, because it is a property of this machine and this user, not of
// any project. TG_MODE in the environment wins, so a single run can override without a write.
//
// Node 18+, no dependencies.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ENV_FILE = process.env.TG_ENV_FILE || join(homedir(), '.claude', 'local', 'telegram.env');

export const MODES = {
    1: { id: 1, terminal: 'full', telegram: false, name: 'terminal only' },
    2: { id: 2, terminal: 'full', telegram: true, name: 'both' },
    3: { id: 3, terminal: 'terse', telegram: true, name: 'telegram only' },
};

/** Default 2: the mode that fails safest. A message too many beats a user waiting on nothing. */
export const DEFAULT_MODE = 2;

const read = () => { try { return readFileSync(ENV_FILE, 'utf8'); } catch { return ''; } };

/** The mode in force. Environment first, then the file, then the default. */
export function mode() {
    const raw = process.env.TG_MODE || (read().match(/^\s*TG_MODE\s*=\s*['"]?(\d)/m) || [])[1];
    const n = Number(raw);
    return MODES[n] || MODES[DEFAULT_MODE];
}

/** True when this mode may send. `tg.mjs` and `report.mjs` both ask before doing anything. */
export const canSend = (m = mode()) => m.telegram;

/**
 * Write the mode into the credentials file, leaving everything else alone.
 *
 * Rewritten line by line rather than regenerated: the file holds a token, and regenerating it
 * from parsed values is how a token gets lost to a parsing bug.
 */
export function setMode(n) {
    const want = MODES[Number(n)];
    if (!want) throw new Error(`mode must be 1, 2 or 3 - got ${n}`);
    setKey('TG_MODE', String(want.id));
    return want;
}

/** One `KEY='value'` line in the credentials file, replaced in place or appended. */
export function setKey(key, value) {
    const text = read();
    const line = `${key}='${value}'`;
    const next = new RegExp(`^\\s*${key}\\s*=`, 'm').test(text)
        ? text.replace(new RegExp(`^\\s*${key}\\s*=.*$`, 'm'), line)
        : (text.trimEnd() + (text.trim() ? '\n' : '') + line + '\n');
    mkdirSync(dirname(ENV_FILE), { recursive: true });
    writeFileSync(ENV_FILE, next, { encoding: 'utf8', mode: 0o600 });
}

/** A key's value, environment first, then the file; undefined when set nowhere. */
export function getKey(key) {
    if (process.env[key] != null) return process.env[key];
    const m = read().match(new RegExp(`^\\s*${key}\\s*=\\s*['"]?([^'"\\r\\n]*)`, 'm'));
    return m ? m[1].trim() : undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const arg = process.argv.slice(2).find(a => /^[123]$/.test(a));
    const m = arg ? setMode(arg) : mode();
    if (process.argv.includes('--json')) { console.log(JSON.stringify(m)); process.exit(0); }
    console.log(`mode ${m.id} - ${m.name}`);
    console.log(`  terminal: ${m.terminal}`);
    console.log(`  telegram: ${m.telegram ? 'yes' : 'no'}`);
    if (arg) console.log(`  saved to ${ENV_FILE}`);
}
