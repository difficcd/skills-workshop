# skills-workshop

Personal skills for Claude Code.

실제로 프로젝트를 만들면서 반복된 피드백과 **실제로 터진 버그**를 규칙으로 승격시켜 모아둔 skill 모음.
"깔끔하게 만들어라" 대신 **수치**와 **실행 가능한 검증 명령**으로 쓰여 있다.

## Skills

| 스킬 | 내용 |
|---|---|
| [**monotone-accent-ui**](skills/monotone-accent-ui/) | 무채색 표면 + 단일 포인트색(액센트)으로 다크/라이트를 함께 지탱하는 UI 시스템. 토큰·액센트 농도 사다리·실측 스케일, 컴포넌트 레시피 14종, 화면 구성 UX 패턴 13종, 의존성 없는 위반 검사기 |
| [**engineering-guardrails**](skills/engineering-guardrails/) | 나중에 대규모 리팩토링을 하게 만드는 구조적 부채를 애초에 안 쌓는 규칙. 4,300줄 컴포넌트를 뜯어내며 나온 것들 — **이음매 비용 측정기**, 조용한 실패 목록, 파생 vs 저장, 상시 검사 5종과 기준선 쓰는 법 |
| [**telegram-notify**](skills/telegram-notify/) ([한국어](skills/telegram-notify/README.ko.md)) | **컴퓨터만 켜 두면 폰의 텔레그램으로 세션들을 관리하고 지시한다.** 에이전트는 보고하고, 사용자는 답장으로 지시하고, 번호로 세션을 고르고(`1 …`, `1,3 …`, `* …`), 놀고 있는 세션은 메시지가 오면 깨어난다. 2분 연동, 보낼 때/안 보낼 때의 기준, **절반을 기계가 채워 "세션이 아직 살아 있나"에 답하는 고정 보고 형식**, 실측한 오버헤드. Node 18+, 의존성 0 |

## 설치

**가장 쉬운 방법 — Claude 에게 이 저장소 주소와 원하는 스킬 이름을 준다.** 빌드도, 패키지도 없으니
에이전트가 클론해서 폴더를 복사하는 것이 설치의 전부다:

```
https://github.com/difficcd/skills-workshop 에서 telegram-notify 와 engineering-guardrails 를
~/.claude/skills/ 에 설치해 줘. 설치 후 각 SKILL.md 의 "Setting it up" 절대로 확인까지.
```

에이전트는 저장소를 임시 폴더에 클론하고, 말한 스킬 폴더만 `~/.claude/skills/` 로 복사한 뒤,
스킬에 설정 절차가 있으면(예: `telegram-notify` 의 `install.mjs` 체크리스트) 그것을 따른다.
스킬 이름을 말하지 않으면 전부 설치된다. 사람이 해야 하는 단계(봇 토큰 발급, 훅 등록 승인)는 그
스킬의 README 가 알려 준다.

**손으로 하려면** 각 스킬 폴더를 통째로 skills 디렉터리에 복사하면 끝.

```bash
# 모든 프로젝트에서 사용
cp -r skills/<skill-name> ~/.claude/skills/

# 특정 프로젝트에서만 사용 (팀과 공유하려면 이쪽)
cp -r skills/<skill-name> <your-project>/.claude/skills/
```

Windows PowerShell:

```powershell
Copy-Item -Recurse skills\<skill-name> "$env:USERPROFILE\.claude\skills\"
```

다음 세션부터 스킬 목록에 뜨고, 해당 작업이면 에이전트가 알아서 로드한다.
자세한 사용법·커스터마이즈는 각 스킬 폴더의 README를 참고.

## 구성 원칙

- **우선순위 계층** — `SCOPE RULE → P0(위반 금지) → P1(디자인 시스템) → P2(구현 패턴) → P3(QA)`. 충돌하면 낮은 번호가 이긴다.
- **본문은 짧게, 상세는 `references/`로** — 에이전트가 항상 읽는 `SKILL.md`는 150줄 내외로 유지하고, 값·코드·레시피는 필요할 때만 열도록 분리.
- **프로젝트 종속성 없음** — 재사용 컴포넌트 경로·저장소 키·화면 목록 같은 프로젝트 고유 정보는 넣지 않는다. 그런 건 `references/project-skill-template.md`로 별도 스킬을 만들어 위임한다.
- **검증 가능** — "확인했나?"가 아니라 "이 명령의 결과가 0인가?"로 쓴다.

## License

[MIT](LICENSE)
