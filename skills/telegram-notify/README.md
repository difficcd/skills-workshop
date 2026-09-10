# telegram-notify

에이전트가 자리를 비운 사용자에게 **텔레그램으로 한 통 보내는** skill.
연동 절차, 보내는 기준, 그리고 **"세션이 멈춘 건 아닌지" 를 확인시켜 주는 고정 보고 형식**까지 들어 있다.

> A Claude Code skill for reaching the user on Telegram — setup, send, and a fixed status-report
> format whose machine-read half answers the question free text cannot: *is this session alive?*
> Node 18+, zero dependencies. Korean by default; `TG_LANG=en` for English report labels.

이 스킬의 절반은 **보내는 법**이고 나머지 절반은 **안 보내는 법**이다.
알림 채널은 에이전트가 사용자에게 닿는 유일한 통로이자, 가장 쉽게 소음이 되는 통로다.

---

## 왜 필요한가

에이전트에게 긴 작업을 맡기고 자리를 뜨면 두 가지가 궁금해진다.

1. **끝났나? 막혔나?** — 터미널을 안 보고 있으면 알 수 없다
2. **아직 살아 있나?** — 이게 어렵다

2번이 이 스킬의 설계를 결정했다. 자유 서술 보고는 2번에 **답하지 못한다.**
한 시간째 아무것도 안 움직였어도 "작업 중입니다"라고 쓸 수 있고, 멀쩡한 세션의 보고와 글자 하나 다르지 않다.

그래서 보고의 **절반은 에이전트가 쓰지 않는다.**

```
🟢 my-app · 18:27
지금: 결제 실패 재시도 테스트 작성
직전: 로그인 폼 검증 추가
다음: 결제 화면 리팩토링
⎇ feat/checkout · ● 결제 실패 재시도 (12분 전) · 미커밋 3   ← 기계가 읽는다
```

마지막 줄(시각·브랜치·마지막 커밋과 그 나이·미커밋 파일 수)은 `git`과 시계에서 읽는다.
보고 두 개를 나란히 놓으면, 문장이 뭐라고 하든 **그 사이에 실제로 뭔가 움직였는지**가 드러난다.
필드를 하나도 안 줘도 이 줄은 나가므로, 인자 없이 부르는 것만으로 "살아 있음"이 증명된다.

막혔을 때는 **글리프 하나만 바뀐다** — 알림 미리보기만 보고 열어볼지 판단할 수 있어야 하기 때문:

```
🔴 my-app · 18:31
막힘: 배포 서명 키 비밀번호 필요 — 사용자만 알고 있음
⎇ feat/checkout · ● 결제 실패 재시도 (16분 전)
```

---

## 설치

폴더를 통째로 복사하면 끝. 빌드도, 패키지도 없다 (Node 18+, 의존성 0).

```bash
cp -r skills/telegram-notify ~/.claude/skills/
```

```powershell
Copy-Item -Recurse skills\telegram-notify "$env:USERPROFILE\.claude\skills\"
```

다음 세션부터 목록에 뜬다. **"텔레그램 연동해줘"** 한 마디면 에이전트가 알아서 절차를 밟는다.

### 연동 (처음 한 번, 2분)

```bash
node ~/.claude/skills/telegram-notify/scripts/tg-setup.mjs --check   # 이미 되어 있나?
```

`2`가 나오면:

1. 텔레그램에서 **@BotFather** → `/newbot` → 토큰을 받는다
2. **새로 만든 봇에게 아무 메시지나 한 번 보낸다** ← 이걸 빠뜨리면 다음 줄이 `no chat found`로 끝난다.
   봇은 먼저 말을 걸 수 없어서, 사용자가 말을 걸어야 어디로 보낼지 알 수 있다
3. `node ~/.claude/skills/telegram-notify/scripts/tg-setup.mjs <TOKEN>`

chat id를 자동으로 찾고, 저장하고, **시험 발송까지 해서 끝까지 되는지 증명한다.**
저장만 되고 못 보내는 상태로 끝나지 않는다. 자세한 절차·오류표는 [`references/setup.md`](references/setup.md).

---

## 읽기 — 봇은 뒤에서 듣고 있지 않다

**처음 쓰는 사람이 반드시 알아야 할 것.** 사용자가 봇에게 보낸 메시지는 에이전트가 읽으러 갈 때까지
조용히 기다린다. 뒤에서 듣고 있으려면 루프가 필요하고, 그게 P0-1이 금지하는 바로 그것이다.

```bash
node ~/.claude/skills/telegram-notify/scripts/tg-read.mjs             # 기다리는 것 보기
node ~/.claude/skills/telegram-notify/scripts/tg-read.mjs --consume   # 보고 읽음 처리
```

`getUpdates`는 우편함이지 스트림이 아니라서, 늦게 읽는다고 잃는 게 없다.
이걸 말해주지 않으면 "연동이 안 됐다"로 읽힌다 — 실제로 그렇게 읽혔고, 그래서 이 절이 있다.

**"세션 끝나도 되게 해줘"** 는 환경마다 답이 다르다. 추측하지 말고 탐지한다:

```bash
node ~/.claude/skills/telegram-notify/scripts/reachability.mjs
```

OS·`claude` CLI·스케줄러·자격증명을 보고 후보 넷을 **확실성과 오버헤드로 채점해서** 하나를 고른다.
설치는 하지 않는다 — 고르는 건 사용자다. 기준과 근거는 [`references/reachability.md`](references/reachability.md).

## 메시지로 세션 시작하기

훅은 **이미 돌고 있는 세션 안에서만** 도움이 된다. 메시지가 세션을 *시작*하게 하려면 아무것도 안 돌 때
도는 게 있어야 한다 — `bridge.mjs` 를 OS 스케줄러가 부른다.

```bash
node ~/.claude/skills/telegram-notify/scripts/bridge.mjs --install   # 설치 명령만 출력
node ~/.claude/skills/telegram-notify/scripts/bridge.mjs --dry       # 뭘 실행할지만 확인
```

한 번 읽고, 메시지가 있으면 `claude -p` 로 실행하고, 답을 다시 보낸다. **루프가 아니다** — 한 번
읽고 끝나므로 주기는 스케줄러가, 끄는 건 OS가 소유한다.

락 파일(동시 실행 금지), 락을 잡은 뒤에야 소비, 실행 타임아웃 — 각각 실제로 문제가 되는 실패 하나씩을 막는다.

> **설치 전 반드시 말할 것:** 봇에게 메시지를 보낼 수 있는 사람은 그 머신에서 에이전트를 실행시킬 수 있다.
> 막는 건 봇 토큰뿐이다. **대신 설치해주지 말고** 명령을 건네서 끄는 스위치를 사용자가 갖게 한다.

## 자동 감지는 훅으로 — 습관이 아니라

**스킬은 문서다.** 에이전트가 이미 행동할 때 무엇을 할지를 바꿀 뿐, 턴 안에서 수신함을 읽거나 보고를
보내는 건 아무것도 없다. 그래서 "멈출 때 보내라"는 규칙이 계속 깨졌고 메시지도 안 읽혔다 — 둘 다
에이전트의 기억력에 달려 있었기 때문이다.

**훅은 하네스가 실행한다.** `Stop` 에 연결하면:

```json
{ "hooks": { "Stop": [{ "hooks": [{ "type": "command",
  "command": "node ~/.claude/skills/telegram-notify/scripts/stop-hook.mjs", "timeout": 30 }] }] } }
```

매번 멈출 때 수신함을 읽고, **모드 3이면** 보고를 보내고, 새 메시지가 있으면 `decision: block` 으로
돌려줘서 **턴이 끝나지 않고 답하게** 만든다. 무한루프는 불가능하다 — block 전에 메시지를 소비하므로
다음 stop에서는 수신함이 비어 있다.

모드 2는 일부러 자동 보고를 **안 한다.** 터미널이 이미 닿았고, 매 턴 끝마다 메시지를 보내는 것이
P0-1이 막으려는 그 소음이다.

## 모드 — 어디로 보고할까

사용자가 **지금 어디에 있느냐**의 문제지 작업의 문제가 아니다.

```bash
node ~/.claude/skills/telegram-notify/scripts/mode.mjs      # 현재 모드
node ~/.claude/skills/telegram-notify/scripts/mode.mjs 2    # 설정
```

| 모드 | 터미널 | 텔레그램 | 언제 |
|---|---|---|---|
| **1** | 전부 | **안 보냄** | 자리에 있음. 화면에 이미 있는 걸 또 울릴 이유가 없다 |
| **2** | 전부 | 중요한 순간에만 | 기본값. 있지만 잠깐 나갈 수 있음 |
| **3** | **짧게** | 전부 | 나가 있음. 터미널은 줄여 토큰을 아끼고, 보고는 메시지로 |

모드 1에서는 `tg.mjs` 와 `report.mjs` 가 **보낼 내용을 출력만 하고 종료**한다. 잃는 것도 없고 울리지도 않는다.

## 쓰기

```bash
# 상태 보고 (권장)
node ~/.claude/skills/telegram-notify/scripts/report.mjs --now "테스트 작성" --done "재시도 로직 구현"
node ~/.claude/skills/telegram-notify/scripts/report.mjs --blocked "서명 키 비밀번호 필요"
node ~/.claude/skills/telegram-notify/scripts/report.mjs --dry          # 보내지 않고 형식만 확인

# 임의 메시지
node ~/.claude/skills/telegram-notify/scripts/tg.mjs "내용"
echo "내용" | node ~/.claude/skills/telegram-notify/scripts/tg.mjs
```

성공하면 `200`만 출력한다.

---

## 구조

```
skills/telegram-notify/
├── SKILL.md                  # 에이전트가 읽는 본문 (약 125줄)
├── references/
│   ├── setup.md              # 연동 절차 · 종료 코드 · API 오류표
│   ├── reporting.md          # 보고 형식과 필드별 문장 규칙
│   └── reachability.md       # 세션이 끝난 뒤에도 닿게 하기 — 후보 4개와 고르는 기준
└── scripts/                  # Node 18+, 의존성 없음
    ├── report.mjs            # 고정 형식 상태 보고 (기계가 절반을 채운다)
    ├── mode.mjs              # 어디로 보고할지 — 1 터미널만 / 2 둘 다 / 3 텔레그램만
    ├── stop-hook.mjs         # Stop 훅 — 수신함 자동 확인 + 모드 3 자동 보고
    ├── bridge.mjs            # 메시지로 세션 시작 (OS 스케줄러가 호출, 루프 아님)
    ├── tg-read.mjs           # 사용자가 보낸 메시지를 온디맨드로 읽기 (루프 아님)
    ├── reachability.mjs      # 세션 밖에서 닿을 수 있나 — 환경 탐지 (설치는 안 함)
    ├── tg.mjs                # 임의 메시지 전송
    ├── tg-setup.mjs          # 연동 · --check
    └── tg.sh                 # 전송의 bash 판 (Node를 쓸 수 없을 때)
```

`SKILL.md`는 우선순위 계층이다.

| 계층 | 내용 |
|---|---|
| **P0** | 자동·주기 전송 금지, 토큰을 repo에 두지 않기, 마스킹, 보내기 전 판단, "그만"이면 프로세스까지 죽이기 |
| **언제** | 세 경우뿐 — 요청받았을 때 / 작업이 멈출 때 / 값어치가 있다고 판단했을 때 |
| **어떻게** | `report.mjs` 고정 형식, 문장 규칙 |
| **연동** | `--check` 먼저, 없으면 `references/setup.md` |

---

## P0 — 이 스킬이 막으려는 것

| # | 규칙 |
|---|---|
| 0-1 | **자동·주기 전송을 만들지 않는다** — heartbeat, poller, cron, 스케줄러, 전송하는 hook, 반복 감시 태스크 |
| 0-2 | **토큰을 저장소 안에 두지 않는다** — `~/.claude/local/telegram.env` 한 곳 (`0600`) |
| 0-3 | 토큰·chat id를 대화에 원문으로 출력하지 않는다 (마스킹된 출력만) |
| 0-4 | 보내기 전에 사용자 입장에서 읽는다 — 진행 중계 금지 |
| 0-5 | "그만 보내"면 **프로세스까지 죽인다** |

### 0-1과 0-5는 같은 사고에서 나왔다

주기 보고를 한번 붙였다가 끄는 과정에서 실제로 벌어진 일:
**heartbeat·poll 스크립트를 삭제한 뒤에도 메시지가 몇 시간 더 갔다.**
셸이 파일 내용을 이미 메모리에 읽어둔 채 프로세스가 여러 개 살아 있었기 때문이다.

**파일 삭제 ≠ 중지.** `SKILL.md`에 프로세스를 찾아 죽이는 명령이 OS별로 들어 있다.

> N분마다 오는 "지금 X 하는 중"은 정보가 아니라 소음이다.
> 판단 기준 한 줄: **사용자가 자리를 비운 사이에 알았더라면 행동이 달라졌을 내용인가.**

---

## 이식

자격증명은 `~/.claude/local/telegram.env` 하나뿐이고 프로젝트와 무관하다.

| 상황 | 할 일 |
|---|---|
| 새 프로젝트 | 없음 |
| 새 머신 | 그 파일만 만들면 된다 (설정 재실행 또는 복사) |
| 프로젝트마다 다른 봇 | 환경변수 `TG_TOKEN` / `TG_CHAT` 이 파일보다 우선 |
| CI · 컨테이너 | 같은 환경변수 주입. 파일 없이 동작 |
| 파일 위치 변경 | `TG_ENV_FILE` |
| 보고 라벨을 영어로 | `TG_LANG=en` (`now`/`done`/`next`/`blocked`, `12m ago`) |

---

## 다른 메신저로 바꾸려면

`scripts/tg.mjs`의 `send()` 하나만 갈아끼우면 된다 —
Slack이든 Discord webhook이든 `{ ok, status, body }`만 돌려주면 `report.mjs`는 그대로 동작한다.
형식·판단 기준·P0는 채널과 무관하다.

## 라이선스

[MIT](../../LICENSE)
