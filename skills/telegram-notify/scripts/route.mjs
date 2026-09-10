#!/usr/bin/env node
// Which session a message is for.
//
// One bot, one chat, several agents running at once - one per project. They all read the same
// inbox, and the first one to stop took everything, so a message meant for another project was
// consumed by whichever agent happened to finish first and was never seen by the one it was for.
//
// The fix is the smallest thing that can work: give each project a number, and let the user put
// that number at the front of the message.
//
//     2 run the tests
//
// goes to project 2 and nowhere else. A message with no number goes to whoever reads it first,
// which is the right default when only one session is running - the common case, and the one
// that should not need a prefix. Send `?` to be told the numbers.
//
// Numbers are handed out in the order projects are first seen and never reused, so a number the
// user learned stays pointing at the same project.
//
//   node route.mjs           print the map, as the user is shown it
//   node route.mjs --json
//
// Node 18+, no dependencies.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

// Overridable so the behaviour can be exercised against a scratch directory rather than the
// real one - a test that has to write to ~/.claude to run is a test nobody runs.
const DIR = process.env.CLAUDE_TG_DIR || path.join(os.homedir(), '.claude', 'local');
const SESSIONS = path.join(DIR, 'tg-sessions.json');
const SPOOL = path.join(DIR, 'tg-spool.json');

const readJson = (file, fallback) => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
};

/** Written whole, via a temp file, because two sessions can be stopping at the same moment. */
const writeJson = (file, value) => {
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, file);
};

/**
 * A stable id for a project directory. Case and separators are normalised because the same
 * project reaches here as both `C:\...` and `c:/...` depending on who launched the agent, and
 * two ids for one project would mean two numbers for it.
 */
export const projectKey = (dir = process.cwd()) =>
    dir.replace(/[\\/:]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();

/** The last path segment, which is what the user calls the project. */
export const projectName = (dir = process.cwd()) => path.basename(dir) || dir;

/**
 * This project's number, assigning one if it has not been seen before.
 *
 * @param {string} [dir]
 * @returns {{n: number, fresh: boolean, list: {n: number, name: string}[]}}
 *          `fresh` is true only on the call that created the number - the one moment worth
 *          telling the user about, since the map they were shown is now out of date.
 */
export function register(dir = process.cwd()) {
    const key = projectKey(dir);
    const reg = migrate(readJson(SESSIONS, null) || { next: 1, byKey: {}, names: {} });
    let fresh = false;
    if (reg.byKey[key] == null) {
        reg.byKey[key] = reg.next++;
        fresh = true;
    }
    // Refreshed every time: a renamed folder should show under its new name.
    reg.names[key] = projectName(dir);
    writeJson(SESSIONS, reg);
    return { n: reg.byKey[key], fresh, list: listOf(reg) };
}

/**
 * Fold keys written by an earlier slug rule onto the current one, keeping the lower number.
 *
 * Without this a project that already had a number gets a second one the first time the rule
 * changes, and the user is looking at a list with the same folder in it twice - which is exactly
 * what the numbers exist to avoid. Applied on every read, so it is also the repair path if two
 * keys ever drift apart again.
 */
function migrate(reg) {
    reg.names = reg.names || {};
    const byKey = {}, names = {};
    for (const [raw, n] of Object.entries(reg.byKey || {})) {
        const key = raw.replace(/-+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
        if (byKey[key] == null || n < byKey[key]) byKey[key] = n;
        if (reg.names[raw]) names[key] = reg.names[raw];
    }
    reg.byKey = byKey;
    reg.names = names;
    reg.next = Math.max(1, ...Object.values(byKey).map(n => n + 1));
    return reg;
}

// ------------------------------------------------------------------------------------------
// Which of them is actually open.
//
// The register only grows: a project that took a number keeps it for ever, so after a few weeks
// the map is mostly places nobody is working. The user asked for the sessions open *now* - and a
// number pointing at one that closed days ago is worse than no number at all, because the message
// goes to the spool and waits for a session that is never coming back.
//
// Nothing has to register its liveness, because the harness already writes it down: every session
// keeps a transcript at ~/.claude/projects/<encoded cwd>/<session id>.jsonl and touches it as it
// works, so the newest mtime in a directory is when that project was last doing something. A
// session that dies leaves no state behind to clean up.

const PROJECTS = process.env.CLAUDE_PROJECTS_DIR || path.join(os.homedir(), '.claude', 'projects');

/** Minutes of silence after which a session is presumed gone. */
const LIVE_WINDOW_MIN = Number(process.env.CLAUDE_TG_LIVE_MIN || 30);

/**
 * A transcript directory name, folded onto the same key `projectKey` produces.
 *
 * The encoding puts one dash where each of `\`, `/` and `:` was, so `C:\Users\me\proj` becomes
 * `C--Users-me-proj` - two dashes where `projectKey` collapses a run of separators into one. Both
 * sides are folded here rather than one being decoded from the other, because the directory name
 * genuinely cannot be decoded: `-` also stands for itself inside project names, so
 * `...-Desktop-SmartRouter-main` is unsplittable. This is the same fold `migrate` applies, which
 * is why an old key and a new one meet in the middle instead of becoming two entries.
 */
const dirKey = (dir) => dir.replace(/-+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();

/**
 * How long ago each project was last active, keyed the way `projectKey` keys them.
 *
 * @returns {Map<string, number>} key -> minutes since its newest transcript was touched
 */
export function activity() {
    const out = new Map();
    let dirs = [];
    try { dirs = fs.readdirSync(PROJECTS, { withFileTypes: true }).filter(d => d.isDirectory()); } catch { return out; }
    for (const d of dirs) {
        let newest = 0;
        let files = [];
        try { files = fs.readdirSync(path.join(PROJECTS, d.name)); } catch { continue; }
        for (const f of files) {
            if (!f.endsWith('.jsonl')) continue;
            try {
                const { mtimeMs } = fs.statSync(path.join(PROJECTS, d.name, f));
                if (mtimeMs > newest) newest = mtimeMs;
            } catch { /* a file that vanished mid-scan is not activity */ }
        }
        if (!newest) continue;
        const key = dirKey(d.name);
        const age = Math.round((Date.now() - newest) / 60_000);
        // Two directories can fold onto one key; the livelier one is the answer for that project.
        if (!out.has(key) || age < out.get(key)) out.set(key, age);
    }
    return out;
}

const listOf = (reg, act) => Object.entries(reg.byKey || {})
    .map(([key, n]) => {
        const ageMin = act && act.has(key) ? act.get(key) : null;
        return { n, name: (reg.names || {})[key] || key, ageMin, live: ageMin != null && ageMin <= LIVE_WINDOW_MIN };
    })
    .sort((a, b) => a.n - b.n);

/** Every project that has ever registered, lowest number first, each marked open or not. */
export const list = () => listOf(migrate(readJson(SESSIONS, { byKey: {} })), activity());

/**
 * The map as the user reads it. Deliberately the shape they asked for: `1 name` per line.
 *
 * Closed sessions are **marked, not hidden**. Dropping them would renumber nothing - the numbers
 * are permanent - but it would silently remove a line the user may still be looking at, and a
 * number that vanishes between reading the map and typing it is the one failure this whole
 * mechanism exists to prevent. Shown greyed with its age, the same message reads as "that one is
 * not running", which is the fact they need.
 */
export const formatMap = (rows = list()) => {
    if (!rows.length) return 'No sessions have registered yet.';
    const age = (r) => r.ageMin == null ? '  (never run)' : r.live ? (r.ageMin <= 1 ? '' : `  (${r.ageMin}m ago)`) : '  (closed)';
    const body = rows.map(r => `${r.n} ${r.name}${age(r)}`).join('\n');
    return `Put the number first to pick a session:\n${body}\n\nNo number = whichever session stops first.`;
};

/** True for a message that is asking to be shown the map rather than saying something. */
export const isMapRequest = (text) => /^\s*[?？]\s*$/.test(text) || /^\s*(map|세션|목록)\s*$/i.test(text);

/**
 * Split a leading session number off a message.
 *
 * Only a bare number counts, and only with a separator after it, so "2 run the tests" is routed
 * and "2024 was when this started" is not.
 *
 * @param {string} text
 * @returns {{n: number|null, text: string}}
 */
export function parseRoute(text) {
    const m = /^\s*(\d{1,2})(?:\s+|[.:)]\s*)([\s\S]*)$/.exec(text || '');
    if (!m) return { n: null, text };
    return { n: Number(m[1]), text: m[2] };
}

// ------------------------------------------------------------------------------------------
// The spool.
//
// Telegram's `getUpdates` offset is a single monotonic acknowledgement for the whole bot - there
// is no way to ack one message and leave another waiting. So a session that reads the inbox has
// already taken everything in it, including other sessions' mail. Fetched messages therefore land
// here first, and each session takes only its own out of this file.

/** How long a message addressed to a session that never runs is kept before being dropped. */
const SPOOL_TTL_MS = 24 * 60 * 60 * 1000;

const LOCK = `${SPOOL}.lock`;

/**
 * Hold the spool for one read-modify-write.
 *
 * `writeJson` is atomic, which is not the same as safe: every spool operation reads the file,
 * decides, and writes it back, and two Stop hooks can end a turn in the same second. Both read
 * the same array, both write, and the second rename wins - so a message the first session already
 * took is back in the file and gets delivered a second time. Atomic writes cannot fix that; only
 * excluding the other reader can.
 *
 * `wx` fails when the file exists, which is the entire mechanism - no library, no daemon. A lock
 * older than the timeout belonged to a process that died holding it and is taken over, because a
 * crash must not silence the channel for ever.
 *
 * If it cannot be acquired at all, the work is done **unlocked** rather than skipped. The cost of
 * the race is a message arriving twice; the cost of refusing is a message never arriving, and
 * silence is the failure this whole skill exists to prevent.
 */
function withLock(fn, { tries = 40, staleMs = 60_000, waitMs = 25 } = {}) {
    for (let i = 0; i < tries; i++) {
        let held = false;
        try {
            fs.mkdirSync(path.dirname(LOCK), { recursive: true });
            fs.closeSync(fs.openSync(LOCK, 'wx'));
            held = true;
        } catch (e) {
            if (!e || e.code !== 'EEXIST') return fn();   // not a contention problem; do not stall on it
            try {
                if (Date.now() - fs.statSync(LOCK).mtimeMs > staleMs) fs.unlinkSync(LOCK);
            } catch { /* someone else cleared it first, which is the outcome we wanted */ }
        }
        if (held) {
            try { return fn(); } finally { try { fs.unlinkSync(LOCK); } catch { } }
        }
        // Busy-wait: this contends for milliseconds if at all, and a hook has no time to sleep.
        const until = Date.now() + waitMs;
        while (Date.now() < until) { /* spin */ }
    }
    return fn();
}

/** Add fetched messages to the spool, ignoring ones already in it. Returns the whole spool. */
export function spoolAdd(messages, now = Date.now()) {
    return withLock(() => {
        // Aged out here rather than on a timer: a message for a project that is not open today
        // would otherwise sit in the file for ever and arrive, out of nowhere, weeks later.
        const spool = readJson(SPOOL, []).filter(m => now - Date.parse(m.at || 0) < SPOOL_TTL_MS);
        const have = new Set(spool.map(m => m.updateId));
        for (const m of messages) if (!have.has(m.updateId)) spool.push(m);
        writeJson(SPOOL, spool);
        return spool;
    });
}

/**
 * Remove and return the messages this session should act on: the ones addressed to it, and the
 * ones addressed to nobody.
 *
 * The route prefix is stripped, so the agent is handed what the user actually wrote.
 *
 * @param {number} n this session's number
 */
export function spoolTake(n) {
    return withLock(() => {
        const spool = readJson(SPOOL, []);
        const taken = [], left = [];
        for (const m of spool) {
            const r = parseRoute(m.text);
            if (r.n === n) taken.push({ ...m, text: r.text });
            else if (r.n == null) taken.push(m);
            else left.push(m);
        }
        writeJson(SPOOL, left);
        return taken;
    });
}

/** Drop messages from the spool without acting on them. */
export function spoolDrop(pred) {
    return withLock(() => {
        const spool = readJson(SPOOL, []);
        const left = spool.filter(m => !pred(m));
        writeJson(SPOOL, left);
        return spool.length - left.length;
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const rows = list();
    if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 2));
    else console.log(formatMap(rows));
}
