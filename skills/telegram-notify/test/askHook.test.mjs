// ask-hook: the question as it reaches a phone.
//
// The formatting is the whole job - the send path is shared with tg.mjs and tested there - so
// these read the message the user would actually get.

import test from 'node:test';
import assert from 'node:assert/strict';

const { formatAsk } = await import('../scripts/ask-hook.mjs');

const one = {
    questions: [{
        header: 'Licence',
        question: 'Which licence should this ship under?',
        options: [
            { label: 'Apache-2.0', description: 'Permissive, with a patent grant.' },
            { label: 'MIT', description: 'Permissive, shorter, no patent grant.' },
        ],
    }],
};

test('the question, its options, and the Other the tool always adds', () => {
    const out = formatAsk(one);
    assert.match(out, /\[Licence\] Which licence should this ship under\?/);
    assert.match(out, /1\. Apache-2\.0 — Permissive, with a patent grant\./);
    assert.match(out, /2\. MIT/);
    assert.match(out, /3\. Other \(type your own\)/);
});

test('it says where to answer, and that replying here still works', () => {
    const out = formatAsk(one);
    assert.match(out, /Answer in the editor/i);
    // The editor prompt is not always reachable - say the reply is slower, not lost.
    assert.match(out, /Reply here with the number/i);
});

test('the frame follows the language the user reads; the question itself is left alone', () => {
    const ko = formatAsk(one, 'ko');
    assert.match(ko, /편집기에서 고르면 바로 반영/);
    assert.match(ko, /기타 \(직접 입력\)/);
    // The agent wrote the question and the labels; translating those is not this script's job.
    assert.match(ko, /Which licence should this ship under\?/);
    assert.match(ko, /1\. Apache-2\.0/);
});

test('an unknown language falls back to English rather than printing nothing', () => {
    assert.equal(formatAsk(one, 'fr'), formatAsk(one, 'en'));
});

test('a multi-select question says so', () => {
    const out = formatAsk({ questions: [{ question: 'Which ones?', multiSelect: true, options: [{ label: 'a' }] }] });
    assert.match(out, /\(pick any number\)/);
});

test('several questions stay apart', () => {
    const out = formatAsk({ questions: [one.questions[0], { header: 'Scope', question: 'How far?', options: [{ label: 'all' }] }] });
    assert.match(out, /\[Licence\]/);
    assert.match(out, /\[Scope\] How far\?/);
});

test('a long description is clipped rather than sent whole', () => {
    const out = formatAsk({ questions: [{ question: 'q', options: [{ label: 'l', description: 'x'.repeat(400) }] }] });
    // The option's own line is what must be short; the frame around it is a fixed cost.
    const line = out.split('\n').find(l => l.includes('1. l'));
    assert.ok(line.length < 160, `the option line should be clipped, got ${line.length}`);
    assert.match(line, /…$/);
});

test('nothing to ask means nothing to send', () => {
    assert.equal(formatAsk(undefined), '');
    assert.equal(formatAsk({}), '');
    assert.equal(formatAsk({ questions: [] }), '');
});

test('a question with no options is still worth sending', () => {
    assert.match(formatAsk({ questions: [{ question: 'Ready?' }] }), /Ready\?/);
});
