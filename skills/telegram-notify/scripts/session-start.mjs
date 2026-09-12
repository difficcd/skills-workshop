#!/usr/bin/env node
// The SessionStart hook. Two things a session that is just starting should know.
//
// What is waiting: the inbox as `tg-read.mjs` shows it, unconsumed, so a session opens knowing
// what the user already said. And, when the watcher is switched on for this machine
// (`watch.mjs --on`), the instruction to arm it - printed by the harness into the session's
// context, which is the one place a session can be told to do something before the user types.
// That is what makes the watcher a setting rather than a request the user has to repeat in
// every window.
//
// Any failure prints nothing and exits 0: a broken notifier must never be able to trap a session.
//
// Node 18+, no dependencies.

import { pathToFileURL } from 'node:url';
import { credentials } from './tg.mjs';
import { inbox, mine } from './tg-read.mjs';
import { armInstruction } from './watch.mjs';

async function main() {
    const creds = credentials();
    if (!creds.token || !creds.chat) return;

    let waiting = [];
    try {
        const r = await inbox(creds);
        if (r.ok) waiting = mine(r.messages, creds.chat);
    } catch { /* offline is not an error at session start */ }
    if (waiting.length) {
        for (const m of waiting) console.log(`[${m.at.slice(11, 16)}] ${m.from}: ${m.text}`);
    } else {
        console.log('(inbox empty)');
    }

    const arm = armInstruction();
    if (arm) console.log(arm);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(() => { });
}
