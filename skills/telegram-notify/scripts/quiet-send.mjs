#!/usr/bin/env node
// The waiter the Stop hook leaves behind. Detached, so the hook returns at once.
//
// It sleeps for the quiet window and then asks the two questions in quiet.mjs: is my marker
// still the current one, and has the transcript grown since I was written? Either answer means
// the stop was not a stop, and this exits without a word. See quiet.mjs for why.
//
// Argument: the project key whose marker to watch. Everything else is on the marker.

import { pathToFileURL } from 'node:url';
import { QUIET_MS, readMarker, clearMarker, stillStopped, transcriptSize } from './quiet.mjs';

async function main() {
    const key = process.argv[2];
    const mine = readMarker(key);
    if (!key || !mine) return;

    await new Promise(r => setTimeout(r, QUIET_MS));

    if (!stillStopped(mine, readMarker(key), transcriptSize(mine.transcript))) return;

    const [tg, report, { canSend }] = await Promise.all([
        import('./tg.mjs'), import('./report.mjs'), import('./mode.mjs'),
    ]);
    const creds = tg.credentials();
    if (!creds.token || !creds.chat || !canSend()) return;

    // Cleared before the send, not after: if Telegram is unreachable the stop is simply missed,
    // which is better than a marker that survives to be re-sent by the next waiter.
    clearMarker(key);
    try { await tg.send(report.format({ stopped: true }), creds); } catch { }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(() => { });
}
