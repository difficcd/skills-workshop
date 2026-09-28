// tg.mjs: the send-side rules that can be checked without a network.
//
// The registry is pointed at a scratch directory before tg.mjs is imported, because route.mjs
// opens it on import and the tests must not read or write the machine's own sessions.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-test-'));
process.env.CLAUDE_TG_DIR = DIR;
process.env.CLAUDE_PROJECTS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-projects-'));

const { fit, untaggedRefusal } = await import('../scripts/tg.mjs');

test('fit: a long message is cut to the limit with a marker, a short one is untouched', () => {
    assert.equal(fit('hello', 10), 'hello');
    const long = fit('x'.repeat(5000));
    assert.ok(long.length <= 4096);
    assert.ok(long.endsWith('… (truncated)'));
});

test('an untagged send is refused, and the refusal says how to fix it', () => {
    const why = untaggedRefusal('', {});
    assert.ok(why);
    assert.match(why, /not a registered session/);
    assert.match(why, /TG_SESSION_DIR/);
});

test('a tagged send goes', () => {
    assert.equal(untaggedRefusal('2 easy-mv-maker', {}), null);
});

test('TG_UNTAGGED=1 sends anonymous on purpose', () => {
    assert.equal(untaggedRefusal('', { TG_UNTAGGED: '1' }), null);
});

// --- testing a send without making one ---------------------------------------------------------
//
// The only way to check a stop report used to be to let one arrive, which means testing by
// ringing the user's phone. Two of the duplicate reports they complained about were exactly
// that: the hook run twice by hand, not a bug in it.

test('TG_DRY: nothing is sent, and the caller still sees a success', async () => {
    const tg = await import('../scripts/tg.mjs');
    process.env.TG_DRY = '1';
    try {
        // A token that would fail loudly if it were ever used.
        const r = await tg.send('hello', { token: 'not-a-token', chat: '123456789' });
        assert.equal(r.ok, true, 'a dry send must not look like a failure');
        assert.equal(r.dry, true, 'and must be distinguishable from a real one');
    } finally { delete process.env.TG_DRY; }
});
