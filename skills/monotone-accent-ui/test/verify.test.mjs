// The P0/P3 checker, checked: each rule it enforces is fed one line it must catch and one it must
// let through, and the exit code is pinned - a check that cannot fail is not a check.
//
//   node --test skills/monotone-accent-ui/test/verify.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VERIFY = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'references', 'verify.mjs');

/** Run the checker over a directory holding one file with the given source. */
function verify(src, name = 'App.jsx', ...args) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-verify-'));
    fs.writeFileSync(path.join(dir, name), src);
    const r = spawnSync(process.execPath, [VERIFY, dir, ...args], { encoding: 'utf8' });
    return { status: r.status, out: r.stdout + r.stderr };
}

const CLEAN = `
export function Row() {
  return <input type="text" inputMode="numeric" style={{ color: 'var(--accent-contrast)',
    background: 'color-mix(in srgb, var(--text-main) 5%, transparent)' }} />;
}
`;

test('a clean file passes with exit 0', () => {
    const r = verify(CLEAN);
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /PASS/);
});

test('each P0 violation is caught, and named', () => {
    for (const [line, label] of [
        ["if (!confirm('sure?')) return;", /prompt\/alert\/confirm/], // ui-ok: fixture
        ["window.alert('x');", /prompt\/alert\/confirm/], // ui-ok: fixture
        ['<input type="number" />', /number\/date\/time/], // ui-ok: fixture
        ['<input type="checkbox" />', /number\/date\/time/], // ui-ok: fixture
        ['<select value={v}>', /select/], // ui-ok: fixture
        ["background: 'rgba(255, 255, 255, 0.05)'", /rgba/], // ui-ok: fixture
        ["background: 'rgba(0,0,0,0.3)'", /rgba/], // ui-ok: fixture
        ["style={{ color: '#fff' }}", /#fff|하드코딩|hard/i], // ui-ok: fixture
        ["style={{ resize: 'vertical' }}", /resize|textarea/i], // ui-ok: fixture
    ]) {
        const r = verify(`${CLEAN}\nconst x = () => (${line});\n`);
        assert.equal(r.status, 1, `should fail: ${line}\n${r.out}`);
        assert.match(r.out, label, line);
    }
});

test('a line marked ui-ok is a deliberate exception and is skipped', () => {
    const r = verify(`${CLEAN}\nconst x = confirm('really?'); // ui-ok: dev tool, never shipped\n`);
    assert.equal(r.status, 0, r.out);
});

test('a mention that is not a call is not a hit', () => {
    // `prompt` as a word, `alertLevel` as a name, `confirmed` as a flag - none is the native dialog.
    const r = verify(`${CLEAN}\nconst prompt = 'text'; const alertLevel = 1; const confirmed = true;\n`);
    assert.equal(r.status, 0, r.out);
});

test('only the requested extensions are scanned', () => {
    // A violation in a .md file is documentation, not UI.
    const none = verify('<select>', 'notes.md'); // ui-ok: fixture
    assert.equal(none.status, 1, 'no scannable file at all is an error, not a pass');
    assert.doesNotMatch(none.out, /FAIL/, 'and it is not reported as a violation');
    assert.match(verify('<select>', 'notes.md', '--ext=.md').out, /FAIL/, 'but asked for, it is scanned'); // ui-ok: fixture
});
