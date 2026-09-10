#!/usr/bin/env node
// A short, fixed-shape status report.
//
// The question this answers is not "what did you do" - it is **"is this session still alive, and
// on what?"** A free-text update cannot answer that: an agent can write "작업 중입니다" while
// nothing has moved for an hour, and it reads exactly like one where everything is fine.
//
// So the shape is fixed and half of it is not written by the agent at all. The clock, the branch,
// the last commit and its age, and the count of uncommitted files are read from the machine. Two
// reports side by side then say whether anything actually happened between them, whatever the
// prose claims.
//
//   node report.mjs --now "게이트 돌리는 중" --done "#150 머지" --next "#137 충돌 해결"
//   node report.mjs --blocked "토큰 없음 - BotFather 토큰 필요"
//   node report.mjs --now "빌드" --dry            # print, do not send
//
// Every field is optional. With none, it still sends the machine-read half, which is enough to
// tell a live session from a stopped one.

import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';
import { credentials, send } from './tg.mjs';

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

const ago = (iso) => {
    if (!iso) return '';
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return '방금';
    if (mins < 60) return `${mins}분 전`;
    const hours = Math.round(mins / 60);
    return hours < 48 ? `${hours}시간 전` : `${Math.round(hours / 24)}일 전`;
};

/** What the machine says, as against what the agent says. */
export function context(cwd = process.cwd()) {
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
    const subject = git('log', '-1', '--format=%s');
    const when = git('log', '-1', '--format=%cI');
    const dirty = git('status', '--porcelain');
    return {
        project: basename(git('rev-parse', '--show-toplevel') || cwd),
        branch,
        commit: subject ? `${subject.slice(0, 60)} (${ago(when)})` : '',
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
export function format({ now, done, next, blocked, note }, ctx = context(), at = new Date()) {
    // The one glyph that changes: a blocked report has to be distinguishable at a glance, from
    // the notification preview alone, without opening anything.
    const head = `${blocked ? '🔴' : '🟢'} ${ctx.project || 'session'} · ${clock(at)}`;
    const lines = [head];
    if (now) lines.push(`지금: ${now}`);
    if (done) lines.push(`직전: ${done}`);
    if (next) lines.push(`다음: ${next}`);
    if (blocked) lines.push(`막힘: ${blocked}`);
    if (note) lines.push(note);
    // The machine-read line, always last and always present. Two reports differing only here
    // still prove the session moved; two identical ones prove it did not.
    const state = [
        ctx.branch && `⎇ ${ctx.branch}`,
        ctx.commit && `● ${ctx.commit}`,
        ctx.dirty ? `미커밋 ${ctx.dirty}` : '',
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
