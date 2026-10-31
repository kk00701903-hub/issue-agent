# 크롬 통제 설정 (browser-operator)

에이전트가 **사용자의 크롬 창**(로그인 유지, 사이드 패널 포함)을 그대로 조작하는 방식입니다. 별도 브라우저를 띄우지 않으므로 인스타·문피아·LINE·카카오·앱인토스 로그인을 다시 할 필요가 없습니다.

## 1. 크롬을 디버그 포트로 실행 (Windows)
작업용 크롬 프로필을 따로 두는 것을 권합니다(개인 계정과 섞이지 않게).

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="E:\chrome-agent-profile"
```
- 처음 한 번 이 창에서 작업 계정에 로그인해 두면 다음부터 유지됩니다. 로그인할 계정: 인스타 top.pick00·top.pick01·오정꿀, 문피아(최종추천), LINE 크리에이터스, 카카오 이모티콘 스튜디오, OGQ, 마플샵, 레드버블, 앱인토스 콘솔. **개인 계정은 이 프로필에 넣지 않습니다.**
- 이 프로필은 외부 PC(C:\dev가 있는 PC) 전용입니다. hub도 그 PC에 둡니다.
- 바로가기로 만들어 두면 편합니다. 이 창이 열려 있을 때만 에이전트가 붙을 수 있습니다.
- 포트 9222는 내 PC 안에서만 열립니다. 공용 Wi-Fi 등에서는 방화벽이 외부 접근을 막는지 확인하세요.

## 2. Playwright MCP 연결
`.mcp.json` 에 등록돼 있습니다(`@playwright/mcp` 가 CDP 9222로 붙음). Node.js가 필요하고, 처음 실행 때 npx가 패키지를 받습니다. 회사 PC는 npm 레지스트리가 막혀 있으므로 외부 PC에서 먼저 받으세요.

Claude Code에서 확인: `/mcp` 에 playwright 가 연결됨으로 보이면 됩니다.

## 3. 안전장치
- `.claude/hooks/pre_tool_guard.py` 가 Playwright 클릭(`browser_click`)의 대상 글자를 검사합니다. 「게시·공유·제출·등록·결제·삭제·확인 후 게시·Publish·Share·Submit·Post·Pay·Delete」가 있으면 막습니다.
- 허용 예외(그대로 통과): LINE 「I Agree」·「Release」, 카카오 「임시저장」.
- 예외를 바꾸려면 `hub/rules.json` 의 `browser_block_words`·`browser_allow_words` 를 고칩니다(에이전트는 이 파일을 못 고칩니다).
- 비밀번호·OTP 입력과 새 로그인은 에이전트 정의에서 금지했습니다. 로그인이 풀리면 멈추고 알립니다.

## 4. 한계
- 글자가 없는 아이콘 버튼은 훅이 글자로 걸러내지 못합니다. 그래서 에이전트 정의에 「최종 버튼 직전에서 멈춘다」를 같이 두었습니다. 두 겹입니다.
- 인스타 릴스 업로드는 앱 전용 흐름(프로페셔널 대시보드 → 카메라 버튼)을 표준으로 정하셨습니다. 웹에서 되는 부분(콘텐츠 예약 화면 채우기)까지만 에이전트가 하고, 앱 전용 단계는 그대로 사람이 합니다.
