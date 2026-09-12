// The watcher, and the one thing it changed in tg-read: `inbox` can now hold a request open.
//
//   node --test skills/telegram-notify/test/*.test.mjs
//
// Nothing here reaches Telegram. `fetch` is replaced with a stub that records the URL it was
// asked for, which is where the long-poll timeout lives.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// watch.mjs pulls in route.mjs, which opens the session registry on import - point it at scratch.
process.env.CLAUDE_TG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-watch-'));
process.env.CLAUDE_PROJECTS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-watch-projects-'));

const { inbox } = await import('../scripts/tg-read.mjs');
const creds = { token: '000:stub', chat: '1' };

/** Run `fn` with a fetch that answers an empty inbox and hands back the URL it was called with. */
async function requested(fn) {
    const real = globalThis.fetch;
    let url;
    globalThis.fetch = async (u) => { url = new URL(u); return { status: 200, json: async () => ({ ok: true, result: [] }) }; };
    try { await fn(); } finally { globalThis.fetch = real; }
    return url;
}

test('watch.mjs loads without running - main is guarded by the argv check', async () => {
    // Importing must not start a poll loop: the test runner is argv[1], not watch.mjs.
    await assert.doesNotReject(() => import('../scripts/watch.mjs'));
});

test('inbox returns at once by default - every caller but the watcher is one-shot', async () => {
    const url = await requested(() => inbox(creds));
    assert.equal(url.searchParams.get('timeout'), '0');
    assert.equal(url.searchParams.has('offset'), false);
});

test('inbox holds the request open for waitSec, capped at what Telegram allows', async () => {
    assert.equal((await requested(() => inbox(creds, undefined, 50))).searchParams.get('timeout'), '50');
    assert.equal((await requested(() => inbox(creds, undefined, 99))).searchParams.get('timeout'), '50');
    assert.equal((await requested(() => inbox(creds, undefined, -3))).searchParams.get('timeout'), '0');
});

test('an offset still acknowledges, whether or not the call waits', async () => {
    const url = await requested(() => inbox(creds, 42, 50));
    assert.equal(url.searchParams.get('offset'), '42');
    assert.equal(url.searchParams.get('timeout'), '50');
});
