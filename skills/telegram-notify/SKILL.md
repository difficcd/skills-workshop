---
name: telegram-notify
description: 텔레그램으로 사용자에게 메시지를 보내거나, 새 머신·새 프로젝트에서 텔레그램 연동을 처음 설정한다. LOAD WHEN — "텔레그램 연동해줘", "텔레그램으로 보내줘", "브리핑 보내", "알림 보내", 오래 걸리는 작업이 끝났을 때, 막혀서 사용자 답을 기다려야 할 때, 봇 토큰·chat id 설정이 필요할 때. DO NOT LOAD — 주기적 상태 보고·하트비트를 만들려는 경우(P0 위반), 다른 메신저 연동, 텔레그램 봇 자체를 개발하는 작업.
---

# 텔레그램 알림

한 줄: **손으로 한 번씩 보내는 채널.** 하트비트도, 폴러도, 크론도, 훅도 만들지 않는다.

에이전트가 자리를 비운 사용자에게 닿는 유일한 통로이자, 가장 쉽게 소음이 되는 통로다.
이 스킬의 절반은 **보내는 법**이고 나머지 절반은 **안 보내는 법**이다.

---

## P0 — 위반 금지

| # | 규칙 | 이유 |
|---|---|---|
| 0-1 | **자동·주기 전송을 만들지 않는다.** heartbeat/poll 스크립트, cron, 스케줄러, 전송하는 hook, 반복 감시 태스크 — 전부 금지. 금지 대상은 **뒤에서 계속 도는 루프**이지, 에이전트가 한 번 부르는 명령이 아니다 (`tg-read.mjs`는 허용) | N분마다 오는 "지금 X 하는 중"은 정보가 아니라 소음이다. 한 번 만들면 사용자가 직접 꺼야 한다 |
| 0-2 | **토큰을 저장소 안에 두지 않는다.** 자격증명은 `~/.claude/local/telegram.env` 한 곳 | 커밋되면 봇이 탈취된다. 이 파일은 어느 repo에도 속하지 않는다 |
| 0-3 | 토큰·chat id를 **대화에 원문으로 출력하지 않는다.** 확인이 필요하면 마스킹된 출력을 쓴다 | 전사(transcript)·로그·스크린샷에 남는다 |
| 0-4 | **보내기 전에 사용자 입장에서 읽어본다.** 진행 중계·자기 보고 금지 | 아래 "언제 보내나" |
| 0-5 | 사용자가 "그만 보내"라고 하면 **프로세스까지 죽인다** | 아래 상자 |

### 파일을 지우는 것만으로는 멈추지 않는다

실제로 있었던 일: heartbeat·poll 스크립트를 삭제한 뒤에도 메시지가 몇 시간 더 갔다.
셸이 파일 내용을 이미 메모리에 읽어둔 채 프로세스가 여러 개 살아 있었기 때문이다.
**파일 삭제 ≠ 중지.** 프로세스를 찾아 죽이고, 스케줄러도 함께 확인한다.

```bash
# macOS / Linux
pkill -f 'sendMessage|tg_heartbeat|tg_poll' || true
crontab -l 2>/dev/null | grep -i telegram        # 결과 없어야 정상
```

```powershell
# Windows
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -match 'sendMessage|tg_heartbeat|tg_poll' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Get-ScheduledTask | Where-Object { $_.TaskName -match 'telegram|tg' }   # 결과 없어야 정상
```

에이전트 harness에 백그라운드 태스크·스케줄 기능이 있다면 그것도 두 번째 발신원이다. 같이 확인한다.

---

## 언제 보내나 — 세 경우뿐

1. **사용자가 요청했을 때** — "브리핑", "알림 보내줘"
2. **작업이 멈출 때** — 끝났거나, 막혔거나, 답을 기다려야 할 때. 이게 가장 값어치 있는 한 통이다
3. **보낼 값어치가 있다고 판단했을 때** — 드물게. 오래 걸리는 작업이 끝났거나, 되돌리기 어려운 일이 생겼을 때

> 판단 기준 한 줄: **사용자가 자리를 비운 사이에 알았더라면 행동이 달라졌을 내용인가.**
> 아니면 보내지 않는다. 터미널에 쓰면 된다.

## 어떻게 보내나

**상태 보고는 `report.mjs`를 쓴다.** 자유 서술 대신 고정 형식이고, 절반은 기계가 채운다:

```bash
node ~/.claude/skills/telegram-notify/scripts/report.mjs --now "지금 하는 일" --done "직전에 끝낸 것"
node ~/.claude/skills/telegram-notify/scripts/report.mjs --blocked "사용자가 해줘야 하는 일"
```

```
🟢 my-app · 18:27          ← 막히면 🔴, 알림 미리보기만으로 구분된다
지금: 결제 실패 재시도 테스트 작성
직전: 로그인 폼 검증 추가
다음: 결제 화면 리팩토링
⎇ feat/checkout · ● 결제 실패 재시도 (12분 전) · 미커밋 3   ← 기계가 읽는다
```

마지막 줄이 이 형식의 핵심이다. 자유 서술은 **"세션이 살아 있나"** 에 답하지 못한다 —
한 시간째 멈춰 있어도 "작업 중입니다"라고 쓸 수 있고 정상인 보고와 구별되지 않는다.
시각·브랜치·마지막 커밋과 그 나이·미커밋 수는 기계에서 읽으므로, 보고 두 개를 나란히 놓으면
문장이 뭐라 하든 그 사이에 뭔가 움직였는지가 드러난다. 필드가 하나도 없어도 이 줄은 나간다.

필드별 규칙과 문장 쓰는 법은 **[references/reporting.md](references/reporting.md)**.

**그 외 임의 메시지**는:

```bash
node ~/.claude/skills/telegram-notify/scripts/tg.mjs "내용"
echo "내용" | node ~/.claude/skills/telegram-notify/scripts/tg.mjs
```

둘 다 성공하면 `200`만 출력한다. 자격증명이 없으면 설정 명령을 안내하고 종료 코드 `2`로 끝난다.
bash를 선호하면 `scripts/tg.sh`도 같은 일을 한다.

---

## 사용자가 보낸 메시지 읽기

이 채널은 **보내기만 하지 않는다.** 다만 뒤에서 듣고 있지도 않는다 — 듣고 있으려면 루프가 필요하고,
그게 P0-1이 금지하는 것이다. 그래서 읽기는 **에이전트가 부를 때 한 번** 일어난다.

```bash
node ~/.claude/skills/telegram-notify/scripts/tg-read.mjs             # 기다리는 메시지 보기
node ~/.claude/skills/telegram-notify/scripts/tg-read.mjs --consume   # 보고 읽음 처리
```

`getUpdates`는 마지막으로 확인한 지점 이후를 전부 들고 있다. **스트림이 아니라 우편함이라서**,
늦게 읽는다고 잃는 게 없다 — 이것이 온디맨드 읽기를 온전한 설계로 만든다.

**언제 읽나:** 오래 걸리는 작업의 매 단락, 보고를 보내기 직전, 그리고 사용자가 "왜 안 읽어"라고 할 때.
읽지 못한 메시지는 `--consume` 없이 두면 다음에 다시 보인다 — 읽는 것과 처리하는 것은 다른 결정이다.

> **이 스킬을 처음 쓰는 사람에게 반드시 말할 것:** 봇은 뒤에서 듣고 있지 않다.
> 사용자가 봇에게 보낸 메시지는 에이전트가 읽으러 갈 때까지 조용히 기다린다.
> 이걸 말해주지 않으면 "연동이 안 됐다"로 읽힌다 — 실제로 그렇게 읽혔다.

---

## 연동

사용자가 "텔레그램 연동해줘"라고 하면 **먼저 이미 되어 있는지 확인한다.** 새 머신이 아니면 대개 되어 있다.

```bash
node ~/.claude/skills/telegram-notify/scripts/tg-setup.mjs --check
```

- 종료 코드 `0` → 연동됨. 봇 이름과 목적지가 출력된다. 여기서 끝
- 종료 코드 `2` → 설정 필요. **[references/setup.md](references/setup.md)** 를 열어 그 절차대로 진행

토큰을 받은 뒤에는:

```bash
node ~/.claude/skills/telegram-notify/scripts/tg-setup.mjs <TOKEN>          # chat id 자동 탐색
node ~/.claude/skills/telegram-notify/scripts/tg-setup.mjs <TOKEN> <CHAT>   # 여러 개일 때
```

저장하고 **시험 발송까지 해서** 끝까지 되는지 증명한다. 저장만 되고 못 보내는 상태로 끝나지 않는다.
토큰은 마스킹되어 출력되므로 **다시 원문으로 적지 말 것**.

실패 코드별 원인은 [references/setup.md](references/setup.md)의 표에 있다.

---

## 이식

자격증명은 `~/.claude/local/telegram.env` 하나뿐이고 프로젝트와 무관하다.

- **새 프로젝트** — 할 일 없음
- **새 머신** — 그 파일만 만들면 된다 (설정 재실행 또는 파일 복사)
- **프로젝트마다 다른 봇** — 환경변수 `TG_TOKEN` / `TG_CHAT` 이 파일보다 우선한다
- **CI·컨테이너** — 같은 환경변수를 주입한다. 파일 없이 동작한다
