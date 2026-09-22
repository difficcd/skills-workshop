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
