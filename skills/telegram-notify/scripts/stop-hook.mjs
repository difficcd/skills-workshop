#!/usr/bin/env node
// What runs when the agent stops. Wire it to the Stop hook.
//
// This exists because two rules kept being broken by the same thing: they depended on the agent
// remembering. A skill is a document - it changes what the agent does once it is already acting,
// and nothing in a turn reads the inbox or sends a report on its own. So:
//
//   - a message sent while the agent worked sat unread until someone asked about it
//   - a turn ended on "I will carry on" and nothing was sent, which from the outside is
//     indistinguishable from a crash
//
// A hook is executed by the harness, not by the agent, so neither depends on memory any more.
//
// What it does, in order:
//
//   1. read the inbox (and consume it), spooling what arrives so that a message addressed to
//      another project is left for that project rather than eaten here - see route.mjs
//   2. in mode 3, send the report - in mode 3 the terminal is not being read, so the stop has to
//      go somewhere. In mode 2 the report stays a judgement call (P0-6); the terminal reached
//      them, and a message on every single turn end is the noise P0-1 exists to prevent
//   3. if messages arrived, return decision:block with them as the reason, so the agent keeps
//      going and answers instead of stopping on something it never saw
//
// Step 3 cannot loop: the messages were consumed in step 1, so the next stop finds an empty
// inbox and returns nothing.
//
// Output is the hook JSON protocol on stdout. Any failure prints nothing and exits 0 - a broken
// notifier must never be able to trap a session.

import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const out = (o) => { process.stdout.write(JSON.stringify(o)); process.exit(0); };

/** Where watch.mjs lives, for the line that tells the agent to arm it again. */
const WATCH = new URL('./watch.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
/** The detached waiter that decides whether a stop was really a stop. */
const WAITER = new URL('./quiet-send.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/** The hook's JSON on stdin. Empty when there is none - nothing here is required. */
async function hookInput() {
    try {
        if (process.stdin.isTTY) return {};
        const chunks = [];
        for await (const c of process.stdin) chunks.push(c);
        return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch { return {}; }
}

async function main() {
    const [tg, { inbox, mine }, { mode, canSend }, report, route] = await Promise.all([
        import('./tg.mjs'), import('./tg-read.mjs'), import('./mode.mjs'), import('./report.mjs'),
        import('./route.mjs'),
    ]);
    const quiet = await import('./quiet.mjs');
    const { credentials } = tg;

    const creds = credentials();
    if (!creds.token || !creds.chat || !canSend()) out({ suppressOutput: true });

    // This project's number. Registering here rather than at session start means a project that
    // never stops never takes a number, which is what keeps the list short enough to be read.
    const me = route.register();

    const r = await inbox(creds);

    // Consume from Telegram before anything else can fail, but into the spool, not into this
    // session. The offset is a single acknowledgement for the whole bot, so reading at all takes
    // every project's mail; the spool is where the other projects' share waits for them.
    if (r.ok && r.messages.length) {
        route.spoolAdd(mine(r.messages, creds.chat), Date.now(), me.n);
        const last = Math.max(...r.messages.map(m => m.updateId));
        try { await inbox(creds, last + 1); } catch { }
    }

    let msgs = route.spoolTake(me.n);
    // Read once, before anything can send: the report says so, and the block below acts on it.
    const watcherDown = typeof route.watching === 'function' ? !route.watching() : false;

    // `?` is answered here rather than handed to the agent: it is a question about the wiring,
    // not about the work, and waking a session to answer it would cost a turn.
    const asked = msgs.filter(m => route.isMapRequest(m.text));
    msgs = msgs.filter(m => !route.isMapRequest(m.text));
    if (asked.length || me.fresh) {
        try { await tg.send(route.formatMap(), creds); } catch { }
    }

    // A stop reports in every sending mode, not mode 3 alone. The old reasoning was that mode 2
    // has a terminal and a message would duplicate it - true while they are at the terminal, and
    // worthless when they are not, which is the case this skill exists for. A silent stop is
    // indistinguishable from a crash from the outside.
    //
    // One message per stop, and never on a block. Blocking sends the agent back to work, so it
    // stops again a moment later and reports then; reporting on both is how one exchange
    // produced two messages.
    //
    // It is deliberately not conditional on anything else. A gate on "did the work move" - a
    // different branch, commit or dirty count - was tried and was wrong twice over. It is read
    // from the hook's own working directory, so a turn spent in another repository looks like a
    // turn spent idle and says nothing; and plenty of real work moves no files at all. The
    // result was silence exactly when a report was wanted, which is the failure this hook exists
    // to prevent. The double was the block, not the frequency, and the block is handled above.
    if (!msgs.length && !watcherDown) {
        // Deferred, not sent. The Stop hook runs every time the agent hands control back, and a
        // background Monitor or task waking the session seconds later makes that a yield rather
        // than a stop - one stretch of work reported itself three times. quiet.mjs explains the
        // test; the short version is that the waiter sends only if no newer stop has replaced
        // this marker and the transcript has not grown.
        const input = await hookInput();
        const transcript = input.transcript_path || null;
        quiet.writeMarker(me.key, {
            token: randomUUID(),
            at: Date.now(),
            transcript,
            size: quiet.transcriptSize(transcript),
        });
        try {
            spawn(process.execPath, [WAITER, me.key], { detached: true, stdio: 'ignore' }).unref();
        } catch {
            // No waiter means no report at all, and a silent stop is the thing this hook exists
            // to prevent. Fall back to sending now and accept the occasional duplicate.
            quiet.clearMarker(me.key);
            try { await tg.send(report.format({ stopped: true }), creds); } catch { }
        }
    }

    // A dead watcher is worth a turn: without one, nothing reaches the session until it next
    // stops, so the user is talking to something that cannot hear them until it pauses.
    if (!msgs.length && watcherDown) {
        out({
            decision: 'block',
            reason: 'The Telegram watcher is not running for this project, so messages only arrive '
                + 'when you stop. Arm it now, and say nothing else about it:\n\n'
                + `Monitor({ command: 'node "${WATCH}"', description: 'Telegram messages for this session', persistent: true })`,
            systemMessage: 'Telegram: the watcher is down; re-arming',
        });
    }

    if (!msgs.length) out({ suppressOutput: true });

    const body = msgs.map(m => `[${m.at.slice(11, 16)}] ${m.text}`).join('\n');
    out({
        decision: 'block',
        reason: `The user sent this on Telegram while you were working. Address it before stopping.\n\n${body}`,
        systemMessage: `Telegram: ${msgs.length} message(s) picked up (this session is ${me.n})`,
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(() => out({ suppressOutput: true }));
}
