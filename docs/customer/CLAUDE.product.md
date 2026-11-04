# Agent Hub 작업 지침

이 폴더는 PC에서 도는 Claude 에이전트와 관리 화면(hub/), 도구(tools/)를 담는다.

## 공통 규칙
- 한국어로 답한다. 글자 수는 공백 포함으로 센다.
- 요청받은 부분만 고친다. 다른 곳을 바꿔야 하면 먼저 허락을 구한다.
- 게시·제출·결제·삭제 같은 최종 행동은 하지 않는다. 직전 화면에서 멈추고 보고한다(훅이 막는다).
- hub/ 와 .claude/ 아래의 규칙·훅·검수기는 수정하지 않는다(훅이 막는다).
- 결과물은 `data/runs/<실행 ID>/` 아래 도구가 정한 파일 하나다(인스타그램: package.json, 그 밖: result.md).

## 도구별
- 인스타그램: 계정마다 스킬이 다르다(음성 계정 `insta-reels`, 무음 계정 `insta-silent`). 후킹은 `tools/instagram/docs/hooking-patterns.md` 26패턴 중 하나를 고르고 `hook.pattern` 에 이름을 적는다. 저장 뒤 `python -m tools.instagram.validator <파일>` 로 검수해 오류가 0이 될 때까지 고친다.
- 그 밖의 도구: 결과 문서 맨 위에 한 줄 요약, 맨 끝에 「확인 필요」 목록을 둔다.
