# ask-first (질문하기)

English: [README.md](README.md)

**요청이 두 가지 이상으로 읽히면, 만들기 전에 묻는다 — 문턱은 사용자가 정한다.**

같은 사용자에게서 일주일 사이에 나온 두 가지 실패: 리팩토링 중엔 "그만 묻고 진행해" (계획에
이미 답이 있는 질문들), 그 다음 주엔 "왜 안 물어봤어" (범위를 잘못 짚어서 기능을 두 번 다시
만듦). 어느 쪽 규칙도 다른 주엔 틀린 규칙이다. 그래서 다이얼을 달았다.

| 강도 | 이럴 때 묻는다 | 아니면 |
|---|---|---|
| **high (강)** | 해석에 따라 *작업이 실질적으로 달라지고* **동시에** 잘못 짚으면 비싼 경우 (삭제·덮어쓰기, 외부 전송, 30분 이상 재작업) | 골라서, 뭘 골랐는지 한 줄, 진행 |
| **mid (중, 기본)** | 해석에 따라 작업이 실질적으로 달라지는 경우 | 골라서, 뭘 골랐는지 한 줄, 진행 |
| **low (약 = 엄격)** | 해석이 둘 이상이면 무조건 — 범위, 위치, 이름, 형식, 대상 | 단, 코드나 레포에 답이 있는 건 어느 강도에서도 묻지 않음 |

모든 강도에서: 한 턴에 질문 하나, 해석 2~3개에 추천안을 맨 앞에, 그리고 기본값 하나 ("답
없으면 A로 감") — 자리 비운 사용자가 막힌 사용자가 되지 않도록.

## 설치

```
https://github.com/difficcd/skills-workshop 에서 ask-first 를 ~/.claude/skills/ 에 설치해줘
```

그리고 선택으로, 프롬프트마다 현재 강도를 한 줄 알려주는 훅 (스킬을 안 불러도 세션을 넘어
유지되게):

```bash
node ~/.claude/skills/ask-first/scripts/install.mjs --on
```

`~/.claude/settings.json`에 `UserPromptSubmit` 항목 하나만 합쳐 넣고 다른 건 건드리지
않는다. `--off`는 정확히 그 항목만 뺀다.

## 쓰기

```bash
node ~/.claude/skills/ask-first/scripts/level.mjs           # mid
node ~/.claude/skills/ask-first/scripts/level.mjs low       # 조금이라도 애매하면 질문
node ~/.claude/skills/ask-first/scripts/level.mjs high      # 진짜 중요할 때만 질문
```

말로 해도 된다: "진짜 애매할 때만 물어봐" / "손대기 전에 무조건 물어봐". 에이전트가 강도를
바꾸고 뭘로 했는지 되말한다.

## 파일

```
SKILL.md                 규칙, 세 강도, 묻는 법, 절대 묻지 않는 것
scripts/level.mjs        강도 읽기/쓰기 (~/.claude/local/ask-first.json)
scripts/prompt-hook.mjs  UserPromptSubmit 훅: 프롬프트마다 한 줄
scripts/install.mjs      그 훅 --on / --off
test/                    node --test skills/ask-first/test/ask-first.test.mjs
```

Node 18+, 의존성 없음.
