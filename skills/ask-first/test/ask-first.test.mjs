// Run: node --test skills/ask-first/test/
// CLAUDE_ASK_DIR and CLAUDE_SETTINGS_FILE point the modules at a scratch directory, so the
// tests never touch the real level or the real settings.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ask-first-'));
process.env.CLAUDE_ASK_DIR = DIR;
process.env.CLAUDE_SETTINGS_FILE = path.join(DIR, 'settings.json');
const SCRIPTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts');

const level = await import('../scripts/level.mjs');
const install = await import('../scripts/install.mjs');

test('the level is mid until someone sets it, and survives a bad file', () => {
    assert.equal(level.getLevel(), 'mid');
    fs.writeFileSync(level.FILE, '{not json');
    assert.equal(level.getLevel(), 'mid');
    fs.writeFileSync(level.FILE, JSON.stringify({ level: 'sideways' }));
    assert.equal(level.getLevel(), 'mid');
});

test('setting it writes the file and the rule names the level', () => {
    assert.equal(level.setLevel('low'), 'low');
    assert.equal(level.getLevel(), 'low');
    assert.match(level.rule(), /^ask-first: level low - ask whenever/);
    assert.throws(() => level.setLevel('medium'), /must be one of/);
    assert.equal(level.getLevel(), 'low');
});

test('the hook prints one JSON object with the rule as additionalContext', () => {
    level.setLevel('high');
    const out = execFileSync(process.execPath, [path.join(SCRIPTS, 'prompt-hook.mjs')], { env: { ...process.env }, encoding: 'utf8' });
    const j = JSON.parse(out);
    assert.equal(j.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(j.hookSpecificOutput.additionalContext, /level high/);
});

test('the hook is merged into settings next to what is there, and removed alone', () => {
    const before = { permissions: { allow: ['Bash(git *)'] }, hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'echo other' }] }], Stop: [{ hooks: [{ type: 'command', command: 'echo stop' }] }] } };
    const on = install.withHook(structuredClone(before));
    assert.ok(install.isOn(on));
    assert.equal(on.hooks.UserPromptSubmit.length, 2);
    assert.deepEqual(on.permissions, before.permissions);
    assert.deepEqual(on.hooks.Stop, before.hooks.Stop);
    // Twice is once.
    assert.equal(install.withHook(on).hooks.UserPromptSubmit.length, 2);
    const off = install.withoutHook(on);
    assert.ok(!install.isOn(off));
    assert.deepEqual(off, before);
});

test('an empty settings file gets just the hook', () => {
    const on = install.withHook({});
    assert.deepEqual(Object.keys(on), ['hooks']);
    assert.deepEqual(Object.keys(on.hooks), ['UserPromptSubmit']);
    assert.deepEqual(install.withoutHook(on), { hooks: {} });
});
