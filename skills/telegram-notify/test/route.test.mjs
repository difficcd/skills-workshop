// Routing and spooling, which is the part of this skill that can lose a message.
//
//   node --test skills/telegram-notify/test/
//
// CLAUDE_TG_DIR points the module at a scratch directory, so running the tests does not touch
// the real registry.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-route-'));
process.env.CLAUDE_TG_DIR = DIR;

// Liveness is read off transcript mtimes, so the tests need their own projects directory too -
// otherwise they would be reporting on whatever sessions happen to be open on the machine running
// them, and would pass or fail depending on that.
const PROJECTS = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-projects-'));
process.env.CLAUDE_PROJECTS_DIR = PROJECTS;

const route = await import('../scripts/route.mjs');

/** A fresh registry and an empty spool, so the tests do not depend on each other's leftovers. */
function reset(sessions) {
    fs.writeFileSync(path.join(DIR, 'tg-sessions.json'), JSON.stringify(sessions || { next: 1, byKey: {}, names: {} }));
    fs.writeFileSync(path.join(DIR, 'tg-spool.json'), '[]');
    for (const d of fs.readdirSync(PROJECTS)) fs.rmSync(path.join(PROJECTS, d), { recursive: true, force: true });
}

/**
 * A transcript for `dir`, last touched `ageMin` ago.
 *
 * `dir` is the encoded directory name the harness writes - one dash per separator, so `C:/work/beta`
 * becomes `C--work-beta`. Written in that form on purpose: folding that name back onto a project
 * key is the part of the liveness lookup that can be got wrong.
 */
function transcript(dir, ageMin) {
    const full = path.join(PROJECTS, dir);
    fs.mkdirSync(full, { recursive: true });
    const file = path.join(full, 'session.jsonl');
    fs.writeFileSync(file, '{"type":"x"}\n');
    const when = new Date(Date.now() - ageMin * 60_000);
    fs.utimesSync(file, when, when);
}

const at = () => new Date().toISOString();
const msg = (updateId, text) => ({ updateId, at: at(), text, chatId: 'c' });

// ---- parsing -------------------------------------------------------------------------------

test('a leading number picks a session and is stripped off', () => {
    for (const [input, n, rest] of [
        ['2 run the tests', 2, 'run the tests'],
        ['1. hello', 1, 'hello'],
        ['2:go', 2, 'go'],
        ['2) go', 2, 'go'],
        ['  3   spaced out', 3, 'spaced out'],
    ]) {
        assert.deepEqual(route.parseRoute(input), { n, text: rest }, input);
    }
});

test('a number that is part of the sentence is not a route', () => {
    // The failure this pins is the expensive direction: a message silently delivered to the
    // wrong session, or to a session that does not exist and so to nobody at all.
    for (const input of ['2024 was when this started', '2go', '100 files changed', 'go 2 sleep']) {
        assert.equal(route.parseRoute(input).n, null, input);
    }
});

test('an empty or missing message does not throw', () => {
    assert.deepEqual(route.parseRoute(''), { n: null, text: '' });
    assert.deepEqual(route.parseRoute(undefined), { n: null, text: undefined });
});

// ---- the registry --------------------------------------------------------------------------

test('a project keeps the number it was first given', () => {
    reset();
    const first = route.register('C:/work/alpha');
    route.register('C:/work/beta');
    const again = route.register('C:/work/alpha');
    assert.equal(again.n, first.n, 'alpha did not move');
    assert.equal(first.fresh, true, 'the first call reports the number is new');
    assert.equal(again.fresh, false, 'a later one does not');
});

test('the same project reached by a different spelling of its path is one entry', () => {
    // Windows hands the agent 'C:\\x' or 'c:/x' depending on who launched it. Two ids for one
    // project means the same folder listed twice, which is what the numbers exist to avoid.
    reset();
    const a = route.register('C:\\work\\alpha');
    const b = route.register('c:/work/alpha');
    assert.equal(b.n, a.n);
    assert.equal(route.list().length, 1);
});

test('keys written by an older slug rule fold onto the current one, keeping the number', () => {
    reset({ next: 3, byKey: { 'c--work-alpha': 1, 'c--work-beta': 2 }, names: {} });
    const a = route.register('C:/work/alpha');
    assert.equal(a.n, 1, 'alpha kept number 1 rather than being given a third');
    assert.equal(route.list().length, 2);
});

test('the map is one line per session, lowest number first', () => {
    reset();
    route.register('C:/work/beta');
    route.register('C:/work/alpha');
    const lines = route.formatMap().split('\n');
    const beta = lines.findIndex(l => l.startsWith('1 beta'));
    const alpha = lines.findIndex(l => l.startsWith('2 alpha'));
    assert.ok(beta >= 0, '1 beta is listed');
    assert.ok(alpha >= 0, '2 alpha is listed');
    assert.ok(beta < alpha, 'lowest number first');
});

// ---- which of them is open -----------------------------------------------------------------

test('a session is open, closed or never run, and all three are shown', () => {
    // The register only grows, so without this the map fills up with places nobody is working and
    // a number can point at a session that ended days ago - the message then sits in the spool
    // waiting for something that is never coming back.
    reset();
    route.register('C:/work/open');
    route.register('C:/work/gone');
    route.register('C:/work/never');
    transcript('C--work-open', 0);
    transcript('C--work-gone', 5000);

    const rows = route.list();
    const by = (name) => rows.find(r => r.name === name);
    assert.equal(by('open').live, true, 'touched just now');
    assert.equal(by('gone').live, false, 'silent for days');
    assert.equal(by('never').live, false, 'no transcript at all');
    assert.equal(by('never').ageMin, null, 'never run is not an age of zero');

    const lines = route.formatMap(rows).split('\n');
    assert.ok(lines.some(l => l.startsWith('1 open') && !l.includes('closed')));
    assert.ok(lines.some(l => l.startsWith('2 gone') && l.includes('closed')));
    assert.ok(lines.some(l => l.startsWith('3 never') && l.includes('never run')));
    // Marked, never dropped: a line vanishing between reading the map and typing a number is the
    // one failure the numbers exist to prevent.
    assert.equal(rows.length, 3);
});

test('liveness folds the doubled separators in a transcript directory name onto the project key', () => {
    // `C:/work/x` keys as `c-work-x`, but its transcript directory is `C--work-x`. Miss the fold
    // and every session looks closed, which is worse than not marking them at all.
    reset();
    route.register('C:/work/x');
    transcript('C--work-x', 0);
    assert.equal(route.list()[0].live, true);
    assert.equal(route.activity().get('c-work-x'), 0);
});

// ---- the lock around the spool -------------------------------------------------------------

test('the lock is released, so the next operation is not blocked by the last', () => {
    reset();
    const lock = path.join(DIR, 'tg-spool.json.lock');
    route.spoolAdd([msg(1, 'hello')]);
    assert.equal(fs.existsSync(lock), false, 'no lock left behind after a successful add');
    assert.deepEqual(route.spoolTake(1).map(m => m.text), ['hello']);
    assert.equal(fs.existsSync(lock), false, 'nor after a take');
});

test('a lock left by a process that died is taken over rather than waited on for ever', () => {
    // Every spool operation is a read, a decision, and a write back. Two Stop hooks ending in the
    // same second both read the same array and the second write wins, so a message one session
    // already took reappears and is delivered twice. The lock is what excludes that - which means
    // a crash while holding it must not be able to silence the channel.
    reset();
    const lock = path.join(DIR, 'tg-spool.json.lock');
    fs.writeFileSync(lock, '');
    const old = new Date(Date.now() - 10 * 60_000);
    fs.utimesSync(lock, old, old);

    route.spoolAdd([msg(1, 'still gets through')]);
    assert.deepEqual(route.spoolTake(1).map(m => m.text), ['still gets through']);
    assert.equal(fs.existsSync(lock), false, 'the stale lock is gone, not inherited');
});

// ---- the spool -----------------------------------------------------------------------------

test('a session takes its own mail and leaves everyone else theirs', () => {
    // This is the whole point: before the spool, whichever session stopped first acknowledged the
    // inbox for the entire bot, and the other project's message was gone without being seen.
    reset();
    route.spoolAdd([msg(1, '1 for my-app'), msg(2, '2 for other-app'), msg(3, 'for anyone')]);

    const two = route.spoolTake(2);
    assert.deepEqual(two.map(m => m.text), ['for other-app', 'for anyone']);

    const one = route.spoolTake(1);
    assert.deepEqual(one.map(m => m.text), ['for my-app'], 'still there after session 2 ran');
});

test('a message is delivered once, not to every session', () => {
    reset();
    route.spoolAdd([msg(1, 'unaddressed')]);
    assert.equal(route.spoolTake(1).length, 1);
    assert.equal(route.spoolTake(2).length, 0, 'the second session finds nothing');
});

test('the same update arriving twice is spooled once', () => {
    // Two sessions can both fetch before either acknowledges, so the same update really does
    // arrive twice - and delivered twice it reads as the user repeating themselves.
    reset();
    route.spoolAdd([msg(7, 'hello')]);
    route.spoolAdd([msg(7, 'hello')]);
    assert.equal(route.spoolTake(1).length, 1);
});

test('mail for a session that never runs is dropped rather than kept for ever', () => {
    reset();
    const old = { updateId: 1, at: new Date(Date.now() - 25 * 3600e3).toISOString(), text: '9 stale' };
    route.spoolAdd([old]);
    route.spoolAdd([msg(2, '9 fresh')]);
    assert.deepEqual(route.spoolTake(9).map(m => m.text), ['fresh']);
});

test('a request for the map is recognised, and ordinary text is not', () => {
    for (const t of ['?', ' ? ', 'map', 'MAP', '세션', '목록']) assert.ok(route.isMapRequest(t), t);
    for (const t of ['?why', 'map the project', 'what?', '']) assert.ok(!route.isMapRequest(t), t);
});
