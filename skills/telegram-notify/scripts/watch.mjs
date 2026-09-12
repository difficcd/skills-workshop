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
// anything that produces messages nobody asked for. This never sends. It holds one HTTPS request
// open (Telegram's long poll, up to 50s) and wakes only when the user writes; idle cost is one
// open connection, and a quiet day produces zero events. It is tied to the session: it is listed
// under the harness's tasks, stops with one call, and dies when the session ends, so it cannot
// outlive its owner or multiply - the two failures the detached shell loop actually had.
//
// It goes through the same spool as the Stop hook, so the routing rules are identical: a message
// with another session's number is spooled for that session and does not wake this one; a message
// with this session's number, or no number, is taken and printed. Nothing is delivered twice - what
// is printed here has already been removed from the spool, so the next stop does not find it.
//
//   node watch.mjs            print one line per message for this session, for ever
//   node watch.mjs --once     exit after the first one (for testing the wiring)
//
// Node 18+, no dependencies.

import { pathToFileURL } from 'node:url';
import { credentials } from './tg.mjs';
import { inbox, mine } from './tg-read.mjs';
import { register, spoolAdd, spoolTake, isMapRequest, formatMap } from './route.mjs';

const WAIT_SEC = 50;          // Telegram's maximum for one long poll
const RETRY_MS = 5_000;       // after a failed request, so a flapping network does not spin

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const say = (line) => { process.stdout.write(line + '\n'); };
const log = (line) => { process.stderr.write(line + '\n'); };

async function main() {
    const once = process.argv.includes('--once');
    const creds = credentials();
    if (!creds.token || !creds.chat) { log('telegram is not set up on this machine.'); process.exit(2); }

    const me = register();
    log(`watching as session ${me.n}`);

    for (;;) {
        let r;
        try { r = await inbox(creds, undefined, WAIT_SEC); }
        catch (e) { log(`inbox: ${e && e.message ? e.message : e}`); await sleep(RETRY_MS); continue; }
        if (!r.ok) { log(`inbox: ${r.error}`); await sleep(RETRY_MS); continue; }
        if (!r.messages.length) continue;   // the long poll timed out quietly; ask again

        // Into the spool first, acknowledge second. Crashing in between costs a duplicate; the
        // other order costs the message itself.
        spoolAdd(mine(r.messages, creds.chat));
        const last = Math.max(...r.messages.map(m => m.updateId));
        try { await inbox(creds, last + 1); } catch { }

        // Only this session's share comes out. Another session's mail stays in the spool for its
        // own hook, and does not wake this one.
        const msgs = spoolTake(me.n);
        for (const m of msgs) {
            if (isMapRequest(m.text)) {
                // A question about the wiring, not about the work. Answered on the terminal side
                // by whoever reads this line; sending from here would need the token in one more
                // process than necessary.
                say(`[${m.at.slice(11, 16)}] (asked for the session map)\n${formatMap()}`);
                continue;
            }
            say(`[${m.at.slice(11, 16)}] ${m.text}`);
        }
        if (once && msgs.length) return;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(e => { log(`watch: ${e && e.message ? e.message : e}`); process.exit(1); });
}
