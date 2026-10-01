// Telling a real stop from a session yielding for a moment.
//
// The Stop hook runs every time the agent hands control back. That is not the same as the agent
// having finished: a background Monitor or task wakes the session seconds later, it works some
// more, and hands back again. Each of those is a Stop, so a single stretch of work reported
// itself three times - "멈춤 여러번온다 안멈췄는데". From inside the hook the two are
// indistinguishable, because the difference is entirely in what happens *after* it runs.
//
// So the report is deferred rather than decided. The hook writes a marker and leaves; a waiter
// checks back once the dust has settled and sends only if the session really did go quiet.
// Two things cancel it, and between them they cover both ways a stop turns out not to be one:
//
//   - a newer marker, which means the session stopped again, and that stop owns the report now
//   - the transcript growing, which means the session was woken and is working again
//
// The transcript is what makes this cheap. Claude Code appends to it as the session runs and
// hands the hook its path, so "did anything happen after I stopped?" is one stat() - no extra
// hook on every tool call, nothing to keep in sync.
//
// The cost is that a genuine stop is reported QUIET_MS late. That is the right trade: a report
// that arrives a minute late is still a report, and three reports for one stop taught the
// reader to ignore all of them.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** How long the session has to stay quiet before a stop counts as a stop. */
export const QUIET_MS = Number(process.env.TG_QUIET_MS || 75_000);

const DIR = process.env.CLAUDE_TG_DIR || path.join(os.homedir(), '.claude', 'local');

/** The marker for one project, named as route.mjs names its per-project files. */
export function markerPath(key) {
    return path.join(DIR, `stop-${String(key || 'default').replace(/[^\w.-]+/g, '_')}.json`);
}

/**
 * The size of the transcript right now, or null when there is nothing to read.
 *
 * Size rather than mtime: a file can be touched without being appended to, and on Windows the
 * mtime of an open, actively written file is not always flushed when we look. Bytes only ever
 * grow while a session runs, so a larger file is activity and nothing else is.
 *
 * @param {string|null|undefined} file
 * @returns {number|null}
 */
export function transcriptSize(file) {
    if (!file) return null;
    try { return fs.statSync(file).size; } catch { return null; }
}

/**
 * Whether a deferred stop report should still be sent.
 *
 * @param {{token: string, size: number|null} | null} mine the marker this waiter wrote
 * @param {{token: string} | null} current what is on disk now
 * @param {number|null} sizeNow the transcript's size at the moment of asking
 * @returns {boolean}
 */
export function stillStopped(mine, current, sizeNow) {
    if (!mine || !current) return false;
    // A later stop wrote over us. That stop has its own waiter, and it knows about work this one
    // never saw, so the report is its to send.
    if (mine.token !== current.token) return false;
    // The transcript grew: something woke the session after it stopped. Whatever it is doing, it
    // is not stopped, and it will run this hook again when it really is.
    if (mine.size !== null && sizeNow !== null && sizeNow > mine.size) return false;
    return true;
}

/** @param {string} key @param {object} marker */
export function writeMarker(key, marker) {
    try {
        fs.mkdirSync(DIR, { recursive: true });
        fs.writeFileSync(markerPath(key), JSON.stringify(marker));
        return true;
    } catch { return false; }
}

/** @param {string} key @returns {object|null} */
export function readMarker(key) {
    try { return JSON.parse(fs.readFileSync(markerPath(key), 'utf8')); } catch { return null; }
}

/** Remove a marker once its report has gone out, so a stale one cannot be re-sent. */
export function clearMarker(key) {
    try { fs.unlinkSync(markerPath(key)); } catch { }
}
