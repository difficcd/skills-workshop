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
const route = await import('../scripts/route.mjs');

/** A fresh registry and an empty spool, so the tests do not depend on each other's leftovers. */
function reset(sessions) {
    fs.writeFileSync(path.join(DIR, 'tg-sessions.json'), JSON.stringify(sessions || { next: 1, byKey: {}, names: {} }));
    fs.writeFileSync(path.join(DIR, 'tg-spool.json'), '[]');
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
    assert.ok(lines.some(l => l === '1 beta'));
    assert.ok(lines.some(l => l === '2 alpha'));
    assert.ok(lines.indexOf('1 beta') < lines.indexOf('2 alpha'));
});

// ---- the spool -----------------------------------------------------------------------------

test('a session takes its own mail and leaves everyone else theirs', () => {
    // This is the whole point: before the spool, whichever session stopped first acknowledged the
    // inbox for the entire bot, and the other project's message was gone without being seen.
    reset();
    route.spoolAdd([msg(1, '1 for smartrouter'), msg(2, '2 for easy'), msg(3, 'for anyone')]);

    const two = route.spoolTake(2);
    assert.deepEqual(two.map(m => m.text), ['for easy', 'for anyone']);

    const one = route.spoolTake(1);
    assert.deepEqual(one.map(m => m.text), ['for smartrouter'], 'still there after session 2 ran');
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
