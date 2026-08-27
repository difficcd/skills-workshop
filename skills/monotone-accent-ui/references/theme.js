// 액센트 적용 — 어떤 포인트색을 골라도 그 위 글자가 항상 읽히게 만드는 핵심.
// 프레임워크 무관. 색/모드가 바뀔 때만 호출한다(주기적 호출 금지).

export const hexToRgb = (hex) => {
    const s = (hex || '').trim().replace('#', '');
    if (s.length !== 6) return null;
    const n = Number.parseInt(s, 16);
    return Number.isNaN(n) ? null : { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

// 상대 휘도. 0.62를 넘으면 밝은 액센트 → 어두운 글자.
export const contrastOn = ({ r, g, b }) =>
    (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.62 ? '#1b1b1f' : '#ffffff';

/**
 * @param {'dark'|'light'} scheme
 * @param {string} accent  #RRGGBB
 * @param {object} [palette] { bgColor, panelBg, textMain, textMuted, borderColor } — 생략 시 CSS 기본값 사용
 */
export function applyTheme(scheme, accent, palette) {
    const root = document.documentElement;
    root.dataset.theme = scheme;

    // 전환 순간에만 색 트랜지션
    root.classList.add('theme-transition');
    setTimeout(() => root.classList.remove('theme-transition'), 320);

    if (palette) {
        root.style.setProperty('--bg-color', palette.bgColor);
        root.style.setProperty('--panel-bg', palette.panelBg);
        root.style.setProperty('--text-main', palette.textMain);
        root.style.setProperty('--text-muted', palette.textMuted);
        root.style.setProperty('--border-color', palette.borderColor);
    }

    const rgb = hexToRgb(accent) || { r: 94, g: 94, b: 94 };
    root.style.setProperty('--accent-color', accent);
    root.style.setProperty('--accent-rgb', `${rgb.r} ${rgb.g} ${rgb.b}`);
    root.style.setProperty('--accent-contrast', contrastOn(rgb));  // ← 이 한 줄이 시스템을 지탱한다
}

// 고를 수 있는 포인트색 — 살짝 탁한 톤. 형광색은 넣지 않는다.
export const POINT_COLORS = [
    '#7C6FF0', // violet
    '#5B8DEF', // blue
    '#37B6A6', // teal
    '#3FB27F', // green
    '#E0A33A', // amber
    '#E2605F', // red
    '#D26FB0', // pink
    '#6B7280', // slate
];

// 무채색 팔레트 기본값
export const DARK_BASE  = { bgColor: '#161618', panelBg: '#212123', textMain: '#EDEDED', textMuted: '#9A9A9A', borderColor: '#343436' };
export const LIGHT_BASE = { bgColor: '#F6F7F9', panelBg: '#FFFFFF', textMain: '#1A1B1F', textMuted: '#61636B', borderColor: '#E6E8EC' };

/* React 예시
   useEffect(() => { applyTheme(scheme, accent, scheme === 'light' ? LIGHT_BASE : DARK_BASE); },
             [scheme, accent]);   // ← deps는 색/모드만. 다른 상태로 재실행시키지 말 것 */
