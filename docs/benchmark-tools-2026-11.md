# 도구 6개 검토·적용 (2026-11-01)

참고: 사용자가 보낸 카드 6장(바이브 트레이딩, OPEN-GEN-AI, Fincept Terminal, Claude Ads, Camofox Browser, HyperFrames). 저장소는 2026-11-01에 확인.

| 도구 | 무엇 | 라이선스 | 결정 |
| --- | --- | --- | --- |
| HyperFrames (heygen-com/hyperframes) | HTML·CSS·JS 로 짠 화면을 MP4 영상으로 렌더링. 클로드 코드 스킬 제공 | Apache-2.0 | **적용** — reels-renderer 의 렌더링 도구 |
| Claude Ads (AgriciDaniel/claude-ads) | 광고 계정 점검·계획·소재 제안 스킬(메타·구글·틱톡 등 12곳) | MIT | **적용(예정)** — 이모티콘·굿즈 그룹 ads-auditor, 읽기 전용 |
| OPEN-GEN-AI (Open Generative AI) | 이미지·영상·음성 모델 200개+ 한 화면 | MIT | **이미 적용** — media-studio(docs/media-studio-setup.md) |
| 바이브 트레이딩 (HKUDS/Vibe-Trading) | 백테스트·시장 분석·다중 에이전트 토론 트레이딩 에이전트 | MIT | **보류** — 아래 이유 |
| Fincept Terminal | 암호화폐·시장 데이터 터미널 | AGPL-3.0 | **보류** — 아래 이유 |
| Camofox Browser | 봇 탐지를 피하는 에이전트용 브라우저 | MIT | **적용 안 함** — 아래 이유 |

## 1. HyperFrames → 릴스 영상 만들기(reels-renderer)
- 왜: 사용자 규칙 「top.pick03 진행자 그림이 말하는 것처럼 움직이되 영상 생성이 아닌 다른 방법」, 「top.pick00 대출찬반 룰(실사진 1초 남짓마다 펀치 줌·번쩍, 큰 숫자 도장, 0초부터 큰 글자·빨간 띠)」을 **코드로** 정확히 반복할 수 있다. 같은 틀에 주제만 바꿔 수십 편을 찍어낼 수 있다.
- 설치(PC, 한 번): Node.js 22 이상, FFmpeg 필요.
  ```
  npx hyperframes init reels-template
  cd reels-template
  npx hyperframes preview      ← 브라우저로 미리보기
  npx hyperframes render       ← MP4 출력
  ```
  클로드 코드 스킬: `claude plugin marketplace add heygen-com/hyperframes` → `claude plugin install hyperframes@hyperframes`
- 우리 규칙 맞추기
  - 화면 크기는 세로 1080×1920 으로 정한다(예시는 가로 1920×1080 이라 바꿔야 함).
  - 장면 길이는 검수기 기준(글자 수 ÷ 초당 6자, 최소 2.5초)을 그대로 쓴다. 빠른 사진 넘김은 장면 **안**에서 하고, 글자가 떠 있는 시간은 줄이지 않는다.
  - 소리: `<audio>` 로 음성(본계정 SunHi, top.pick03 Chirp3-HD)과 표준 BGM 을 낮게. 금지 BGM(M1·M3·M6)·로테이션 규칙 그대로.
  - 장면 그림은 Firefly, 01계정 인물 릴스는 인물 사진 필수(기존 규칙).
  - 기존 파이썬 렌더러(reels_1101g.py)를 당장 바꾸지 않는다. 같은 릴스 하나를 두 방식으로 만들어 비교한 뒤 사용자가 고른다.
- 일부 기능(HeyGen 아바타 등)은 HeyGen 계정이 필요할 수 있다. 우리는 로컬 렌더링만 쓴다.

## 2. Claude Ads → 광고 점검(ads-auditor, 예정)
- 광고를 돌릴 때만 켠다(쿠팡 파트너스·마플샵·이모티콘 홍보 등).
- 사람이 광고 관리자에서 내보낸 CSV·캡처로만 점검한다. 광고 켜기(launch)·예산 바꾸기·결제는 하지 않는다(이 스킬에도 `--draft` 로 초안만 만드는 방식이 있음).
- 설치는 공식 릴리스 압축 파일을 받아 SHA256 확인 후. 인터넷 설치 스크립트를 바로 실행하지 않는다.

## 3. 보류한 것과 이유
**바이브 트레이딩·Fincept Terminal**
- 지금 Agent Hub 의 6개 그룹(릴스·굿즈·웹소설·게임·사내 개발·공통) 어디에도 맞는 일이 없다.
- 실제 돈이 오가는 일이다. 에이전트가 주문을 넣는 구조는 넣지 않는다. 쓴다면 「백테스트·분석 보고서만, 주문은 사람이」인 별도 그룹을 만들어야 하고, 이건 사용자가 정할 일이다. 분석 결과는 투자 조언이 아니다.
- Fincept Terminal 은 AGPL-3.0 이라, Agent Hub(판매용)에 넣어 함께 배포하면 Agent Hub 전체 소스를 공개해야 할 수 있다. 쓰더라도 따로 설치해 따로 쓰고, 코드는 섞지 않는다.

**Camofox Browser — 적용하지 않음**
- 핵심 기능이 「봇 탐지 회피·브라우저 지문 위장」이다. 인스타·카카오·LINE·문피아 같은 사이트에서 이걸 쓰면 이용약관 위반이고, 걸리면 수익 계정이 막힌다(지금까지 지켜 온 「수익 계정 보호」 규칙과 정면으로 부딪힘).
- 우리 크롬 통제는 사용자의 실제 크롬(작업 전용 프로필)을 쓰고, 최종 버튼은 사람이 누르는 방식을 그대로 둔다.

## 4. 바뀐 파일
- `hub/agents.json`: reels-renderer 역할에 HyperFrames 렌더링 추가(기존 「인수인계서 v3 절차」 문장 유지), 이모티콘·굿즈 그룹에 ads-auditor(예정) 추가.
