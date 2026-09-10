#!/usr/bin/env node
// Set up, or check, the Telegram link on this machine.
//
//   node tg-setup.mjs --check              what is configured, and where messages go
//   node tg-setup.mjs <token>              find the chat id, save, send a test
//   node tg-setup.mjs <token> <chat id>    when more than one chat has written
//
// The chat id cannot be looked up by name. A bot may not open a conversation - it only learns
// where to write once someone has written to it - which is why the flow is "message the bot,
// then run this". See references/setup.md.
//
// Node 18+, no dependencies.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ENV_FILE, credentials, mask, scrub, send } from './tg.mjs';

const api = async (token, method, params = {}) => {
    const url = new URL(`https://api.telegram.org/bot${token}/${method}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const res = await fetch(url);
    return res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
};

/** Every chat that has written to the bot, newest last, each id once. */
export function chatsFrom(updates) {
    const seen = new Map();
    for (const u of updates?.result ?? []) {
        const chat = u.message?.chat || u.channel_post?.chat || u.my_chat_member?.chat;
        if (chat?.id != null) seen.set(String(chat.id), chat.title || chat.first_name || chat.username || '');
    }
    return [...seen].map(([id, name]) => ({ id, name }));
}

async function check() {
    const { token, chat } = credentials();
    if (!token || !chat) {
        console.log(`not set up: no credentials in the environment or ${ENV_FILE}`);
        return 2;
    }
    const me = await api(token, 'getMe');
    if (!me.ok) {
        console.log('the token is present but Telegram rejected it:');
        console.log(scrub(me.description || JSON.stringify(me)));
        return 1;
    }
    console.log(`bot:   @${me.result.username}`);
    console.log(`token: ${mask(token)}`);
    const where = await api(token, 'getChat', { chat_id: chat });
    const name = where.ok ? (where.result.title || where.result.first_name || where.result.username || '') : '';
    console.log(`chat:  ${chat}${name ? `  (${name})` : ''}`);
    if (!where.ok) {
        // A saved id that no longer resolves is the failure that looks like success: sending
        // returns an error nobody reads, and the user simply never hears anything.
        console.log(`warning: that chat did not resolve - ${scrub(where.description || '')}`);
        return 1;
    }
    return 0;
}

async function setup(token, chatArg) {
    const me = await api(token, 'getMe');
    if (!me.ok) {
        console.error('that token was rejected. @BotFather can reissue one with /token');
        console.error(scrub(me.description || JSON.stringify(me)));
        return 1;
    }
    const bot = me.result.username;

    let chat = chatArg;
    if (!chat) {
        const chats = chatsFrom(await api(token, 'getUpdates'));
        if (chats.length === 0) {
            console.error('no chat found.');
            console.error(`open a chat with @${bot} and send it any message, then run this again.`);
            console.error(`(for a channel: add @${bot} as an administrator and post something.)`);
            return 3;
        }
        if (chats.length > 1) {
            console.error(`more than one chat has written to @${bot}. pass the one you want:`);
            for (const c of chats) console.error(`  ${c.id}  ${c.name}`);
            return 4;
        }
        chat = chats[0].id;
    }

    mkdirSync(dirname(ENV_FILE), { recursive: true });
    writeFileSync(ENV_FILE,
        '# Telegram credentials for this machine. Not part of any repository - a token in a commit\n'
        + '# is a stolen bot. TG_TOKEN / TG_CHAT in the environment take precedence over this file.\n'
        + `TG_TOKEN='${token}'\n`
        + `TG_CHAT='${chat}'\n`,
        { encoding: 'utf8', mode: 0o600 });

    console.log(`saved to ${ENV_FILE}`);
    console.log(`bot:   @${bot}`);
    console.log(`token: ${mask(token)}`);
    console.log(`chat:  ${chat}`);

    // Prove it end to end. A setup that "succeeded" and cannot send is exactly the failure this
    // step exists to catch - the user would otherwise find out by not hearing anything.
    const r = await send(`연동 완료 — @${bot} 에서 보냅니다. 이 채널은 손으로 보낼 때만 씁니다.`, { token, chat });
    if (!r.ok) {
        console.error(`saved, but the test message failed: ${r.status}`);
        console.error(scrub(r.body));
        return 1;
    }
    console.log('test message sent.');
    return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const args = process.argv.slice(2);
    if (args[0] === '--check') process.exit(await check());
    if (!args[0]) {
        console.error('usage: tg-setup.mjs <bot token> [chat id]   |   tg-setup.mjs --check');
        process.exit(1);
    }
    process.exit(await setup(args[0], args[1]));
}
