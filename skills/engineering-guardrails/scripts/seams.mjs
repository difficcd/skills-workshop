#!/usr/bin/env node
// Where a big file can actually be cut, measured rather than guessed.
//
// The finding that produced this: in a 3,900-line React component the *largest* block was the one
// that could not leave. The drawing code was 598 lines across 35 names and read 53 names it did
// not own - drawing genuinely touches everything. What it *read* was the opposite shape: 28 names
// of tool settings reading 4, and they came out in an afternoon.
//
// So the number that decides an extraction is not size. It is **how many names a group reads that
// it does not own**, and you cannot eyeball it.
//
//   node seams.mjs src/App.jsx                    every top-level name, grouped by prefix
//   node seams.mjs src/App.jsx --group a,b,c      seam cost of exactly these names
//   node seams.mjs src/App.jsx --max-lines 800    exit 1 if the file is over budget
//   node seams.mjs src/App.jsx --json
//
// Reads one file with regexes. It is a measuring tape, not a compiler: it looks at top-level
// declarations inside the largest function in the file, which is what a big component or module
// looks like. Treat the numbers as a ranking, not as proof.
//
// Node 18+, no dependencies.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DECL = /^(?:export\s+)?(?:const|let|var|function|async function|class)\s+(\w+)/;
const PAIR = /^\s*const\s*\[\s*(\w+)\s*,\s*(\w+)\s*\]/;

/**
 * The body to measure: the biggest function in the file, or the whole file if there is no
 * obvious one.
 *
 * A four-thousand-line component is one function; a four-thousand-line module is many. Measuring
 * the module's own top level in the first case would find almost nothing, so the biggest function
 * is the better default.
 */
export function bodyOf(lines) {
    let best = null;
    for (let i = 0; i < lines.length; i++) {
        // A line that opens a function body: a declaration, or an arrow whose brace opens here.
        if (!/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+\w/.test(lines[i])
            && !/=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{\s*$/.test(lines[i])) continue;
        let depth = 0, started = false, j = i;
        for (; j < lines.length; j++) {
            depth += (lines[j].match(/\{/g) || []).length - (lines[j].match(/\}/g) || []).length;
            if (lines[j].includes('{')) started = true;
            if (started && depth <= 0) break;
        }
        const span = j - i;
        if (span > 40 && (!best || span > best.end - best.start)) {
            // The indent of the body is one step in from the line that opened it, and that is
            // what tells a top-level declaration inside the function from a nested one.
            const open = (lines[i].match(/^\s*/) || [''])[0].length;
            best = { start: i + 1, end: j, indent: open + 4 };
        }
    }
    // No function worth the name: measure the module's own top level instead.
    return best || { start: 0, end: lines.length, indent: 0 };
}

/** Every name declared at the body's top level, and the block of text that belongs to it. */
export function declarations(lines, body) {
    const at = new Map();          // name -> first line index
    const owners = new Map();      // line index -> names declared there
    const inner = lines.slice(body.start, body.end);
    const pad = new RegExp(`^ {${body.indent}}(?! )`);
    inner.forEach((l, i) => {
        if (body.indent && !pad.test(l)) return;
        const t = l.trim();
        const pair = PAIR.exec(l);
        const names = pair ? [pair[1], pair[2]] : (DECL.exec(t) ? [DECL.exec(t)[1]] : []);
        if (!names.length) return;
        owners.set(i, names);
        for (const n of names) if (!at.has(n)) at.set(n, i);
    });
    const starts = [...owners.keys()].sort((a, b) => a - b);
    const blocks = new Map();
    starts.forEach((s, k) => {
        const e = k + 1 < starts.length ? starts[k + 1] : inner.length;
        blocks.set(s, inner.slice(s, e).join('\n'));
    });
    return { at, owners, blocks, inner };
}

/**
 * Seam cost: what a group reads that it does not own, and what the rest needs back from it.
 *
 * `reads` is the number that decides. `needed` is how wide the returned surface would be - large
 * is acceptable for a settings bundle and a warning sign for anything else.
 */
export function seam(names, decl) {
    const group = new Set(names.filter(n => decl.at.has(n)));
    const missing = names.filter(n => !decl.at.has(n));
    let mine = '', theirs = '';
    for (const [start, owned] of decl.owners) {
        const text = decl.blocks.get(start) || '';
        if (owned.some(n => group.has(n))) mine += '\n' + text; else theirs += '\n' + text;
    }
    const word = (n) => new RegExp(`\\b${n.replace(/[$]/g, '\\$&')}\\b`);
    const reads = [...decl.at.keys()].filter(n => !group.has(n) && word(n).test(mine));
    const needed = [...group].filter(n => word(n).test(theirs));
    return { names: group.size, lines: mine.split('\n').length - 1, reads, needed, missing };
}

/** Names sharing a leading word, as a first guess at what the groups even are. */
export function clusters(decl, min = 3) {
    const by = new Map();
    for (const n of decl.at.keys()) {
        const key = (n.match(/^(?:set|handle|on|use|do|is|has)?([A-Z]?[a-z]+)/) || [, n])[1]?.toLowerCase();
        if (!key) continue;
        by.set(key, [...(by.get(key) || []), n]);
    }
    return [...by].filter(([, v]) => v.length >= min).sort((a, b) => b[1].length - a[1].length);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const file = process.argv.find(a => !a.startsWith('--') && a !== process.argv[0] && a !== process.argv[1]);
    if (!file) { console.error('usage: seams.mjs <file> [--group a,b] [--max-lines N] [--json]'); process.exit(1); }
    const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : null; };

    const lines = readFileSync(file, 'utf8').split('\n');
    const body = bodyOf(lines);
    const decl = declarations(lines, body);

    const group = arg('group');
    if (group) {
        const s = seam(group.split(',').map(x => x.trim()).filter(Boolean), decl);
        if (process.argv.includes('--json')) { console.log(JSON.stringify(s, null, 2)); process.exit(0); }
        console.log(`${s.names} names, ${s.lines} lines | reads ${s.reads.length} | needed back ${s.needed.length}`);
        if (s.missing.length) console.log(`  not found: ${s.missing.join(' ')}`);
        console.log(`  reads : ${s.reads.join(' ')}`);
        console.log(`  needed: ${s.needed.join(' ')}`);
        // The thresholds came from measurement. Groups reading 4-6 came out in an afternoon;
        // ones reading 18-19 were possible but cost that many injected names; past 50 was not
        // worth attempting at all.
        const verdict = s.reads.length <= 6 ? 'good seam. Extract it.'
            : s.reads.length <= 20 ? 'possible but heavy. Look for a smaller group inside it first.'
                : 'cannot leave; this touches the whole file. Extract what it *reads* instead.';
        console.log(`\n-> ${verdict}`);
        process.exit(0);
    }

    const max = arg('max-lines');
    console.log(`${file}: ${lines.length} lines, body ${body.end - body.start}, ${decl.at.size} top-level names\n`);
    console.log('candidates (clustered by name prefix - re-measure real groups with --group):');
    for (const [key, names] of clusters(decl).slice(0, 12)) {
        const s = seam(names, decl);
        console.log(`  ${String(s.reads.length).padStart(3)} reads  ${String(names.length).padStart(3)} names  ${String(s.lines).padStart(4)} lines  ${key}`);
    }
    if (max && lines.length > Number(max)) {
        console.log(`
${lines.length} > ${max} lines. Extract the lowest-reads group above first.`);
        process.exit(1);
    }
}
