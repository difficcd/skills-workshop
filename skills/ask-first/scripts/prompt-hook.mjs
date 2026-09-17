#!/usr/bin/env node
// UserPromptSubmit hook: one line of context per prompt, saying the level and its rule.
//
// This is what makes the level hold across sessions without the skill being loaded. It reads
// one small file and prints one JSON object; if anything goes wrong it prints nothing and
// exits 0, because a hook that fails is a prompt that does not go through.

import { rule } from './level.mjs';

try {
    process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: rule() },
    }));
} catch { /* nothing to add */ }
