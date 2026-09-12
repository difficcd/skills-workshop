#!/usr/bin/env node
// Wait for a Telegram message and say so, so the session it belongs to wakes up and answers.
//
// The Stop hook reads the inbox when a turn ends. Between turns - the agent idle, waiting for the
// user to type - nothing runs, so a message sent then sits until the user happens to press enter
// in the terminal. From the phone that is a bot that does not answer.
//
// This closes that gap **for one session, while it lives**. Run it under the harness's Monitor:
// every line it prints is an event that wakes the session, and the session answers as if the
// message had been typed. It is the user's own sentence made literal: "send from Telegram, the
// session works and answers."
//
// This is not the loop P0-1 bans. That rule is about *sending* - heartbeats, periodic reports,
// anything that produces messages nobody asked for. This never sends on its own account; the one
// thing it answers is `?`, with the session map, which is a question about the wiring and not
// worth waking a session for. It holds one HTTPS request open (Telegram's long poll, up to 50s)
// and wakes only when the user writes; idle cost is one open connection, and a quiet day produces
// zero events. It is tied to the session: it is listed under the harness's tasks, stops with one
// call, and dies when the session ends, so it cannot outlive its owner or multiply - the two
// failures the detached shell loop actually had.
//
// It goes through the same spool as the Stop hook, so the routing rules are identical: a message
// for other sessions is spooled for them and does not wake this one; a message for this session,
// or for everyone, or for nobody in particular, is taken and printed. The spool is checked on
// every pass, not only after this process fetched something - another session's hook or watcher
// may have fetched a message addressed here, and Telegram will never show it to this one again.
// Nothing is delivered twice: what is printed has already been removed from the spool, so the
// next stop does not find it.
//
// Telegram allows one open `getUpdates` per bot. Two watchers - two sessions, one bot - cut each
// other off with 409 Conflict; each logs it, waits, and asks again. Nothing is lost, because
// whichever request wins spools for both, but delivery to the loser waits for its next pass.
//
//   node watch.mjs            print one line per message for this session, for ever
//   node watch.mjs --once     exit after the first one (for testing the wiring)
//
// Node 18+, no dependencies.

import { pathToFileURL } from 'node:url';
import { credentials, send } from './tg.mjs';
import { canSend } from './mode.mjs';
import { inbox, mine } from './tg-read.mjs';
import { register, spoolAdd, spoolTake, isMapRequest, formatMap } from './route.mjs';

const WAIT_SEC = 50;          // Telegram's maximum for one long poll
const RETRY_MS = 5_000;       // after a failed request, so a flapping network does not spin

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const say = (line) => { process.stdout.write(line + '\n'); };
const log = (line) => { process.stderr.write(line + '\n'); };

/**
 * Hand this session's share to the session. Returns how many lines woke it.
 *
 * `?` is answered from here when the mode allows sending: the map is a fact about the wiring,
 * and the user asked for it on Telegram, so that is where it goes. In a mode that must not send,
 * it is printed instead and the agent decides.
 */
async function deliver(msgs, creds) {
    let woke = 0;
    for (const m of msgs) {
        if (isMapRequest(m.text)) {
            if (canSend()) { try { await send(formatMap(), creds); log('sent the session map'); continue; } catch { } }
            say(`[${m.at.slice(11, 16)}] (asked for the session map)\n${formatMap()}`);
        } else {
            say(`[${m.at.slice(11, 16)}] ${m.text}`);
        }
        woke++;
    }
    return woke;
}

async function main() {
    const once = process.argv.includes('--once');
    const creds = credentials();
    if (!creds.token || !creds.chat) { log('telegram is not set up on this machine.'); process.exit(2); }

    const me = register();
    log(`watching as session ${me.n}`);

    for (;;) {
        // This session's share first - whoever fetched it.
        if (await deliver(spoolTake(me.n), creds) && once) return;

        let r;
        try { r = await inbox(creds, undefined, WAIT_SEC); }
        catch (e) { log(`inbox: ${e && e.message ? e.message : e}`); await sleep(RETRY_MS); continue; }
        if (!r.ok) { log(`inbox: ${r.error}`); await sleep(RETRY_MS); continue; }
        if (!r.messages.length) continue;   // the long poll timed out quietly; ask again

        // Into the spool first, acknowledge second. Crashing in between costs a duplicate; the
        // other order costs the message itself.
        spoolAdd(mine(r.messages, creds.chat), Date.now(), me.n);
        const last = Math.max(...r.messages.map(m => m.updateId));
        try { await inbox(creds, last + 1); } catch { }
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(e => { log(`watch: ${e && e.message ? e.message : e}`); process.exit(1); });
}
