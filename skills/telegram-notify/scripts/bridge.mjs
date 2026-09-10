#!/usr/bin/env node
// Turn a Telegram message into an agent run. This is the piece that makes the channel two-way
// when no session is open.
//
// Everything else in this skill works only inside a session that is already running. A Stop hook
// reads the inbox at the end of a turn; SessionStart reads it when someone starts a session. But
// "I message the bot and something happens" needs a thing that runs when nothing else does, and
// that is an OS scheduler calling this.
//
//   node bridge.mjs                one poll: read, and run the agent if anything arrived
//   node bridge.mjs --dry          print what it would run, run nothing
//   node bridge.mjs --install      print the scheduler command for this OS (installs nothing)
//
// It is not a loop. It reads once and exits, so the scheduler owns the cadence and `Get-ScheduledTask`
// owns the off switch. That is the difference from the detached shell loop that once kept sending
// for hours after its script was deleted.
//
// SECURITY - say this to the user before installing it. Anyone who can message the bot can make
// an agent run on this machine. The bot token is the only thing in the way. Do not install it on
// a machine where that is not an acceptable trade, and revoke the token with @BotFather if it
// ever leaks.

import { execFile } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { credentials, send } from './tg.mjs';
import { inbox, mine } from './tg-read.mjs';

const HOME = join(homedir(), '.claude', 'local');
export const LOCK = join(HOME, 'telegram-bridge.lock');
export const LOG = join(HOME, 'telegram-bridge.log');
/** Where the agent runs. Set TG_BRIDGE_CWD, or it works in the home directory. */
const CWD = process.env.TG_BRIDGE_CWD || homedir();
/** A run that hangs must not wedge every later poll. */
const RUN_TIMEOUT_MS = Number(process.env.TG_BRIDGE_TIMEOUT_MS || 10 * 60 * 1000);

const log = (line) => {
    try {
        mkdirSync(HOME, { recursive: true });
        appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`);
    } catch { }
};

/**
 * Refuse to start while another run is going.
 *
 * A scheduler that fires every two minutes will happily start a second copy while the first is
 * still working, and two agents editing the same repo is the failure this whole design is meant
 * to avoid. The lock carries a pid and a time so a crashed run cannot block forever.
 */
export function takeLock(now = Date.now(), ttl = RUN_TIMEOUT_MS + 60_000) {
    try {
        if (existsSync(LOCK)) {
            const held = JSON.parse(readFileSync(LOCK, 'utf8'));
            if (now - held.at < ttl) return false;
            log(`stale lock from pid ${held.pid}, taking over`);
        }
    } catch { /* unreadable lock is a stale lock */ }
    mkdirSync(HOME, { recursive: true });
    writeFileSync(LOCK, JSON.stringify({ pid: process.pid, at: now }));
    return true;
}
export const dropLock = () => { try { writeFileSync(LOCK, '{}'); } catch { } };

/** The scheduler line for this machine, printed rather than run. Installing is the user's call. */
export function installHint(script = process.argv[1]) {
    const every = 2;
    if (platform() === 'win32') {
        return [
            '# install (every ' + every + ' minutes, named, no overlap):',
            `$a = New-ScheduledTaskAction -Execute "node" -Argument '"${script}"'`,
            `$t = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes ${every})`,
            '$s = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable',
            "Register-ScheduledTask -TaskName 'claude-telegram' -Action $a -Trigger $t -Settings $s -Force",
            '',
            '# stop it:',
            "Disable-ScheduledTask -TaskName 'claude-telegram'      # off",
            "Unregister-ScheduledTask -TaskName 'claude-telegram'   # gone",
            "Get-ScheduledTask -TaskName 'claude-telegram'          # is it there",
        ].join('\n');
    }
    if (platform() === 'darwin') {
        return [
            `# ~/Library/LaunchAgents/com.claude.telegram.plist -> ProgramArguments: node ${script}`,
            `# StartInterval ${every * 60}`,
            'launchctl load ~/Library/LaunchAgents/com.claude.telegram.plist     # on',
            'launchctl unload ~/Library/LaunchAgents/com.claude.telegram.plist   # off',
        ].join('\n');
    }
    return [
        `# crontab -e   (every ${every} minutes)`,
        `*/${every} * * * * node ${script} >/dev/null 2>&1`,
        '# stop: crontab -e and delete the line',
    ].join('\n');
}

/** Run the agent headlessly on one message and return what it said. */
export function runAgent(prompt, cwd = CWD) {
    return new Promise((resolve) => {
        execFile('claude', ['-p', prompt, '--output-format', 'text'],
            { cwd, timeout: RUN_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8', shell: true },
            (err, stdout, stderr) => resolve({
                ok: !err,
                text: (stdout || '').trim() || (stderr || '').trim() || (err ? String(err.message) : ''),
            }));
    });
}

async function main() {
    if (process.argv.includes('--install')) { console.log(installHint()); return; }

    const creds = credentials();
    if (!creds.token || !creds.chat) { log('no credentials'); return; }

    const r = await inbox(creds);
    if (!r.ok) { log(`inbox failed: ${r.error}`); return; }
    const msgs = mine(r.messages, creds.chat).filter(m => m.text);
    if (!msgs.length) return;

    const prompt = msgs.map(m => m.text).join('\n');
    if (process.argv.includes('--dry')) {
        console.log(`would run in ${CWD}:\n${prompt}`);
        return;
    }

    if (!takeLock()) { log('another run holds the lock; leaving the messages unread'); return; }
    try {
        // Consumed only once the lock is held, so a refused poll leaves them for the next one.
        const last = Math.max(...r.messages.map(m => m.updateId));
        await inbox(creds, last + 1);

        log(`run: ${prompt.slice(0, 120).replace(/\n/g, ' ')}`);
        await send(`▶ 받았습니다. 작업 시작합니다.\n${prompt.slice(0, 200)}`, creds);

        const out = await runAgent(prompt);
        log(`done ok=${out.ok} ${out.text.length} chars`);
        await send(out.text || '(빈 응답)', creds);
    } catch (e) {
        log(`error: ${e?.message || e}`);
        try { await send(`⚠ 실행 실패: ${String(e?.message || e).slice(0, 300)}`, creds); } catch { }
    } finally {
        dropLock();
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((e) => { log(`fatal: ${e?.message || e}`); process.exit(0); });
}
