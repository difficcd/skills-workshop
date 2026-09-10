#!/usr/bin/env node
// A short, fixed-shape status report.
//
// The question this answers is not "what did you do" - it is **"is this session still alive, and
// on what?"** A free-text update cannot answer that: an agent can write "still working on it" while
// nothing has moved for an hour, and it reads exactly like one where everything is fine.
//
// So the shape is fixed and half of it is not written by the agent at all. The clock, the branch,
// the last commit and its age, and the count of uncommitted files are read from the machine. Two
// reports side by side then say whether anything actually happened between them, whatever the
// prose claims.
//
//   node report.mjs --now "writing tests" --done "retry logic" --next "refactor checkout"
//   node report.mjs --blocked "signing key password needed"
//   node report.mjs --now "building" --dry        # print, do not send
//
// Every field is optional. With none, it still sends the machine-read half, which is enough to
// tell a live session from a stopped one.

import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';
import { credentials, send } from './tg.mjs';
import { mode, canSend } from './mode.mjs';

const flag = (name) => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : '';
};
const has = (name) => process.argv.includes(`--${name}`);

/** Never let a missing git, or a directory that is not a repo, turn a report into a crash. */
const git = (...args) => {
    try {
        return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch { return ''; }
};

/**
 * Line labels. Korean by default because that is this skill's voice; `TG_LANG=en` switches it.
 *
 * Worth having rather than hard-coding: the labels are the only part of the output a reader has
 * to understand, and a status report nobody can read is worse than none. Declared above the first
 * use because `context` takes it as a default argument, and a const is not hoisted.
 */
export const LABELS = {
    ko: { now: '지금', done: '직전', next: '다음', blocked: '막힘', uncommitted: '미커밋', unit: { m: '분', h: '시간', d: '일' }, ago: (n, u) => `${n}${u} 전`, just: '방금' },
    en: { now: 'now', done: 'done', next: 'next', blocked: 'blocked', uncommitted: 'uncommitted', unit: { m: 'm', h: 'h', d: 'd' }, ago: (n, u) => `${n}${u} ago`, just: 'just now' },
};

export const lang = () => (String(process.env.TG_LANG || 'ko').toLowerCase().startsWith('en') ? 'en' : 'ko');

const ago = (iso, L = LABELS[lang()]) => {
    if (!iso) return '';
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return L.just;
    if (mins < 60) return L.ago(mins, L.unit.m);
    const hours = Math.round(mins / 60);
    return hours < 48 ? L.ago(hours, L.unit.h) : L.ago(Math.round(hours / 24), L.unit.d);
};

/** What the machine says, as against what the agent says. */
export function context(cwd = process.cwd(), L = LABELS[lang()]) {
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
    const subject = git('log', '-1', '--format=%s');
    const when = git('log', '-1', '--format=%cI');
    const dirty = git('status', '--porcelain');
    return {
        project: basename(git('rev-parse', '--show-toplevel') || cwd),
        branch,
        commit: subject ? `${subject.slice(0, 60)} (${ago(when, L)})` : '',
        dirty: dirty ? dirty.split('\n').filter(Boolean).length : 0,
    };
}

const clock = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/**
 * The report, as text.
 *
 * Kept to a handful of lines on purpose: this is read on a lock screen. A line is omitted rather
 * than printed empty, so what is there is always information.
 */
export function format({ now, done, next, blocked, note }, ctx = context(), at = new Date(), L = LABELS[lang()]) {
    // The one glyph that changes: a blocked report has to be distinguishable at a glance, from
    // the notification preview alone, without opening anything.
    const head = `${blocked ? '🔴' : '🟢'} ${ctx.project || 'session'} · ${clock(at)}`;
    const lines = [head];
    if (now) lines.push(`${L.now}: ${now}`);
    if (done) lines.push(`${L.done}: ${done}`);
    if (next) lines.push(`${L.next}: ${next}`);
    if (blocked) lines.push(`${L.blocked}: ${blocked}`);
    if (note) lines.push(note);
    // The machine-read line, always last and always present. Two reports differing only here
    // still prove the session moved; two identical ones prove it did not.
    const state = [
        ctx.branch && `⎇ ${ctx.branch}`,
        ctx.commit && `● ${ctx.commit}`,
        ctx.dirty ? `${L.uncommitted} ${ctx.dirty}` : '',
    ].filter(Boolean).join(' · ');
    if (state) lines.push(state);
    return lines.join('\n');
}

if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
    const text = format({
        now: flag('now'),
        done: flag('done'),
        next: flag('next'),
        blocked: flag('blocked'),
        note: flag('note'),
    });

    if (has('dry')) { console.log(text); process.exit(0); }

    // Same rule as tg.mjs: mode 1 prints instead of sending. The report is still built, so the
    // machine-read line is in the terminal too and the agent has not skipped the discipline.
    if (!canSend()) { console.log(`[mode ${mode().id}] not sent:`); console.log(text); process.exit(0); }

    const creds = credentials();
    if (!creds.token || !creds.chat) {
        console.error('telegram is not set up on this machine.');
        console.error('run: node <skill>/scripts/tg-setup.mjs <bot token>');
        console.error('--- the report would have been ---');
        console.error(text);
        process.exit(2);
    }
    const r = await send(text, creds);
    if (!r.ok) { console.error(r.status); process.exit(1); }
    console.log(r.status);
}
