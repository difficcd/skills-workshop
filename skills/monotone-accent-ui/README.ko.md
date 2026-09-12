# monotone-accent-ui

무채색 표면 + **단일 포인트색(액센트)** 으로 다크/라이트를 함께 지탱하는 UI 시스템을,
Claude Code / Claude Agent SDK가 실행할 수 있는 **skill** 로 정리한 것. English: [README.md](README.md).

일반적인 "깔끔하게 만들어라" 류 가이드와 다른 점은 **모든 판단 기준이 수치이거나 검증 가능한 명령**이라는 것이다.

- `12–16%`는 선택 배경, `100% solid`는 강조의 종점
- "가시성 높여줘" = 크기·대비·테두리·농도를 올린다 (색을 바꾸는 게 아니다)
- `node verify.mjs src` → 위반 0건이어야 통과

색과 컴포넌트뿐 아니라 **화면을 어떻게 구성하는지**(`ux-patterns.md`)도 들어 있다 —
"지금"을 첫 화면에 두는 법, 수집 → 오늘 → 보관 흐름, 시간 3구간 섹션, 커맨드 팔레트형 전역 검색,
빈 상태 문구 쓰는 법까지. 실제로 매일 쓰는 대시보드형 앱에서 수렴한 구조다.

색·간격뿐 아니라 **드래그가 끊기는 원인**, **입력값이 되돌아가는 원인**처럼 실제로 터진 버그를 규칙으로 승격시켜 넣었다.

---

## 설치

**`skills/monotone-accent-ui` 폴더를 통째로 skills 디렉터리에 복사하면 끝.** 빌드도, 패키지도 없다.

```bash
# 모든 프로젝트에서 쓰기
cp -r skills/monotone-accent-ui ~/.claude/skills/

# 이 프로젝트에서만 쓰기 (팀과 공유하려면 이쪽 — repo에 커밋됨)
cp -r skills/monotone-accent-ui <your-project>/.claude/skills/
```

Windows PowerShell:

```powershell
Copy-Item -Recurse skills\monotone-accent-ui "$env:USERPROFILE\.claude\skills\"
```

다음 세션부터 목록에 뜨고, UI 작업이면 에이전트가 알아서 로드한다. 직접 부르려면 `/monotone-accent-ui`.

기존 코드베이스에 적용할 때는 위반부터 본다 (Node 16+, 의존성 없음):

```bash
node ~/.claude/skills/monotone-accent-ui/references/verify.mjs src
```

---

## 구조

```
skills/monotone-accent-ui/
├── SKILL.md                      # 에이전트가 항상 읽는 본문 (약 140줄)
└── references/                   # 필요할 때만 여는 파일
    ├── tokens.css                # 토큰 + 기본 컴포넌트 CSS (복붙용)
    ├── theme.js                  # 액센트 대비색 자동 계산 · 테마 적용
    ├── recipes.md                # 컴포넌트 14종 (RULE / USE / 구현 / WHY)
    ├── ux-patterns.md            # 화면 구성·흐름 13종 (대시보드, 시간 3구간, 수집→오늘, 전역 검색…)
    ├── verify.mjs                # 위반 검사 (Node, 크로스 플랫폼)
    ├── verify.sh                 # 같은 검사 (bash)
    └── project-skill-template.md # 프로젝트 전용 skill 골격
```

`SKILL.md`는 **우선순위 계층**이다. 충돌하면 항상 낮은 번호가 이긴다.

| 계층 | 내용 | 성격 |
|---|---|---|
| **SCOPE RULE** | 요청한 표면만 고친다. 인접 UI를 임의로 리디자인하지 않는다 | 에이전트가 가장 쉽게 사고치는 지점이라 맨 위 |
| **P0** | 데이터 유실·덮어쓰기 금지, 네이티브 UI 금지, 기존 인터랙션 보존 | 디자인 품질보다 우선 |
| **P1** | 모노톤 + 단일 액센트, 대비색 자동 계산, 농도 사다리, 스케일 | 디자인 시스템 |
| **P2** | 포털 팝오버, 드래그, 편집 키 스코프, 자동 높이, 다중 선택 | 구현 패턴 |
| **P3** | 검사 스크립트 + 눈으로 볼 6가지 | QA |

---

## 무엇에 붙는가

- **프레임워크**: React 예제로 쓰여 있지만 규칙은 DOM 기준이다. Vue·Svelte·Astro·바닐라에도 그대로 적용된다
  (검사기는 `.jsx .tsx .js .ts .vue .svelte .astro`를 기본으로 본다 — `--ext`로 바꿀 수 있다).
- **스타일 방식**: CSS 변수만 쓴다. 인라인 스타일·CSS Modules·Tailwind(`theme.extend`에 토큰 매핑) 어디서나 동작한다.
- **테마 스위치**: `tokens.css`가 `data-theme` 속성 / `.theme-light` 클래스 / OS 설정 자동 추종 **세 가지를 모두** 지원한다. 쓰는 것만 남기고 지우면 된다.
- **폰트**: 시스템 스택 기본. 프로젝트 폰트를 `--font-body` 맨 앞에 끼워 넣으면 된다.
- **언어**: 문서는 한국어지만 규칙에 언어 종속성은 없다. 레이아웃 규칙은 "중간에서 끊기면 안 되는 라벨(CJK·합성어)" 기준으로 쓰여 있다.

---

## 커스터마이즈

- **팔레트**: `references/tokens.css`의 `:root` 및 라이트 블록 값만 교체.
- **포인트색 목록**: `references/theme.js`의 `POINT_COLORS`.
- **대비 임계값**: `contrastOn()`의 `0.62`. 액센트가 전반적으로 밝으면 조금 낮춘다.
- **스케일**: `SKILL.md` P1 표. 이미 굴러가는 프로젝트라면 실제 사용값을 집계해 덮어쓰는 걸 권한다.

```bash
grep -rhoE "borderRadius: '[^']+'" src | sort | uniq -c | sort -rn | head
```

- **검사 항목 추가**: `verify.mjs`의 `CHECKS` 배열에 `{ label, re, fix }` 한 줄 추가.
  의도적 예외는 코드 줄 끝에 `// ui-ok: 이유`를 달면 건너뛴다.

---

## 프로젝트 고유 규칙은 분리한다

재사용 컴포넌트 경로, 저장소 키, 화면 목록 같은 것은 이 skill에 넣지 않는다. 넣는 순간 다른 프로젝트에서 못 쓴다.

```
monotone-accent-ui   (전역)     원칙 · 값 · 패턴 · 검증
        ↓
<project>-ui         (프로젝트) 재사용 자산 · 화면 목록 · 저장소 키 · 도메인 규칙
        ↓
     실제 컴포넌트
```

`references/project-skill-template.md`를 복사해 채우면 된다.
**중복해서 적지 말고 위임하는 것**이 핵심 — 같은 규칙이 두 곳에 있으면 에이전트가 어느 쪽을 따를지 헷갈린다.

---

## 라이선스

[MIT](../../LICENSE)
