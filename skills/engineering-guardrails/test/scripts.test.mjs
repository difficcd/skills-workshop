// The checks this skill ships, checked. P0-4 says every rule gets a runnable check; P2 says a
// check must be shown to fail. These tests do both for the two scripts: each one feeds the check
// something it must catch and something it must let through.
//
//   node --test skills/engineering-guardrails/test/scripts.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.join(HERE, '..', 'scripts');
const { importedNames, unusedImports } = await import('../scripts/unused-imports.mjs');
const { bodyOf, declarations, seam, clusters } = await import('../scripts/seams.mjs');

const run = (script, ...args) => spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], { encoding: 'utf8' });

/** A scratch directory holding the given files, for the CLI runs. */
function tree(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardrails-'));
    for (const [name, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), text);
    }
    return dir;
}

// ---- unused-imports ------------------------------------------------------------------------

test('every import shape yields its bound names', () => {
    const src = [
        "import React, { useState, useEffect as fx } from 'react';",
        "import * as ns from './ns.js';",
        "import './side-effect.css';",
        "import def from './camera.js';",
        '',
    ].join('\n');
    assert.deepEqual(importedNames(src).map(i => i.name), ['React', 'useState', 'fx', 'ns', 'def']);
    assert.equal(importedNames(src).find(i => i.name === 'def').line, 4, 'the line the import is written on');
});

test('an import nothing mentions is reported, one that is used is not', () => {
    const src = "import { a, b } from './x.js';\n\nexport const y = a + 1;\n";
    assert.deepEqual(unusedImports(src).map(i => [i.name, i.why]), [['b', 'never used']]);
});

test('a name imported twice is reported even though both copies look used', () => {
    // The case a plain usage check cannot see: both `a`s are mentioned in the body.
    const src = "import { a } from './x.js';\nimport { a } from './y.js';\n\nconsole.log(a);\n";
    assert.deepEqual(unusedImports(src).map(i => i.why), ['imported twice']);
});

test('a mention inside another import statement does not count as a use', () => {
    // Otherwise a duplicate would hide itself behind its twin.
    const src = "import { helper } from './a.js';\nimport { helper as h2 } from './b.js';\n\nh2();\n";
    assert.ok(unusedImports(src).some(i => i.name === 'helper' && i.why === 'never used'));
});

test('a path that contains a word is not read as a name', () => {
    const src = "import { shoot } from './camera.js';\n\nshoot();\n";
    assert.deepEqual(unusedImports(src), []);
});

test('the unused-imports CLI exits 1 on a finding and 0 on a clean tree', () => {
    const dirty = tree({ 'src/a.js': "import { x } from './b.js';\nexport const y = 1;\n" });
    const clean = tree({ 'src/a.js': "import { x } from './b.js';\nexport const y = x;\n" });
    const bad = run('unused-imports.mjs', path.join(dirty, 'src'));
    assert.equal(bad.status, 1, bad.stdout + bad.stderr);
    assert.match(bad.stdout, /a\.js:1\s+x\s+\(never used/);
    assert.equal(run('unused-imports.mjs', path.join(clean, 'src')).status, 0);
});

// ---- seams ---------------------------------------------------------------------------------

/** A component-shaped file: one big function with several groups of names inside it. */
const COMPONENT = `import React from 'react';

export default function App() {
${Array.from({ length: 45 }, (_, i) => `    const pad${i} = ${i};`).join('\n')}
    const [tool, setTool] = useState('pen');
    const [color, setColor] = useState('#000');
    const [width, setWidth] = useState(2);
    const [layers, setLayers] = useState([]);
    const [cut, setCut] = useState(null);
    function startDraw(e) {
        const w = width * (tool === 'pen' ? 1 : 2);
        setLayers(paint(layers, cut, color, w));
    }
    function stopDraw() {
        setCut(null);
    }
    const audioTrack = { play() {}, stop() {} };
    return null;
}
`;

test('the body measured is the largest function, and its top-level names are found', () => {
    const lines = COMPONENT.split('\n');
    const body = bodyOf(lines);
    assert.ok(body.start > 0 && body.end < lines.length, 'a function was chosen, not the module');
    const decl = declarations(lines, body);
    for (const n of ['tool', 'setTool', 'color', 'startDraw', 'stopDraw', 'audioTrack']) {
        assert.ok(decl.at.has(n), n);
    }
    assert.ok(!decl.at.has('w'), 'a name nested inside a function is not top-level');
});

test('seam cost is what a group reads that it does not own', () => {
    const lines = COMPONENT.split('\n');
    const decl = declarations(lines, bodyOf(lines));
    // Settings: read by drawing, reading nothing themselves. The good seam.
    const settings = seam(['tool', 'setTool', 'color', 'setColor', 'width', 'setWidth'], decl);
    assert.deepEqual(settings.reads, []);
    assert.ok(settings.needed.includes('tool') && settings.needed.includes('color'), 'the rest needs them back');
    // Drawing: reads the settings, the layers and the cut. The expensive one.
    const drawing = seam(['startDraw', 'stopDraw'], decl);
    for (const n of ['width', 'tool', 'layers', 'cut', 'color']) assert.ok(drawing.reads.includes(n), n);
    assert.deepEqual(seam(['nope'], decl).missing, ['nope'], 'a name that is not there is said so');
});

test('names sharing a leading word are clustered as a first guess', () => {
    const lines = COMPONENT.split('\n');
    const decl = declarations(lines, bodyOf(lines));
    const found = Object.fromEntries(clusters(decl, 2));
    // `setTool` drops its `set` prefix and lands with `tool` - the pair a state hook produces.
    assert.deepEqual(found.tool.sort(), ['setTool', 'tool']);
    assert.deepEqual(found.layers.sort(), ['layers', 'setLayers']);
    assert.equal(clusters(decl, 2)[0][0], 'pad', 'the biggest cluster comes first');
});

test('the seams CLI exits 1 over the line budget and 0 under it', () => {
    const dir = tree({ 'App.jsx': COMPONENT });
    const file = path.join(dir, 'App.jsx');
    const over = run('seams.mjs', file, '--max-lines', '10');
    assert.equal(over.status, 1, over.stdout + over.stderr);
    assert.match(over.stdout, /> 10 lines/);
    assert.equal(run('seams.mjs', file, '--max-lines', '10000').status, 0);
    const json = JSON.parse(run('seams.mjs', file, '--group', 'startDraw,stopDraw', '--json').stdout);
    assert.ok(json.reads.includes('layers'));
});
