# 에이전트 그룹과 역할 분배 (종합 검토)

기준일 2026-10-31. 지금까지 쌓인 작업 기록(릴스·이모티콘·웹소설·게임·사내 개발)을 다시 읽고, 반복되는 일을 "역할 하나 = 에이전트 하나"로 나눴다. 목록 원본은 `hub/agents.json`, 정의 파일은 `.claude/agents/`.

## 1. 나눈 원칙
1. **만드는 쪽과 검사하는 쪽을 가른다.** 제작 에이전트가 자기 결과를 채점하면 놓친다. 그래서 그룹마다 검수 역할(코드 검수 또는 읽기 전용 리뷰)을 따로 둔다.
2. **마지막 버튼은 사람이 누른다.** 게시·제출·결제·삭제는 에이전트가 하지 않는다. 브라우저 에이전트는 그 직전 화면에서 멈추고 승인함에 올린다. 예외는 이미 허락한 것뿐이다(LINE 약관 동의, LINE Release, 카카오 임시저장).
3. **규칙은 코드로, 취향은 스킬로.** 어기면 안 되는 것(금지 BGM, 커밋 금지, 캡션 링크)은 훅·검수기가 막고, 문체·톤 같은 것은 스킬 문서에 둔다.
4. **그룹 안에 리드 하나.** 요청이 들어오면 그룹 리드가 받아 순서대로 넘긴다. 관리자(hub)는 그룹을 고르고 로그·비용·승인만 본다.
5. **작업 장소를 지킨다.** 게임은 로컬 링크 PC에서만, 사내 개발은 커밋·푸시를 Cursor에서 직접. 회사 PC는 npm 레지스트리가 막혀 있으므로 설치가 필요한 일은 외부 PC에서.

## 2. 그룹별 흐름과 역할

### 릴스·SNS 그룹 (가장 먼저 가동)
```
trend-scout(주제 후보) → reels-maker(패키지) → reels-validator(코드 검수) → [reels-reviewer(의견)]
→ 승인함 → reels-renderer(영상) → insta-scheduler(예약 화면 채우기) → 사람이 「예약」 클릭 + 소개 댓글
```
| 역할 | 맡는 일 | 근거가 된 기록 |
| --- | --- | --- |
| trend-scout | 당일 급상승 주제, 전세·보증금 우선 | 「당일 트렌드를 그날그날 만들어 올릴 수 있게」, 「조회수 가장 많은 전세 주제로 몰아가기」 |
| reels-maker | 후킹 26패턴, 「~안 하면 / ~당해요」 첫 화면, 장면 속도, 여자 음성, BGM 로테이션 | 인수인계서 v3, 후킹 패턴, 2026-10-25·27·31 지시 |
| reels-validator | 위 규칙을 코드로 검사 | 금지 BGM M1·M3·M6과 「세계의 ○○」 예외, 순서 표시 읽기 문제 |
| reels-renderer | 사진·Edge TTS·BGM 합성 | 「제작은 PC의 Claude Code에서」 |
| insta-scheduler | 인스타 콘텐츠 예약 화면까지 | 「Claude 예약 작업이 아니라 인스타 콘텐츠 예약으로」 |
오정꿀은 별도 에이전트가 아니라 reels-maker가 `reels-ojeongkkul` 스킬을 불러 쓴다(음성 없음, 인스타 무료 음원).

### 이모티콘·굿즈 그룹
```
emoticon-planner(대사·장면 목록) → [그림 생성: 사용자/Firefly] → image-checker(불량 7항목) → upload-router(채널 분기) → goods-uploader(업로드 화면 채우기) → 사람이 제출
```
| 역할 | 맡는 일 | 근거 |
| --- | --- | --- |
| emoticon-planner | 24·32종 구성, 움직이는 세트는 전부 움직이게 | 「일부만 움직이는 구성 금지」, 세트별 콘셉트 기록 |
| image-checker | 인물 크기·동작·장면 맞춤·앵커·필체·글자·고증 | 2026-10-16 컷씬 검수 기준 |
| upload-router | 그림/배경 → OGQ·크라우드픽·미리캔버스·Adobe Stock / 캐릭터 → OGQ·카카오·LINE·마플샵 | 업로드 채널 분기 규칙, `upload-channel-routing` 스킬 |
| goods-uploader | 카카오는 시리즈명 선택 후 임시저장까지, LINE 약관 동의·Release 허용 | 2026-10-09 승인 사항 |

### 웹소설 그룹
```
plot-planner(회차 설계) → novel-writer(집필) → style-checker(AI 티·표준문체) → [argon-editor(퇴고)] → munpia-uploader(업로드 표준 맞춤·화면 채우기) → 사람이 등록 → reaction-watcher(반응)
```
| 역할 | 맡는 일 | 근거 |
| --- | --- | --- |
| novel-writer | 문피아 표준 P0~P9, 직설 문체, 절제 서술 걷어내기 | 문피아 표준 폴더, 먼치킨 문체_가이드 §46·47 |
| style-checker | AI 티 진단, 고칠 곳만 표시, 욕설 순화 금지 | `human-prose-ko` 스킬, 2026-10-17 퇴고 방침 |
| argon-editor | 크롬 Gemini Argon만 사용 | 「Gemini는 Argon만」 |
| munpia-uploader | 문장 사이 한 줄 띄우기, 수정 전 백업, 전 회차 검증, 예약 재배치는 승인 후 | 문피아_업로드_표준.md, 딸내미 연참 재배치 기록 |
작품마다 폴더와 규칙이 다르므로(먼치킨·딸내미·회기 347·낡은 화물차) 에이전트는 작품 폴더의 규칙을 표준보다 먼저 읽는다.

### 게임 개발 그룹
```
cutscene-writer(대본) → art-director(프롬프트) → image-checker(공용) → game-dev(코드·빌드) → store-release(등록 화면) → 사람이 제출
telegram-reporter: 송전탑 작업 50%·100% 시점 보고(모든 단계에 걸쳐)
```
| 역할 | 맡는 일 | 근거 |
| --- | --- | --- |
| cutscene-writer | 스타일 가이드 v2 | CUTSCENE_STYLE_GUIDE.md |
| art-director | Kling MCP 커넥터(로컬 API 금지), Firefly, 인물 앵커 | 그림 도구 규칙, 하늘 캐릭터 기준 모습 |
| game-dev | 요청한 부분만, WebGL 전환·K-pop 러닝 분리 | 게임 프로젝트 기록 |
| store-release | 플레이 스토어(com.ourfrequency.game)·앱인토스(천년의 장사꾼) | 출시 준비 결정 사항 |
게임 작업은 로컬 링크 PC(E:\dev\game, C:\dev\bitcoin)에서만 한다. 원격 세션이면 에이전트가 거부한다.

### 사내 개발 그룹
```
spec-writer(화면·계획서) → fullstack-dev(구현) → code-reviewer(읽기 전용 리뷰) → 사용자가 Cursor에서 커밋·푸시
work-logger: 모든 그룹 공통
```
| 역할 | 맡는 일 | 근거 |
| --- | --- | --- |
| spec-writer | patrol 「통합 IF 관리」 HTML, 사업화 계획서, Figma FASS 연동 | 2026-10-30 단일 기준 파일 결정 |
| fullstack-dev | 제때 AI(LibreChat·Bedrock·Cloudflare), 원가배분(Next.js), 디지털 트윈, VOC, EDR | 각 프로젝트 기록 |
| code-reviewer | 변경 범위 이탈, 키 노출, Bedrock 비용 | 「요청 외 임의 수정 금지」, IAM 차단 계획 |

## 3. 크롬 통제(browser-operator)
- 방식: 사용자가 크롬을 `--remote-debugging-port=9222`로 띄우고, 에이전트는 Playwright MCP가 CDP로 그 크롬에 붙는다. 로그인 세션(인스타·문피아·LINE·카카오·앱인토스)이 그대로 쓰인다. 설정은 `docs/browser-setup.md`.
- 사이드 패널(어사이드)·새 탭·파일 첨부 모두 같은 창에서 다룬다.
- 안전장치: `pre_tool_guard.py`가 Playwright 클릭 대상 글자에 「게시·공유·제출·등록·결제·삭제·Publish·Submit·Post·Delete」가 있으면 막는다. 허용된 예외(LINE I Agree·Release, 카카오 임시저장)는 통과한다. 그 밖의 최종 버튼은 사람이 누른다.
- 비밀번호·OTP 입력, 새 계정 로그인은 하지 않는다. 로그인이 풀려 있으면 멈추고 알린다.

## 3-1. 웹 읽기(web-reader, Agent-Reach)
- 에이전트가 웹 검색·웹 페이지·유튜브 자막·깃허브를 키 없이 읽게 하는 공통 에이전트. 릴스 trend-scout, 웹소설·게임 고증 조사, 사내 개발 자료 조사가 위임해 쓴다.
- 기본 허용 채널은 web·youtube·github. 인스타·X·페이스북은 수익 계정 보호를 위해 훅이 막는다. 설정과 이유는 docs/web-reader-setup.md.

## 3-2. 그림·PDF 반복 처리(image-batch, PhotoCraft·PdfCraft)
- 이미 만든 그림의 규격 맞춤·변환·일괄 보정과 PDF 처리만 맡는다. 그림 생성은 Firefly 규칙 그대로. 굿즈 흐름의 「그림 불량 검수」 다음 단계.
- 얼리 알파라 기본 꺼짐. 설정은 docs/craft-tools-setup.md.

## 4. 가동 순서(추천)
1. 릴스 그룹(지금 MVP) — 2주 운영
2. 공통 web-reader — 설치가 쉽고 읽기 전용이라 trend-scout에 먼저 붙인다
3. 공통 browser-operator — insta-scheduler부터 붙여 「예약 화면까지 자동」 확인
4. 웹소설 style-checker, 이모티콘 image-checker — 읽기 전용이라 위험이 낮음
5. goods-uploader·munpia-uploader — 브라우저 안전장치가 검증된 뒤
6. 게임·사내 개발 그룹 — 코드 수정이라 마지막. 커밋은 계속 사람이

## 5. 정한 것 (2026-10-31)
- **API 키는 하나.** 비용은 실행 기록의 에이전트 이름으로 집계한다(현황 화면의 에이전트별 비용). `.env`의 `ANTHROPIC_API_KEY` 하나만 둔다.
- **크롬 프로필은 작업 전용 프로필을 새로 만든다.** `E:\chrome-agent-profile`(docs/browser-setup.md). 이 프로필에는 작업 계정(top.pick00·top.pick01·오정꿀, 문피아 「최종추천」, LINE·카카오·OGQ·마플샵, 앱인토스)만 로그인하고 개인 계정은 넣지 않는다. 그래야 에이전트가 「현재 로그인 계정 확인」 단계에서 헷갈리지 않는다.
- **hub는 우선 외부 PC(C:\dev가 있는 PC)에 둔다.** 설치가 필요한 것(claude-agent-sdk, Playwright MCP)이 회사 PC에서는 npm 차단으로 안 되기 때문이다. BGM 순번·로그·승인 기록은 이 PC 하나에만 쌓인다. 회사 PC에서 급히 돌릴 일이 생기면 hub 폴더를 옮기지 말고 외부 PC에서 처리한다.
