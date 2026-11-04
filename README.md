# Agent Hub v0.6

빠른 시작(Windows): `install.bat` → `.env` 채우기 → `run.bat`. 사용자 매뉴얼은 `docs/manual.md`, 판매 준비 상태는 `docs/release-checklist.md`.

PC에서 도는 Claude 에이전트(릴스 제작·검수)와 로컬 관리 화면입니다.

```
에이전트(Claude Agent SDK) → package.json → 규칙 검수기(코드) → 승인함(웹) → 사람이 승인 → 게시·예약은 직접
                 ↑ 훅이 커밋·삭제·규칙 파일 수정을 막고, 도구 사용을 로그로 남김
```

## 에이전트 그룹 (6그룹 26개, 목록은 `hub/agents.json`, 근거는 `docs/agent-roles.md`)
| 그룹 | 리드 | 지금 상태 |
| --- | --- | --- |
| 릴스·SNS | reels-maker | 제작·규칙 검수 가동, 나머지(트렌드·영상·예약 보조) 예정 |
| 이모티콘·굿즈 | emoticon-planner | 정의만(그림 불량 검수·채널 분기·업로드 실행) |
| 웹소설 | novel-writer | 정의만(회차 설계·집필·문체 검수·Argon 퇴고·문피아 업로드·반응 확인) |
| 게임 개발 | game-dev | 정의만(컷씬·아트·코드·출시 등록·텔레그램 보고) |
| 사내 개발 | fullstack-dev | 정의만(화면·계획서·구현·코드 리뷰), 작업 기록은 가동 |
| 공통 | browser-operator | 크롬 통제 가동 가능(설정: `docs/browser-setup.md`) |

실행기(`hub/runner.py`)에 연결된 것은 reels-maker뿐입니다. 다른 에이전트는 Claude Code에서 `.claude/agents/`의 정의로 바로 부를 수 있고(예: "style-checker로 3화 점검해"), 훅은 똑같이 적용됩니다.

## 로그인·라이선스·브랜딩
- 로그인: `.env`의 `HUB_PASSWORD`(비우면 로그인 없음). 세션은 서버를 끄면 풀린다.
- 라이선스: 첫 실행부터 30일 평가판, 이후 키 필요. 발급은 `python -m hub.license issue --customer "고객사" --secret <비밀문자열>`. 현재 HMAC 방식이라 정식 판매 전 공개키 서명으로 바꿀 것(체크리스트).
- 브랜딩: `hub/config.json`의 `branding`(제품명·고객사·로고 글자·강조색).
- 흐름: 「자동화」 메뉴에서 「AI로 만들기」로 설명만 적으면 노드가 만들어지고, 선 위로 작업 흐름·실행 중 표시가 움직입니다. 저장 위치 `data/flows.json`.

## PC에 앱으로 설치(PWA)
`run.bat` 으로 켠 뒤 화면 오른쪽 위 「앱으로 설치」를 누르면 바탕화면·작업 표시줄에서 여는 앱이 됩니다. 서버가 꺼져 있으면 안내 화면이 뜨고, `autostart-on.bat` 을 한 번 실행하면 PC를 켤 때 서버가 창 없이 자동으로 켜집니다. 자세한 내용은 `docs/manual.md` 1-1.

## 웹 읽기(Agent-Reach)
공통 에이전트 web-reader가 Agent-Reach로 웹·유튜브 자막·깃허브를 읽기 전용으로 가져옵니다. 기본 허용 채널은 web·youtube·github이고, 인스타·X·페이스북은 훅이 막습니다. 설치와 계정 보호 이유는 `docs/web-reader-setup.md`.

## 그림·PDF 반복 처리(PhotoCraft·PdfCraft)
오픈소스 PhotoCraft·PdfCraft(얼리 알파)로 규격 맞춤·변환·일괄 보정·PDF 합치기를 합니다. 새 그림 생성은 Firefly. 기본 꺼짐이며 설치·연결은 `docs/craft-tools-setup.md`.

## 콘텐츠 캘린더·DM 자동 응답·AI 미디어 스튜디오 (2026-11-01)
- 캘린더: 한 달 콘텐츠 계획표(난이도→주 몇 회→주제→유형→달력). `docs/benchmark-content-plan.md`, 저장 `data/plans/`.
- 댓글→DM 자동 응답(팔로우 확인): 릴스 그룹 `dm-funnel`(예정). 설계와 주의점 `docs/benchmark-dm-funnel.md`.
- 인스타 스킬 13종(instagram-agent-skill, MIT): 릴스 그룹 `insta-skills`(예정), 검수기 해시태그 5개 경고. `docs/instagram-agent-skill.md`.
- 릴스 형식 「TOP10 랭킹 카운트다운」(HyperFrames)과 영상 속 도구 반영: `docs/reels-format-ranking.md`.
- 릴스 형식 「진행자 + 위 카드 해설」(아래 진행자 그림 + 위 정보 카드, 끝은 팔로우·댓글 낱말·DM 자료): `tools/instagram/docs/reels-format-explainer.md`.
- 도구 7개(magpie→모델 대체, coucou→데스크톱 알림, anatomy·replica 조사·Strata·PhotoCraft·영상 프롬프트): `docs/benchmark-tools-2026-11d.md`.
- 그록 트레이딩 팀 영상 분석·도구 8개(FinceptTerminal·ml-intern·openscreen·LiteRT-LM·cua·free-claude-code·DeepTutor, ds2api 는 약관 문제로 제외): `docs/benchmark-tools-2026-11c.md`.
- 모니터 화면(에이전트 카드 벽·별자리 연결도·처리율), 깃허브 도구 7개(VoiceStudio·Paperclip 개념·Vibe-Trading 백테스트만·God's Eye View·OpenMAIC·Magnitude 로컬 모델·Open SEO): `docs/benchmark-tools-2026-11b.md`.
- 다른 AI 모델 8종(DeepSeek·Kimi·GLM·StepFun·Qwen·MiMo·Ling, Dreamina 는 후보): 작업별 모델 라우팅 `hub/models.py`, 원고·사내 자료는 Claude 만. `docs/alt-models.md`.
- 도구 6개 검토(HyperFrames 적용·Claude Ads 예정·트레이딩 2종 보류·Camofox 미적용): `docs/benchmark-tools-2026-11.md`.
- Open Generative AI(립싱크·카메라 값 시안): 공통 그룹 `media-studio`(예정). 그림은 Firefly, 영상은 Kling 그대로. `docs/media-studio-setup.md`.

## 크롬 통제
사용자의 크롬을 `--remote-debugging-port=9222`로 띄우면 Playwright MCP가 그 창(사이드 패널 포함, 로그인 유지)에 붙습니다. 게시·공유·제출·등록·결제·삭제 버튼 클릭은 훅이 막고(`hub/rules.json`의 `browser_block_words`), LINE I Agree·Release, 카카오 임시저장만 통과합니다. 자세한 설정과 한계는 `docs/browser-setup.md`.

## 폴더
| 위치 | 역할 |
| --- | --- |
| `CLAUDE.md` | 공통 규칙(한국어, 요청한 부분만 수정, 커밋 금지, 작업 기록) |
| `.claude/agents/` | 서브에이전트 정의(reels-maker, reels-reviewer) |
| `.claude/skills/` | 계정별 규칙(reels-main, reels-ojeongkkul) |
| `.claude/hooks/`, `.claude/settings.json` | 훅: git 커밋·푸시·삭제 차단, hub/·.claude/ 수정 차단, 활동 로그 |
| `hub/rules.json` | 검수 규칙 값(금지 BGM, 읽기 속도 등) — 에이전트는 수정 불가 |
| `hub/validators/reels_check.py` | 규칙 검수기 |
| `hub/runner.py` | 실행기(실제 실행 / 드라이런) |
| `hub/server.py`, `hub/static/` | 관리 화면(Jira식: 요약·보드·목록·승인함·자동화·에이전트·활동·설정). 화면 코드는 `app.js`·`app.css`, 흐름 편집기는 `flow.js` |
| `docs/` | 후킹 26패턴, 패키지 스키마, 작업 기록(work-log.md) |
| `data/` | 실행 기록·로그·BGM 순번(자동 생성) |

## 실행
필요: Python 3.10 이상. 관리 화면과 검수기는 추가 설치가 필요 없습니다.

```
python -m hub.server                  # http://127.0.0.1:4830  (내 PC에서만 열림)
python -m hub.runner --account top.pick00 --topic "데모" --dry-run ok    # 에이전트 없이 흐름 시험
python -m unittest discover -s tests -v                                   # 시험 17개
```

### 실제 에이전트 실행(비용 발생)
1. `pip install claude-agent-sdk`
2. `.env.example` 을 `.env` 로 복사하고 `ANTHROPIC_API_KEY` 입력(claude.ai 구독 한도는 서드파티 에이전트에 쓸 수 없음)
3. `python -m hub.runner --account top.pick00 --series 전세 --topic "전세 계약 전 확인"`
4. 승인함에서 결과 확인 → 승인

하루 한도(`hub/config.json` 의 `daily_budget_usd`)를 넘으면 실행이 거부됩니다.

운영 결정(2026-10-31): API 키는 하나, 비용은 에이전트 이름별로 집계. hub와 작업용 크롬 프로필은 외부 PC(C:\dev가 있는 PC)에만 둔다. 자세한 근거는 `docs/agent-roles.md` §5.

## 검수기가 막는 것
- 금지 BGM(M1·M3·M6). 시리즈명이 「세계의 ○○」면 M1→M3→M6 순서 로테이션만 허용. 그 밖의 시리즈는 직전과 같은 곡 금지
- 캡션 링크, 소개 댓글 누락, 표지 제목·후킹 패턴 누락
- 장면 속도: 글자 수(공백 포함) ÷ 읽기 속도보다 짧은 장면. 전체 길이 상한은 없음(30초 초과 허용)
- 음성: 본계정·top.pick01은 `ko-KR-SunHiNeural` + 장면마다 읽을 대본, 대본의 「1/3」 같은 순서 표시 금지
- 오정꿀: 음성 없음, 인스타 무료 음원만
- top.pick01 인물 릴스: 어느 나라 지도자인지 소개 필수

경고(승인은 가능): 첫 줄이 「~안 하면」식 조건 형태가 아님, 「나라가」·「나라면」 동시 사용.

## 알려진 한계(꼭 읽기)
- 실제 에이전트 호출(`run_sdk`)은 만든 환경에 API 키가 없어 **실행해 보지 못했습니다**. 드라이런, 검수기, 훅, 서버, 승인 흐름은 시험했습니다. 첫 실행에서 SDK 옵션 이름 때문에 오류가 나면 `hub/runner.py` 의 `run_sdk` 부분만 SDK 버전에 맞추면 됩니다.
- 훅 명령은 `$CLAUDE_PROJECT_DIR` 를 씁니다. Windows에서는 Claude Code 안에서 `/hooks` 로 등록됐는지, 첫 실행 때 `data/events.jsonl` 에 기록이 쌓이는지 확인하세요. `python` 대신 `py` 를 써야 하면 `.claude/settings.json` 을 고치세요.
- 읽기 속도 기준(초당 6자)과 최소 장면 시간(2.5초)은 제가 정한 가정값입니다. 실제 영상에 맞게 `hub/rules.json` 을 조정하세요.
- BGM 순번은 이 프로젝트의 `data/bgm_state.json` 에 따로 기록됩니다. 기존 `BGM_로테이션.md` 와 자동 연동되지 않으니 처음에는 맞춰 주세요.
- 영상 제작(렌더링)과 게시는 이 MVP에 없습니다. 에이전트는 패키지(후킹·장면·대본·BGM 지정·캡션·댓글)까지 만들고, 승인은 「게시 준비 완료」 표시입니다.
- 관리 화면은 `127.0.0.1` 에만 열리고 Host·헤더 검사를 합니다. 외부에 노출하지 마세요.
