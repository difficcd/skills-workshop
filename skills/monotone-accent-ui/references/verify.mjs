#!/usr/bin/env node
/**
 * P0/P3 위반 검사 — 의존성 없음, Node 16+ 어디서나 동작 (Windows 포함).
 *
 *   node verify.mjs [디렉터리] [--ext .jsx,.tsx,.vue] [--quiet]
 *
 * 종료 코드: 위반 0건이면 0, 있으면 1  → CI/pre-commit에 그대로 물릴 수 있다.
 * 의도적 예외는 해당 줄 끝에 `// ui-ok: 이유` 를 붙이면 건너뛴다.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--')) || 'src';
const quiet = args.includes('--quiet');
const extArg = args.find((a) => a.startsWith('--ext='));
const EXTS = (extArg ? extArg.slice(6) : '.jsx,.tsx,.js,.ts,.vue,.svelte,.astro').split(',');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', 'coverage', 'vendor']);

const CHECKS = [
    { label: '네이티브 대화상자 (prompt/alert/confirm)', re: /(^|[^\w.$])(window\.)?(prompt|alert|confirm)\s*\(/,
      fix: '인라인 2단계 확인 버튼 또는 커스텀 모달 (recipes.md §6)' },
    { label: '네이티브 입력 (number/date/time/color/checkbox)', re: /type\s*=\s*["'](number|date|time|color|checkbox)["']/,
      fix: 'text+inputMode / 포털 팝오버 / 커스텀 체크박스 (recipes.md §7-9)' },
    { label: '네이티브 select', re: /<select[\s>]/,
      fix: '세그먼트 컨트롤 또는 포털 팝오버 목록 (recipes.md §5)' },
    { label: '테마 한쪽에서만 보이는 색 (흰/검 rgba)', re: /rgba\(\s*(255,\s*255,\s*255|0,\s*0,\s*0)\s*,/,
      fix: 'color-mix(in srgb, var(--text-main) N%, transparent)' },
    { label: '액센트 위 글자색 하드코딩', re: /color:\s*["']#(fff|ffffff|000|000000)["']/i,
      fix: 'var(--accent-contrast)' },
    { label: 'textarea 수동 리사이즈 핸들', re: /resize:\s*["'](both|vertical|horizontal)["']/,
      fix: 'scrollHeight 기반 자동 높이 (recipes.md §12)' },
];

const files = [];
(function walk(d) {
    let entries;
    try { entries = readdirSync(d); } catch { return; }
    for (const name of entries) {
        if (SKIP_DIRS.has(name)) continue;
        const p = join(d, name);
        let st;
        try { st = statSync(p); } catch { continue; }
        if (st.isDirectory()) walk(p);
        else if (EXTS.includes(extname(p))) files.push(p);
    }
})(dir);

if (!files.length) {
    console.error(`검사할 파일이 없습니다: ${dir} (확장자: ${EXTS.join(',')})`);
    process.exit(1);
}

let failed = 0;
console.log(`검사 대상: ${dir} — 파일 ${files.length}개\n`);

for (const check of CHECKS) {
    const hits = [];
    for (const file of files) {
        const lines = readFileSync(file, 'utf8').split(/\r?\n/);
        lines.forEach((line, i) => {
            if (line.includes('ui-ok:')) return;              // 의도적 예외
            if (check.re.test(line)) hits.push(`${file}:${i + 1}  ${line.trim().slice(0, 110)}`);
        });
    }
    if (hits.length) {
        failed++;
        console.log(`FAIL  ${check.label}  (${hits.length}건)`);
        console.log(`      → ${check.fix}`);
        if (!quiet) hits.slice(0, 10).forEach((h) => console.log(`      ${h}`));
        if (!quiet && hits.length > 10) console.log(`      … 외 ${hits.length - 10}건`);
        console.log();
    } else {
        console.log(`ok    ${check.label}`);
    }
}

console.log();
console.log(failed === 0 ? 'PASS — 위반 0건' : `${failed}개 항목 위반. 고친 뒤 다시 실행하세요.`);
process.exit(failed === 0 ? 0 : 1);
