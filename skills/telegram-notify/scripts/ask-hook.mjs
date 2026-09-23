#!/usr/bin/env node
// The agent asked the user a question. Send it to Telegram too. Wire it to PreToolUse on
// AskUserQuestion.
//
// A question is the one moment the agent is genuinely stuck: it has stopped and will not move
// until an answer arrives. In the terminal that is obvious. In the VS Code extension the prompt
// is a panel that can be scrolled away, closed, or lost when the session drops - and then the
// agent is waiting on an answer the user never saw, which from their side looks like it hung.
//
// This is the "sending hook" P0-1 forbids, with the one carve-out P0-1 names: it is not periodic
// and it is not progress. It fires on a question, which "when to send" already lists as an
// occasion. It never fires twice for the same question, because the harness calls the tool once.
//
// It only notifies. It prints nothing on stdout, so the tool runs exactly as it would have and
// the answer still comes from the UI - the phone shows the question, it does not answer it.
//
// Any failure prints nothing and exits 0. A broken notifier must never be able to trap a session.

import { pathToFileURL } from 'node:url';

/** How much of an option's description is worth carrying to a phone. */
const DESC = 110;

/**
 * The frame around the question, in the language the user reads.
 *
 * Only the frame: the question and its options are whatever the agent wrote, and translating
 * those is not this script's business. English is the default because the skill is shared;
 * `TG_LANG` in the local config picks another, and that is a per-machine setting because it is
 * a fact about the person reading, not about the project.
 */
const STRINGS = {
    en: { lead: 'Waiting on you — answer in the editor:', many: ' (pick any number)', other: 'Other (type your own)' },
    ko: { lead: '답변 대기 중 — 편집기에서 골라 주세요:', many: ' (여러 개 선택 가능)', other: '기타 (직접 입력)' },
};

const clip = (s, n) => {
    const t = String(s ?? '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

/**
 * The questions as a message. Exported so the tests can read it without a network or a harness.
 *
 * Shaped for a phone: the header in brackets so several questions stay apart, the question on
 * its own line, then the options numbered. The numbers are how someone answers in a reply -
 * "1" is quicker to type than the label, and the label can be long.
 *
 * @param {{questions?: Array<{question?: string, header?: string, multiSelect?: boolean,
 *   options?: Array<{label?: string, description?: string}>}>}} input the tool's own input
 * @param {string} [lang] a key of STRINGS; anything unknown falls back to English
 * @returns {string} '' when there is nothing worth sending
 */
export function formatAsk(input, lang = 'en') {
    const s = STRINGS[lang] || STRINGS.en;
    const questions = Array.isArray(input?.questions) ? input.questions : [];
    if (!questions.length) return '';
    const blocks = questions.map(q => {
        const head = q?.header ? `[${clip(q.header, 24)}] ` : '';
        const many = q?.multiSelect ? s.many : '';
        const lines = [`${head}${clip(q?.question, 300)}${many}`];
        const options = Array.isArray(q?.options) ? q.options : [];
        options.forEach((o, i) => {
            const desc = o?.description ? ` — ${clip(o.description, DESC)}` : '';
            lines.push(`  ${i + 1}. ${clip(o?.label, 60)}${desc}`);
        });
        // Always true and worth saying: the tool adds it to every question it asks.
        if (options.length) lines.push(`  ${options.length + 1}. ${s.other}`);
        return lines.join('\n');
    });
    return `${s.lead}\n\n` + blocks.join('\n\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const [{ credentials, send }, { canSend, getKey }, { tagged, sessionTag }] = await Promise.all([
            import('./tg.mjs'), import('./mode.mjs'), import('./route.mjs'),
        ]);
        // Mode 1 means the user is at the desk, where the panel is in front of them already.
        if (!canSend()) process.exit(0);

        let raw = '';
        for await (const chunk of process.stdin) raw += chunk;
        const text = formatAsk(JSON.parse(raw || '{}')?.tool_input, getKey('TG_LANG') || 'en');
        if (!text) process.exit(0);

        const creds = credentials();
        if (!creds.token || !creds.chat) process.exit(0);
        // An untagged send is refused elsewhere; here it is simply skipped. A hook is not the
        // place to argue with the user about their working directory.
        const tag = sessionTag();
        if (!tag) process.exit(0);
        await send(tagged(text, tag), creds);
    } catch { /* a notifier that fails must not take the question down with it */ }
    process.exit(0);
}
