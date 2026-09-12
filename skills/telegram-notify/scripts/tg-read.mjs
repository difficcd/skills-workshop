#!/usr/bin/env node
// Read what the user sent the bot, once, now.
//
// This is not a poller and adding it does not loosen P0-1. The rule bans a **background loop**:
// something that keeps running unattended and keeps sending. This runs when the agent runs it,
// prints what is waiting, and exits. The difference is who decides, and how often.
//
// It exists because the channel was send-only and nobody said so. The user messaged the bot,
// nothing answered, and the reasonable conclusion was "the integration is broken" - when in fact
// every send had gone through and there was simply nothing on the other end listening.
//
//   node tg-read.mjs              show what is waiting, leave it waiting
//   node tg-read.mjs --consume    show it and mark it read, so the next call does not repeat it
//   node tg-read.mjs --json       machine-readable
//
// Node 18+, no dependencies.

import { pathToFileURL } from 'node:url';
import { credentials, scrub } from './tg.mjs';

/**
 * Pending messages, oldest first.
 *
 * `getUpdates` returns everything Telegram has held since the last acknowledged offset, so this
 * is a mailbox rather than a stream: nothing is lost by not having read it earlier, which is what
 * makes reading on demand a complete design rather than a lossy one.
 *
 * @param {{token: string, chat: string}} creds
 * @param {number} [offset] acknowledge everything below this id
 * @param {number} [waitSec] hold the request open this long waiting for a message (long poll).
 *        0 - the default - returns at once. `watch.mjs` is the only caller that waits.
 */
export async function inbox(creds, offset, waitSec = 0) {
    const url = new URL(`https://api.telegram.org/bot${creds.token}/getUpdates`);
    if (offset != null) url.searchParams.set('offset', String(offset));
    url.searchParams.set('timeout', String(Math.max(0, Math.min(50, waitSec | 0))));
    const res = await fetch(url);
    const body = await res.json().catch(() => ({ ok: false }));
    if (!body.ok) return { ok: false, error: scrub(body.description || `HTTP ${res.status}`), messages: [] };
    const messages = [];
    for (const u of body.result || []) {
        const m = u.message || u.channel_post || u.edited_message;
        if (!m) continue;
        messages.push({
            updateId: u.update_id,
            chatId: String(m.chat?.id ?? ''),
            from: m.from?.first_name || m.chat?.title || '',
            at: new Date((m.date || 0) * 1000).toISOString(),
            text: m.text || m.caption || '',
            // Said plainly so a caller never assumes a file came through: this reads text.
            kind: m.text ? 'text' : m.caption ? 'caption' : 'non-text',
        });
    }
    return { ok: true, messages };
}

/** Only messages from the chat this bot is paired with; anything else is someone else's. */
export const mine = (messages, chat) => messages.filter(m => m.chatId === String(chat));

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const creds = credentials();
    if (!creds.token || !creds.chat) {
        console.error('telegram is not set up on this machine.');
        console.error('run: node <skill>/scripts/tg-setup.mjs <bot token>');
        process.exit(2);
    }
    const r = await inbox(creds);
    if (!r.ok) { console.error(r.error); process.exit(1); }

    const msgs = mine(r.messages, creds.chat);
    if (process.argv.includes('--json')) {
        console.log(JSON.stringify(msgs, null, 2));
    } else if (!msgs.length) {
        console.log('(inbox empty)');
    } else {
        for (const m of msgs) {
            console.log(`[${m.at.slice(11, 16)}] ${m.from}${m.kind === 'non-text' ? ' (not text)' : ''}: ${m.text}`);
        }
    }

    // Acknowledging is separate and opt-in, because reading and consuming are different
    // decisions: a message the agent could not act on should still be waiting next time.
    if (process.argv.includes('--consume') && r.messages.length) {
        const last = Math.max(...r.messages.map(m => m.updateId));
        await inbox(creds, last + 1);
        console.log(`(${r.messages.length} marked read)`);
    }
}
