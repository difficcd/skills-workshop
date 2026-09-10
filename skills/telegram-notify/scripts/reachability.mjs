#!/usr/bin/env node
// Can the user reach the agent after the session ends - and if so, how, on *this* machine?
//
// The question this answers came from a real one: "저번에는 세션이 끝나도 내가 텔레그램 보내면
// 연결이 됐었는데 왜 지금은 안 되냐". It used to work because a detached shell loop was polling
// in the background. That loop is also what kept sending messages for hours after its script was
// deleted, and it is what P0-1 bans.
//
// So the honest answer is "it depends what this machine has", and guessing is worse than looking.
// This probes; it installs nothing. Installing is a separate decision the user makes.
//
//   node reachability.mjs           what is available here, and what to pick
//   node reachability.mjs --json
//
// Node 18+, no dependencies.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const run = (cmd, args) => {
    try {
        return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 }).trim();
    } catch { return ''; }
};

/** Is a command on PATH, whatever the OS calls "which"? */
const onPath = (name) => {
    const found = platform() === 'win32' ? run('where', [name]) : run('which', [name]);
    return found.split('\n')[0].trim();
};

/**
 * What this machine can do, as facts rather than as a plan.
 *
 * Each entry is something checked, not something assumed. A probe that cannot tell says `null`
 * rather than guessing - "I could not check" and "it is not there" are different answers and
 * only one of them justifies ruling an option out.
 */
export function probe() {
    const os = platform();
    const cli = onPath('claude');
    let scheduler = null;
    if (os === 'win32') {
        scheduler = run('powershell', ['-NoProfile', '-Command', '(Get-Command Register-ScheduledTask -ErrorAction SilentlyContinue) -ne $null']) === 'True'
            ? 'Windows Task Scheduler' : null;
    } else if (os === 'darwin') {
        scheduler = onPath('launchctl') ? 'launchd' : (onPath('crontab') ? 'cron' : null);
    } else {
        scheduler = onPath('systemctl') ? 'systemd timer' : (onPath('crontab') ? 'cron' : null);
    }
    return {
        os,
        /** A headless agent run is what turns "a message arrived" into "something happened". */
        cli: cli || null,
        /** Something that can run a command while no session is open. */
        scheduler,
        /** Credentials, so the poll has something to poll. */
        telegram: existsSync(process.env.TG_ENV_FILE || join(homedir(), '.claude', 'local', 'telegram.env'))
            || !!(process.env.TG_TOKEN && process.env.TG_CHAT),
    };
}

/**
 * The options, scored against the rule the user gave: **low overhead AND certain.**
 *
 * "오버헤드가 살짝 있어도 확실하지 않으면 선택하지 마. 확실해도 오버헤드가 너무 커도 선택하지 마."
 * Both have to hold. An option that fails either is not a compromise, it is a no.
 */
export function options(p = probe()) {
    return [
        {
            id: 'os-scheduler',
            what: `${p.scheduler || 'an OS scheduler'} runs a short poll; a message starts a headless agent run`,
            certain: !!(p.scheduler && p.cli && p.telegram),
            overhead: 'near zero while idle - one HTTPS call per tick, no cloud run until a message exists',
            why: p.scheduler && p.cli
                ? 'Both halves are here. A *named* scheduled task is the fix for what went wrong before: it is listed, stopped by name, and cannot silently multiply the way detached shell loops did.'
                : `Missing: ${[!p.scheduler && 'a scheduler', !p.cli && 'the claude CLI', !p.telegram && 'telegram credentials'].filter(Boolean).join(', ')}.`,
        },
        {
            id: 'cloud-routine',
            what: 'a scheduled cloud routine reads the inbox and acts',
            certain: true,
            overhead: 'high - every tick is a full cloud session, most of them finding nothing',
            why: 'Certain, and independent of whether this machine is even on. But polling every few minutes means hundreds of runs a day to catch a handful of messages, which is the "확실해도 오버헤드가 너무 커도" case.',
        },
        {
            id: 'push-webhook',
            what: 'Telegram pushes straight to a routine URL - fires only when a message exists',
            certain: false,
            overhead: 'zero while idle - nothing runs until a message arrives',
            why: 'The right shape, and the URL hook type exists. But it is minted by a bound session rather than created through the triggers API, so it could not be set up from a normal session here. Not certain until that is confirmed - and an uncertain option is a no by the rule.',
        },
        {
            id: 'in-session-only',
            what: 'nothing runs between sessions; the agent reads the mailbox when it checks',
            certain: true,
            overhead: 'none',
            why: 'getUpdates is a mailbox, so nothing is lost by reading late - only immediacy is. This is the current behaviour and the honest default when nothing above qualifies.',
        },
    ];
}

/** The one to take: certain first, then least overhead. */
export const recommend = (opts = options()) =>
    opts.find(o => o.certain && o.id !== 'in-session-only' && !o.overhead.startsWith('high'))
    || opts.find(o => o.id === 'in-session-only');

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const p = probe();
    const opts = options(p);
    const pick = recommend(opts);

    if (process.argv.includes('--json')) {
        console.log(JSON.stringify({ probe: p, options: opts, recommend: pick.id }, null, 2));
    } else {
        console.log(`os:        ${p.os}`);
        console.log(`claude:    ${p.cli || '없음 (PATH에 claude 없음)'}`);
        console.log(`scheduler: ${p.scheduler || '없음'}`);
        console.log(`telegram:  ${p.telegram ? '설정됨' : '미설정'}`);
        console.log('');
        for (const o of opts) {
            console.log(`${o.certain ? '✓' : '✗'} ${o.id} — ${o.what}`);
            console.log(`    오버헤드: ${o.overhead}`);
            console.log(`    ${o.why}`);
        }
        console.log(`\n→ ${pick.id}`);
        console.log('  설치는 하지 않았습니다. references/reachability.md 를 보고 사용자에게 확인받으세요.');
    }
}
