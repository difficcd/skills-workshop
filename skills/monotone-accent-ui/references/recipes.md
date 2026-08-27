# 컴포넌트 레시피

각 항목은 **RULE(금지/강제) → USE(대체물) → 구현 → WHY(근거)** 순. 필요한 항목만 찾아 읽으면 된다.
스타일은 React 인라인 객체 기준이지만 CSS로 그대로 옮겨도 동일하다.

---

## 1. 미니 토글 / 액션 버튼

**RULE** 헤더에 들어가는 작은 컨트롤은 켜짐/꺼짐 두 상태가 **라벨에서 바로 읽혀야** 한다.

**USE** 알약 버튼 + 상태 텍스트(`ON`/`OFF`) 또는 상태 아이콘 교체.

```js
const MINI_BTN = { display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap',
  flexShrink: 0, padding: '0.26rem 0.62rem', borderRadius: '999px', fontSize: '0.76rem',
  fontWeight: 700, border: '1px solid' };
const MINI_ON  = { background: 'var(--accent-color)', color: 'var(--accent-contrast)', borderColor: 'var(--accent-color)' };
const MINI_OFF = { background: 'var(--bg-color)', color: 'var(--text-muted)', borderColor: 'var(--border-color)' };
```

**WHY** 미세조정 요청("쪼끔만 작게")이 반복된다. 값을 상수 3개로 모아두면 한 곳만 고쳐 전부 반영된다.

---

## 2. 카운트 뱃지 / 칩

**RULE** 뱃지는 액센트 20% 배경 + 액센트 글자. **액센트 배경 위에 올라갈 때는 색을 뒤집는다.**

**USE**

```js
const onAccent = /* 부모가 solid accent인가 */;
const badgeBg    = onAccent ? 'color-mix(in srgb, var(--accent-contrast) 22%, transparent)'
                            : 'color-mix(in srgb, var(--accent-color) 20%, transparent)';
const badgeColor = onAccent ? 'var(--accent-contrast)' : 'var(--accent-color)';
// minWidth 22px, height 22px, borderRadius 999px, fontWeight 900, fontVariantNumeric 'tabular-nums'
```

**WHY** 뒤집지 않으면 완료/활성 상태에서 뱃지가 배경에 묻혀 사라진다.

---

## 3. 진행 단계 표시(3점)

**RULE** 단계는 색이 아니라 **채워진 점 개수**로 표현한다.

**USE** `8px` 원 3개. 켜짐 `var(--accent-color)` / 꺼짐 `color-mix(in srgb, var(--text-muted) 40%, transparent)`.
각 점 클릭 = 그 단계로 즉시 설정, 이미 켜진 마지막 점 재클릭 = 한 단계 끄기.

**WHY** 색으로 단계를 만들면(회색→노랑→초록) 모노톤이 깨지고 라이트 테마에서 대비가 무너진다.

---

## 4. 선택 상태 / 드롭 대상

**RULE** 선택은 배경만으로 표시하지 않는다(라이트에서 안 보임). 테두리를 함께 준다.

**USE**

```js
// 선택된 행
boxShadow: 'inset 0 0 0 2px var(--accent-color)',
background: 'color-mix(in srgb, var(--accent-color) 16%, transparent)',
// 드롭 대상
outline: '2px dashed var(--accent-color)', outlineOffset: '2px',
// 드래그 중인 원본
opacity: 0.4,
```

선택 개수는 헤더에 solid accent 칩(`N개 선택` + X 버튼)으로 노출하고 **Esc로 해제**.

---

## 5. `select` → 세그먼트 컨트롤

**RULE** 네이티브 `select` 금지.

**USE** 알약 세그먼트: 컨테이너 `padding 3px, borderRadius 999px`, 활성 항목만 solid accent (`tokens.css`의 `.SegControl/.SegBtn`).

**구현** 항목이 4개를 넘으면 세그먼트 대신 포털 팝오버 목록으로.

**WHY** 네이티브 select는 OS마다 렌더가 달라 테마가 적용되지 않는다.

---

## 6. confirm() → 인라인 2단계 확인

**RULE** `window.confirm` / `alert` / `prompt` 금지.

**USE** 같은 버튼이 1차 클릭에 **solid accent + `삭제?`**로 바뀌고, 2차 클릭에서 실행. 3초 후 자동 복귀 또는 다른 곳 클릭 시 해제.

```jsx
const [armed, setArmed] = useState(false);
<button onClick={() => (armed ? remove() : setArmed(true))}
        style={armed ? { background: 'var(--accent-color)', color: 'var(--accent-contrast)', borderColor: 'transparent' }
                     : { color: 'var(--danger-color)' }}>
  {armed ? '삭제?' : '삭제'}
</button>
```

**WHY** 네이티브 모달은 테마 밖이고 포커스를 빼앗으며 Electron/웹뷰에서 막히기도 한다.

---

## 7. 숫자 입력 → 텍스트 + 숫자 필터

**RULE** `input type=number` 금지.

**USE**

```jsx
<input type="text" inputMode="numeric" value={text}
  onFocus={(e) => e.target.select()}
  onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
  onKeyDown={(e) => { if (e.key === 'Enter') commit(text); if (e.key === 'Escape') cancel(); }}
  onBlur={() => commit(text)} />
```

`commit`은 빈 값·0이면 **아무 것도 하지 않고 닫는다** (`parseInt('') || 1` 때문에 1번으로 튀는 것 방지).

**WHY** 스피너 ▲▼가 클릭 지점에 겹쳐 뜨고 휠·↑↓키로도 값이 바뀐다. 그 값이 blur에서 그대로 커밋되어 **"숫자가 저절로 줄어드는" 버그**가 된다.

---

## 8. 체크박스

**RULE** 네이티브 체크박스 금지(액센트 적용 불가).

**USE** `18px` 버튼 + `borderRadius 5px`. 켜짐 = accent 배경 + `Check` 아이콘 + `--accent-contrast`, 꺼짐 = `1.5px solid var(--border-color)`.

**구현** `onClick`에서 반드시 `e.stopPropagation()` — 행 클릭 핸들러와 겹친다.

---

## 9. 날짜/시간 → body 포털 팝오버

**RULE** 상위 `overflow`에 잘리는 팝업은 버그다.

**USE** `createPortal(..., document.body)` + `position: fixed`.

**구현 체크리스트**

1. 트리거 `getBoundingClientRect()` 기준 배치
2. 뷰포트 보정: `left + width > innerWidth - 8`이면 당기고, 아래 공간이 없으면 위로 뒤집기
3. 전체를 덮는 투명 오버레이로 외부 클릭 닫기
4. 패널 자체는 `onClick`에서 `stopPropagation()`
5. `scroll` / `resize` 시 닫기
6. `z-index`는 오버레이 12000 / 패널 12001처럼 한 쌍으로 관리

---

## 10. 드래그 정렬

**RULE 1** 제스처는 자식 버튼의 클릭을 삼키면 안 된다.

```js
onDragStart={(e) => { if (e.target.closest('button, a, input')) { e.preventDefault(); return; } /* ... */ }}
```

**RULE 2** 드래그 도중 **리렌더를 일으키지 않는다.**

```js
// 나쁨: 드래그 중 setState → 컴포넌트 내부에서 정의된 인라인 컴포넌트(const Row = ...)가
//       매 렌더마다 새 타입이 되어 remount → 브라우저 드래그가 끊긴다
const [dragId, setDragId] = useState(null);

// 좋음: ref + DOM style 직접 조작 (상태는 드롭 시점에만 바꾼다)
const dragRef = useRef(null);
onDragStart={(e) => { dragRef.current = id; e.currentTarget.style.opacity = '0.4'; }}
onDragEnter={(e) => { if (dragRef.current && dragRef.current !== id) e.currentTarget.style.outline = '2px dashed var(--accent-color)'; }}
onDragLeave={(e) => { e.currentTarget.style.outline = 'none'; }}
onDrop={(e) => { e.preventDefault(); e.currentTarget.style.outline = 'none'; drop(id); }}
```

행 컴포넌트를 모듈 스코프로 올릴 수 있으면 그게 더 낫다(remount 자체가 사라짐).

**RULE 3** 여러 개를 옮길 때는 **배열 순서 그대로** 뽑아 넣는다(정렬 금지). 하위 항목은 자기 상위를 따라가고 상대 깊이를 유지한다. 선택 묶음 **내부**로의 드롭은 무시한다.

---

## 11. 인라인 편집 키 스코프

**RULE** 편집 중 상태를 `id`만으로 식별하지 않는다.

```js
// 나쁨: 같은 항목이 '요약 목록'과 '원본 목록' 양쪽에 렌더되면 입력창이 두 개 뜬다.
//       나중에 마운트된 쪽이 autoFocus로 포커스를 훔치고,
//       다른 쪽은 손대지 않은 값으로 blur 커밋 → 사용자가 입력한 값이 사라진다.
const editing = editingId === item.id;

// 좋음
const key = `${listKind}:${item.id}`;      // 'today:t3' / 'cat:t3'
const editing = editingId === key;
```

**WHY** 실제로 "번호를 6으로 바꿨는데 3으로 되돌아간다"는 버그가 이 원인이었다.

---

## 12. 자동 높이 텍스트 입력

**RULE** 수동 리사이즈 핸들 금지. 내용에 따라 높이가 늘어야 하고 새로고침 후에도 유지돼야 한다.

**USE**

```js
const autosize = (el) => { el.style.height = 'auto'; el.style.height = `${Math.max(80, el.scrollHeight)}px`; };
// onChange · onFocus · 마운트(useLayoutEffect)에서 호출
// style: { overflow: 'hidden', resize: 'none' }
```

---

## 13. 파괴적 동작 → 스냅샷 + 되살리기

**RULE** 목록을 비우는 동작은 되돌릴 수 있어야 한다.

**USE** 비우기 전 목록을 스냅샷하고, 같은 자리에 solid accent `되살리기 N` 버튼. 복구하면 스냅샷을 비워 버튼이 사라진다.

**구현** 자동 초기화(주기 경계)와 수동 초기화가 **같은 함수**를 쓰게 한다 — 복구 경로가 하나로 유지된다.
라벨만 문맥에 맞춘다: 방금 사용자가 지웠으면 `되살리기`, 시스템이 주기 경계에서 비웠으면 `이전 목록 그대로` 처럼 언제 것인지 알려준다.

---

## 14. 다른 저장소로 보내기 → 1회 추가 버튼

**RULE** 상시 동기화 토글(ON/OFF) 금지.

**USE** `보내기` 버튼 — 누른 순간의 목록만 대상에 **추가**. 삭제·수정은 하지 않는다.

**구현** 중복은 `(source, sourceId)` 또는 텍스트로 차단. 결과는 버튼에 2초간 표시(`3개 보냄` / `이미 다 있어요`).

**WHY** 상시 동기화는 대상 쪽에서 사용자가 고친 내용(순서·이름·완료 상태)을 매번 되돌린다. 실제로 이 구조 때문에 사용자 데이터가 반복해서 덮어써졌다.
