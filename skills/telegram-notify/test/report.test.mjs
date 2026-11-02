import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.CLAUDE_TG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-report-'));

const { readArgs } = await import('../scripts/report.mjs');

// Every report of one session went out blank: the agent passed its text without a flag, the
// script dropped it, sent the clock and branch, and printed 200. The user saw a column of green
// dots reading "24시간 전" and asked for the "watcher" to be switched off.

test('text without a flag is the note, not thrown away', () => {
    const { fields, empty } = readArgs(['done X, next Y']);
    assert.equal(fields.note, 'done X, next Y');
    assert.equal(empty, false);
});

test('flags still land in their own fields', () => {
    const { fields } = readArgs(['--now', 'a', '--done', 'b', '--blocked', 'c']);
    assert.deepEqual([fields.now, fields.done, fields.blocked], ['a', 'b', 'c']);
});

test('bare text is added after an explicit note', () => {
    assert.equal(readArgs(['--note', 'first', 'second']).fields.note, 'first\nsecond');
});

test('a report with nothing written is empty, dry or not', () => {
    assert.equal(readArgs([]).empty, true);
    assert.equal(readArgs(['--dry']).empty, true);
    assert.equal(readArgs(['--now', '  ']).empty, true);
    assert.equal(readArgs(['--now']).empty, true);
});
