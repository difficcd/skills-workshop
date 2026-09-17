#!/usr/bin/env node
// Register (or remove) the UserPromptSubmit hook that states the level on every prompt.
//
//   node install.mjs --on      merge the hook into ~/.claude/settings.json
//   node install.mjs --off     remove exactly that hook, nothing else
//   node install.mjs           say whether it is on
//
// The settings file is read, one hook entry is added or removed, and the rest is written back
// as it was. Existing hooks on the same event are kept. A settings file that does not parse is
// left alone and reported, because overwriting it would silently disable every setting in it.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SETTINGS = process.env.CLAUDE_SETTINGS_FILE || path.join(os.homedir(), '.claude', 'settings.json');
const MARK = 'prompt-hook.mjs';

const command = () => `node "${path.join(HERE, MARK).replace(/\\/g, '/')}"`;

/** @param {any} settings */
export function isOn(settings) {
    return JSON.stringify(settings?.hooks?.UserPromptSubmit || '').includes(MARK);
}

/** @param {any} settings  @returns {any} the same object, with the hook present once */
export function withHook(settings) {
    const s = settings || {};
    s.hooks = s.hooks || {};
    const list = (s.hooks.UserPromptSubmit = s.hooks.UserPromptSubmit || []);
    if (!isOn(s)) list.push({ hooks: [{ type: 'command', command: command(), timeout: 10 }] });
    return s;
}

/** @param {any} settings  @returns {any} the same object, with the hook gone and nothing else changed */
export function withoutHook(settings) {
    const s = settings || {};
    const list = s.hooks?.UserPromptSubmit;
    if (!Array.isArray(list)) return s;
    s.hooks.UserPromptSubmit = list
        .map(e => ({ ...e, hooks: (e.hooks || []).filter(h => !String(h.command || '').includes(MARK)) }))
        .filter(e => e.hooks.length);
    if (!s.hooks.UserPromptSubmit.length) delete s.hooks.UserPromptSubmit;
    return s;
}

function read() {
    let text = '';
    try { text = fs.readFileSync(SETTINGS, 'utf8'); } catch { return {}; }
    return JSON.parse(text);   // throws on a broken file - the caller reports and stops
}

function write(settings) {
    fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
    fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const arg = process.argv[2];
    let settings;
    try { settings = read(); } catch (e) {
        console.error(`${SETTINGS} does not parse (${e.message}). Fix it by hand; nothing was written.`);
        process.exit(2);
    }
    if (arg === '--on') { write(withHook(settings)); console.log('ask-first hook on: the level is stated on every prompt'); }
    else if (arg === '--off') { write(withoutHook(settings)); console.log('ask-first hook off'); }
    else console.log(isOn(settings) ? 'on' : 'off');
}
