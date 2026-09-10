#!/usr/bin/env node
// Send one message to the user's Telegram.
//
// This is meant to be the only Telegram automation in a workspace. No heartbeat, no poller, no
// periodic report - see SKILL.md P0-1 for why, and for what to do if one already exists.
//
//   node tg.mjs "message"
//   echo "message" | node tg.mjs
//
// Node 18+, no dependencies (global fetch). Credentials come from the environment first, then
// ~/.claude/local/telegram.env - neither of which belongs in a repository.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ENV_FILE = process.env.TG_ENV_FILE || join(homedir(), '.claude', 'local', 'telegram.env');

/** Telegram rejects anything longer outright, so a long report would fail rather than arrive. */
const MAX = 4096;

/**
 * The credentials, from the environment or the env file.
 *
 * Parsed by hand rather than with a dotenv package: this file has two keys and the whole point of
 * the skill is that it installs by copying a folder.
 */
export function credentials(envFile = ENV_FILE) {
    let token = process.env.TG_TOKEN || '';
    let chat = process.env.TG_CHAT || '';
    if (!token || !chat) {
        let text = '';
        try { text = readFileSync(envFile, 'utf8'); } catch { /* not set up yet */ }
        for (const line of text.split('\n')) {
            const m = line.match(/^\s*(TG_TOKEN|TG_CHAT)\s*=\s*['"]?(.*?)['"]?\s*$/);
            if (!m) continue;
            if (m[1] === 'TG_TOKEN' && !token) token = m[2];
            if (m[1] === 'TG_CHAT' && !chat) chat = m[2];
        }
    }
    return { token, chat };
}

/** A token is never printed whole - not in an error, not in a debug line. */
export const mask = (s) => (s.length <= 10 ? '…' : `${s.slice(0, 6)}…${s.slice(-4)}`);

/** Never let a token reach a log through an API error body either. */
export const scrub = (s) => String(s).replace(/bot\d{6,}:[A-Za-z0-9_-]{20,}/g, 'bot<TOKEN>');

/**
 * Cut over-long text rather than letting the API refuse it.
 *
 * A truncated message that arrives beats a complete one that does not, and the marker says which
 * of the two happened.
 */
export function fit(text, max = MAX) {
    if (text.length <= max) return text;
    return `${text.slice(0, max - 40)}\n… (잘림)`;
}

export async function send(text, creds = credentials()) {
    const res = await fetch(`https://api.telegram.org/bot${creds.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: creds.chat,
            text: fit(text),
            disable_web_page_preview: true,
        }),
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
}

/**
 * Everything on stdin, for `echo … | node tg.mjs`.
 *
 * The timeout is not paranoia. An agent harness hands a child an inherited stdin that is neither
 * a TTY nor ever closed, so a plain wait-for-end here hangs the process forever - and with it the
 * turn that called it. Waiting a moment and giving up is the difference between "nothing to send"
 * and a stuck session.
 */
const readStdin = (ms = 1500) => new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let buf = '';
    const done = (v) => { clearTimeout(timer); process.stdin.pause(); resolve(v); };
    const timer = setTimeout(() => done(buf), ms);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => { buf += d; });
    process.stdin.on('end', () => done(buf));
    process.stdin.on('error', () => done(buf));
});

// Only when this file is what was run, so the functions above can be imported and tested.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const creds = credentials();
    if (!creds.token || !creds.chat) {
        console.error('telegram is not set up on this machine.');
        console.error('run: node <skill>/scripts/tg-setup.mjs <bot token>');
        process.exit(2);
    }
    const text = (process.argv.slice(2).join(' ') || await readStdin()).trim();
    if (!text) { console.error('nothing to send'); process.exit(1); }

    const r = await send(text, creds);
    if (!r.ok) {
        // The body says which failure it is - wrong token, blocked bot, bad chat id. Printing it
        // is the difference between fixing it and guessing.
        console.error(r.status);
        console.error(scrub(r.body));
        process.exit(1);
    }
    console.log(r.status);
}
