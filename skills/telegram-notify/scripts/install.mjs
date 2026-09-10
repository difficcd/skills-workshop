#!/usr/bin/env node
// Everything needed to go from "installed the folder" to "it works", in one place - including the
// approvals, which is the step that otherwise stops the agent halfway.
//
// The agent cannot do all of this by itself, and that is deliberate rather than a gap:
//
//   - only the user can create a bot with @BotFather
//   - registering a scheduled task, and granting the permissions that let one be registered, are
//     the user's calls. An agent that could quietly install persistent automation on a machine
//     from a chat message is the thing worth being unable to do
//
// So this prints a checklist: what is already true, what the agent can do next, and the exact
// lines the user has to run or paste. Nothing here changes anything.
//
//   node install.mjs             the checklist for this machine
//   node install.mjs --perms     just the settings.json block to paste
//   node install.mjs --json
//
// Node 18+, no dependencies.

import { readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { credentials } from './tg.mjs';
import { mode } from './mode.mjs';
import { probe } from './reachability.mjs';

const SCRIPTS = join(homedir(), '.claude', 'skills', 'telegram-notify', 'scripts');
const SETTINGS = join(homedir(), '.claude', 'settings.json');

const readSettings = () => {
    try { return JSON.parse(readFileSync(SETTINGS, 'utf8')); } catch { return {}; }
};

/**
 * The permission rules that let an agent finish the install without a prompt at every step.
 *
 * Narrow on purpose. `Bash(node <scripts>/*)` covers this skill's own scripts and nothing else;
 * the scheduler rules name the one task by name. A blanket `Bash(powershell *)` would buy the
 * same convenience and hand over the machine.
 */
export function permissionRules(scripts = SCRIPTS) {
    const s = scripts.replaceAll('\\', '/');
    const common = [`Bash(node "${s}/*")`, `Bash(node ${s}/*)`];
    if (platform() === 'win32') {
        return [...common,
            "PowerShell(Register-ScheduledTask -TaskName 'claude-telegram' *)",
            "PowerShell(Get-ScheduledTask -TaskName 'claude-telegram'*)",
            "PowerShell(Disable-ScheduledTask -TaskName 'claude-telegram'*)",
            "PowerShell(Unregister-ScheduledTask -TaskName 'claude-telegram'*)",
        ];
    }
    if (platform() === 'darwin') {
        return [...common,
            'Bash(launchctl load *com.claude.telegram*)',
            'Bash(launchctl unload *com.claude.telegram*)',
            'Bash(launchctl list*)',
        ];
    }
    return [...common, 'Bash(crontab -l)'];
}

/** The hook block, so the agent does not have to reconstruct it from the docs. */
export const hookBlock = (scripts = SCRIPTS) => ({
    Stop: [{ hooks: [{ type: 'command', command: `node "${scripts}/stop-hook.mjs"`, timeout: 30, statusMessage: 'Telegram: checking inbox' }] }],
    SessionStart: [{ hooks: [{ type: 'command', command: `node "${scripts}/tg-read.mjs"`, timeout: 20 }] }],
});

/** What is true right now, step by step. */
export function status() {
    const creds = credentials();
    const st = readSettings();
    const p = probe();
    const rules = st?.permissions?.allow || [];
    const want = permissionRules();
    return {
        credentials: !!(creds.token && creds.chat),
        mode: mode().id,
        hooks: !!st?.hooks?.Stop,
        permissions: want.filter(r => !rules.includes(r)),
        cli: p.cli,
        scheduler: p.scheduler,
        // Only the user can see this one; the agent cannot check for a task it may not query.
        bridge: 'unknown - ask the user, or run the scheduler check below',
    };
}

const step = (ok, n, text) => `${ok ? '✓' : '·'} ${n}. ${text}`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const s = status();
    if (process.argv.includes('--json')) { console.log(JSON.stringify(s, null, 2)); process.exit(0); }
    if (process.argv.includes('--perms')) {
        console.log(JSON.stringify({ permissions: { allow: permissionRules() } }, null, 2));
        process.exit(0);
    }

    console.log('telegram-notify - install checklist\n');
    console.log(step(s.credentials, 1, s.credentials
        ? 'credentials present'
        : 'no credentials. USER: @BotFather /newbot, then message the bot once. Then: tg-setup.mjs <TOKEN>'));
    console.log(step(true, 2, `mode ${s.mode} (mode.mjs 1|2|3 to change)`));
    console.log(step(s.hooks, 3, s.hooks
        ? 'Stop hook wired - the inbox is read when a turn ends'
        : 'no Stop hook. AGENT: merge install.mjs --json hookBlock into ~/.claude/settings.json'));
    console.log(step(s.permissions.length === 0, 4, s.permissions.length === 0
        ? 'permissions granted'
        : `${s.permissions.length} permission rule(s) missing - USER: paste \`install.mjs --perms\` into ~/.claude/settings.json`));
    console.log(step(!!(s.cli && s.scheduler), 5, s.cli && s.scheduler
        ? `bridge is possible (${s.scheduler}) - USER: run \`bridge.mjs --install\` and paste its command`
        : `bridge not possible here: missing ${[!s.cli && 'the claude CLI', !s.scheduler && 'a scheduler'].filter(Boolean).join(' and ')}`));

    console.log('\nSteps marked USER cannot be done by the agent, on purpose:');
    console.log('  - only a person can create a bot with @BotFather');
    console.log('  - installing persistent automation, and granting the permission to install it,');
    console.log('    are the calls that keep a chat message from being able to run anything here.');
    console.log('\nBefore step 5, say plainly: anyone who can message the bot can make an agent run');
    console.log('on this machine, and the token is the only thing in the way.');
}
