#!/usr/bin/env node
// Remove every telegram-notify hook from ~/.claude/settings.json and set mode 1 (terminal only).
//
// This is the inverse of install.mjs: it leaves the skill folder in place (the scripts still
// work if you reinstall later) but removes the hooks that fire them, and flips the mode so that
// even a stray invocation cannot send.
//
//   node uninstall.mjs           remove hooks + set mode 1
//   node uninstall.mjs --dry-run show what would change, touch nothing
//   node uninstall.mjs --json    machine-readable summary
//
// After this, no telegram notification will fire in any session, new or existing (existing
// sessions pick up settings.json changes on the next hook evaluation). To undo:
//
//   node install.mjs             shows the checklist to re-wire everything
//   node mode.mjs 2              re-enables sending
//
// Node 18+, no dependencies.

import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setMode } from './mode.mjs';
import { permissionRules } from './install.mjs';

const SETTINGS = join(homedir(), '.claude', 'settings.json');

const HOOK_MARKER = 'telegram-notify';

function readSettings() {
    try { return JSON.parse(readFileSync(SETTINGS, 'utf8')); } catch { return {}; }
}

/**
 * Remove every hook entry whose command references `telegram-notify`.
 * If a hook event (Stop, SessionStart, ...) ends up with zero entries, drop the key entirely.
 * Returns { cleaned, removed } where removed lists what was taken out.
 */
function removeHooks(settings) {
    const hooks = settings.hooks;
    if (!hooks) return { cleaned: settings, removed: [] };

    const removed = [];
    const next = {};

    for (const [event, groups] of Object.entries(hooks)) {
        const kept = [];
        for (const group of groups) {
            const inner = (group.hooks || []).filter(h => {
                const dominated = typeof h.command === 'string' && h.command.includes(HOOK_MARKER);
                if (dominated) removed.push({ event, command: h.command });
                return !dominated;
            });
            if (inner.length > 0) kept.push({ ...group, hooks: inner });
        }
        if (kept.length > 0) next[event] = kept;
    }

    return { cleaned: { ...settings, hooks: next }, removed };
}

/**
 * Remove permission rules that only exist for telegram-notify.
 * Returns { cleaned, removed }.
 */
function removePermissions(settings) {
    const allow = settings?.permissions?.allow;
    if (!Array.isArray(allow)) return { cleaned: settings, removed: [] };

    const dominated = new Set(permissionRules());
    const removed = [];
    const kept = allow.filter(r => {
        if (dominated.has(r)) { removed.push(r); return false; }
        return true;
    });

    return {
        cleaned: { ...settings, permissions: { ...settings.permissions, allow: kept } },
        removed,
    };
}

export function uninstall({ dryRun = false } = {}) {
    const before = readSettings();

    const h = removeHooks(before);
    const p = removePermissions(h.cleaned);
    const after = p.cleaned;

    const summary = {
        hooksRemoved: h.removed,
        permissionsRemoved: p.removed,
        modeBefore: null,
        modeAfter: 1,
        settingsChanged: h.removed.length > 0 || p.removed.length > 0,
        dryRun,
    };

    if (!dryRun && summary.settingsChanged) {
        writeFileSync(SETTINGS, JSON.stringify(after, null, 2) + '\n', 'utf8');
    }

    if (!dryRun) {
        try { setMode(1); } catch { /* mode file may not exist yet */ }
    }

    return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const dryRun = process.argv.includes('--dry-run');
    const json = process.argv.includes('--json');

    const result = uninstall({ dryRun });

    if (json) { console.log(JSON.stringify(result, null, 2)); process.exit(0); }

    if (result.hooksRemoved.length === 0 && result.permissionsRemoved.length === 0) {
        console.log('nothing to remove - no telegram-notify hooks or permissions found');
        console.log('mode set to 1 (terminal only, no sending)');
        process.exit(0);
    }

    console.log(dryRun ? 'dry run - no files changed\n' : 'done\n');

    if (result.hooksRemoved.length) {
        console.log(`hooks removed (${result.hooksRemoved.length}):`);
        for (const h of result.hooksRemoved) console.log(`  ${h.event}: ${h.command}`);
    }
    if (result.permissionsRemoved.length) {
        console.log(`\npermissions removed (${result.permissionsRemoved.length}):`);
        for (const r of result.permissionsRemoved) console.log(`  ${r}`);
    }
    if (!dryRun) console.log('\nmode set to 1 (terminal only, no sending)');
    console.log('\nto reinstall later: node install.mjs');
}
