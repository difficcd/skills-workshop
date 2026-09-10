# 연동 절차

`SKILL.md`에서 `--check`가 종료 코드 `2`(설정 필요)를 냈을 때만 이 파일이 필요하다.

---

## 1. 토큰 — 사용자만 할 수 있다

에이전트는 텔레그램 계정이 없으므로 토큰을 스스로 만들 수 없다. 사용자에게 이렇게 안내한다:

> 텔레그램에서 **@BotFather** 에게 `/newbot` 을 보내고, 봇 이름과 사용자명(`_bot`으로 끝나야 함)을 정하면
> `123456789:AA...` 형태의 토큰을 줍니다. 그 토큰을 붙여넣어 주세요.
>
> 그리고 **새로 만든 봇과의 대화창을 열어 아무 메시지나 한 번 보내주세요.**
> 봇은 먼저 말을 걸 수 없어서, 사용자가 한 번 말을 걸어야 어디로 보낼지 알 수 있습니다.

두 번째 문단을 빠뜨리면 다음 단계가 `no chat found`로 끝난다. 이게 가장 흔한 실패다.

**채널로 받고 싶다면** 대화 대신: 채널을 만들고 → 봇을 **관리자로** 추가하고 → 아무 글이나 하나 올린다.
`chat id`가 `-100`으로 시작하는 음수가 된다. 정상이다.

## 2. 저장

```bash
node ~/.claude/skills/telegram-notify/scripts/tg-setup.mjs <TOKEN>
```

`getUpdates`로 chat id를 찾고, `~/.claude/local/telegram.env`에 `0600`으로 저장하고, **시험 발송까지 한다.**
여러 대화가 봇에게 말을 걸었다면 목록을 출력하고 멈춘다. 사용자가 고른 것을 두 번째 인자로 준다:

```bash
node ~/.claude/skills/telegram-notify/scripts/tg-setup.mjs <TOKEN> <CHAT_ID>
```

**토큰을 대화에 다시 적지 말 것.** 스크립트가 마스킹해서 출력한다.

## 3. 확인

```bash
node ~/.claude/skills/telegram-notify/scripts/tg-setup.mjs --check   # 0이어야 통과
node ~/.claude/skills/telegram-notify/scripts/report.mjs --now "연동 확인"
```

---

## 종료 코드

| 코드 | 뜻 | 할 일 |
|---|---|---|
| `0` | 정상 | — |
| `1` | 토큰 거부, 또는 시험 발송 실패 | 아래 표 |
| `2` | 자격증명 없음 | 1단계부터 |
| `3` | `no chat found` | 사용자가 아직 봇에게 말을 걸지 않았다. 1단계 두 번째 문단 |
| `4` | 대화가 여럿 | 출력된 목록에서 고른 id를 두 번째 인자로 |

## API 오류

| 응답 | 원인 | 할 일 |
|---|---|---|
| `401 Unauthorized` | 토큰이 틀렸거나 폐기됨 | @BotFather `/token`으로 재발급 |
| `403 Forbidden: bot was blocked by the user` | 사용자가 봇을 차단 | 대화창에서 차단 해제 |
| `403 ... not enough rights` | 채널에서 봇이 관리자가 아님 | 관리자로 추가 |
| `400 chat not found` | chat id가 틀림, 또는 채널이 삭제됨 | `--check`로 다시 확인 |
| `429 Too Many Requests` | 너무 자주 보냄 | **P0-1을 어기고 있다는 신호다.** 자동 전송이 어딘가에 살아 있는지 먼저 확인 |
| `200`인데 안 옴 | 다른 chat으로 감 | `--check`가 목적지 이름을 출력한다 |

## 자격증명이 사는 곳

```
~/.claude/local/telegram.env        # 0600, 프로젝트와 무관, 어느 repo에도 없음
  TG_TOKEN='...'
  TG_CHAT='...'
```

환경변수 `TG_TOKEN` / `TG_CHAT` 이 파일보다 우선한다. CI·컨테이너에서는 파일 없이 그것만 주입하면 된다.
`TG_ENV_FILE` 로 파일 위치를 바꿀 수 있다.

**절대 하지 말 것:** 저장소 안의 `.env`, `settings.json`, 스크립트 상수, 커밋 메시지, 이슈 본문.
한 번 푸시되면 지워도 히스토리에 남고, 토큰은 즉시 폐기하고 재발급해야 한다.
