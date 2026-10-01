import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-quiet-'));
process.env.CLAUDE_TG_DIR = DIR;

const { stillStopped, transcriptSize, writeMarker, readMarker, clearMarker, markerPath } =
    await import('../scripts/quiet.mjs');

// The Stop hook runs every time the agent hands control back, which is not the same as the
// agent having finished. A background Monitor wakes the session seconds later, it works some
// more, and hands back again - three Stops for one stretch of work, three "멈춤" messages, and
// the reader learns to ignore all of them. The hook cannot tell the difference while it runs,
// because the difference is entirely in what happens afterwards. So it defers, and these are
// the two questions that decide whether the stop was real.

test('a quiet session gets its report', () => {
    const mine = { token: 'a', size: 100 };
    assert.equal(stillStopped(mine, { token: 'a' }, 100), true);
});

test('a newer stop takes the report away from the older one', () => {
    // The session stopped again. That stop knows about work this one never saw, so the report is
    // its to send - and if both sent, we would be back to two messages for one stop.
    const mine = { token: 'a', size: 100 };
    assert.equal(stillStopped(mine, { token: 'b' }, 100), false);
});

test('a transcript that grew means the session was woken, not stopped', () => {
    // The case this whole mechanism exists for: a Monitor fired, the session resumed, and it is
    // working right now. It will run the hook again when it really does stop.
    const mine = { token: 'a', size: 100 };
    assert.equal(stillStopped(mine, { token: 'a' }, 101), false);
    assert.equal(stillStopped(mine, { token: 'a' }, 9999), false);
});

test('a transcript that cannot be read does not suppress the report', () => {
    // No transcript path, or an unreadable one, must not be read as "still working" - that would
    // silence every stop, which is worse than the duplicates this is fixing.
    assert.equal(stillStopped({ token: 'a', size: null }, { token: 'a' }, null), true);
    assert.equal(stillStopped({ token: 'a', size: null }, { token: 'a' }, 500), true);
    assert.equal(stillStopped({ token: 'a', size: 100 }, { token: 'a' }, null), true);
});

test('a missing marker on either side sends nothing', () => {
    assert.equal(stillStopped(null, { token: 'a' }, 1), false);
    assert.equal(stillStopped({ token: 'a', size: 1 }, null, 1), false);
});

test('the transcript size is bytes, and a missing file is null rather than a throw', () => {
    const f = path.join(DIR, 'transcript.jsonl');
    fs.writeFileSync(f, 'x'.repeat(42));
    assert.equal(transcriptSize(f), 42);
    fs.appendFileSync(f, 'y'.repeat(8));
    assert.equal(transcriptSize(f), 50);
    assert.equal(transcriptSize(path.join(DIR, 'nope.jsonl')), null);
    assert.equal(transcriptSize(null), null);
    assert.equal(transcriptSize(undefined), null);
});

test('a marker round-trips, and clearing it leaves nothing to re-send', () => {
    writeMarker('proj', { token: 'a', size: 7 });
    assert.deepEqual(readMarker('proj'), { token: 'a', size: 7 });
    clearMarker('proj');
    assert.equal(readMarker('proj'), null);
    // Clearing one that is already gone is how the fallback path ends; it must not throw.
    clearMarker('proj');
});

test('a key that is not a safe filename still gets one file of its own', () => {
    // Project keys come from folder names, which can hold anything. Two different keys must not
    // collapse onto one marker, or one project would cancel another project's stop.
    const a = markerPath('c:/Users/x/My Project');
    const b = markerPath('c:/Users/x/My-Project');
    assert.notEqual(a, b);
    assert.match(path.basename(a), /^stop-[\w.-]+\.json$/);
});
