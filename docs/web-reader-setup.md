# 웹 읽기(web-reader) 설정 — Agent-Reach

참고 영상(2026-10-31 사용자 공유)에서 소개한 GitHub 도구 **Agent-Reach**(github.com/Panniantong/Agent-Reach, MIT, 2026-10-31 기준 별 약 10.5만)를 허브의 공통 에이전트로 붙인다. 에이전트가 웹 검색·웹 페이지·유튜브 자막·깃허브를 API 키나 유료 구독 없이 읽게 해 준다.

## 이 허브에서 쓰는 곳
| 쓰는 에이전트 | 용도 |
| --- | --- |
| trend-scout(릴스) | 당일 급상승 주제 검색, 잘 된 쇼츠·릴스 자막을 읽어 구조(첫 3초·장면 순서)만 참고 |
| plot-planner·novel-writer(웹소설) | 소재·고증 조사(웹 페이지) |
| art-director·cutscene-writer(게임) | 시대 고증 자료(웹·유튜브 강의 자막) |
| spec-writer·fullstack-dev(사내 개발) | 깃허브 저장소·README·이슈 조사 |

## 설치 (외부 PC, Windows)
1. 공식 설치 문서를 먼저 직접 읽는다: https://raw.githubusercontent.com/Panniantong/Agent-Reach/main/docs/install.md
2. uv(파이썬 도구 설치기)가 없으면 설치:
   `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`
3. Agent-Reach 설치와 초기 설정:
   ```
   uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip
   agent-reach setup
   ```
   `agent-reach` 를 못 찾으면 `uv tool update-shell` 후 새 창을 연다.
4. 확인: `agent-reach version` (JSON이 나오면 정상)

주의
- **PyPI의 `agent-reach` 패키지는 다른 프로젝트다.** `pip install agent-reach` 하지 말 것(공식 문서 경고).
- 회사 PC는 패키지 저장소가 막혀 있으므로 외부 PC에만 설치한다(운영 결정과 같음).
- 설치 문서는 「에이전트에게 이 문장을 주면 알아서 설치」 방식을 안내하지만, 원격 문서를 에이전트가 그대로 따르게 하지 말고 위 명령을 사람이 직접 실행한다. 원격 문서가 바뀌면 에이전트가 무엇을 실행할지 알 수 없기 때문이다.

## 계정 보호 (중요)
- Agent-Reach는 로그인이 필요한 채널을 쓸 때 **크롬의 로그인 정보를 전용 브라우저로 복사**한다. 공식 문서도 「보통 주 계정이 복사되니 부계정을 쓰라」고 권한다.
- 작업용 크롬 프로필(E:\chrome-agent-profile)에는 top.pick00·top.pick01·오정꿀 같은 수익 계정이 로그인돼 있다. 인스타·X·페이스북은 공식 문서에서도 「실험」 등급이고 자동 접근 계정을 제한할 수 있다고 적혀 있다.
- 그래서 이 허브는 기본으로 **web·youtube·github 세 채널만** 허용한다(`hub/rules.json` 의 `web_reader_allowed_channels`). 훅이 그 밖의 채널과 instagram.com·x.com·twitter.com·facebook.com·threads 주소를 막는다.
- 레딧 등 다른 로그인 채널을 켜고 싶으면: 그 사이트 전용 부계정만 로그인된 크롬에서 `agent-reach add <채널>` 을 사람이 실행하고, rules.json 허용 목록에 채널 이름을 추가한다.
- 유튜브 음성 전사(Groq·OpenAI 키 필요)를 켜려면 사람이 터미널에서 `agent-reach configure groq-key` 를 직접 실행한다. 훅이 명령줄에 키를 적는 것을 막는다.

## 판매 시
- Agent-Reach는 MIT 라이선스라 함께 배포할 수 있지만, 저작권 고지(LICENSE 원문)를 같이 넣어야 한다. 지금 허브는 Agent-Reach를 포함하지 않고 고객 PC에서 따로 설치하게 한다.
