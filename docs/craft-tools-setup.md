# 그림·PDF 반복 처리(image-batch) 설정 — ArtCraft PhotoCraft·PdfCraft

참고 영상(2026-10-31 사용자 공유)의 내용을 확인해서 반영했다.

## 영상과 실제가 다른 점
| 영상 | 확인한 사실(2026-10-31) |
| --- | --- |
| 「어도비가 통째로 풀렸다」 | 어도비와 무관. 개발자 storytold가 클로드로 처음부터 새로 만든 오픈소스 앱 묶음(ArtCraft). 어도비 코드가 아님 |
| 포토샵·일러스트·프리미어 등 12개가 0원 | 앱은 12개 있고 무료(MIT 또는 Apache-2.0). 단 **쓸 만한 수준은 PhotoCraft(이미지)·PdfCraft(PDF) 둘, 얼리 알파**. 나머지 10개는 개발 중 |
| 앱마다 명령어·MCP로 클로드가 조작 | 사실. PhotoCraft는 `photocraft-cli run/batch/mcp`, MCP 도구 25개. PdfCraft도 CLI·MCP 제공 |
| 별 17만 | 합계 수치는 확인 못 함. PhotoCraft 단독 약 7.4만(2026-10-31) |
README도 「아직 일상적인 전문 작업용 포토샵 대체가 아니다」라고 적고 있다. 생성형(AI) 기능은 없다.

## 이 허브에서 쓰는 범위
- **쓰는 것**: 이미 만든 그림의 규격 맞춤·형식 변환·일괄 보정, PSD 레이어 내보내기, PDF 합치기·텍스트 추출. 포토샵을 켜지 않고 반복 작업을 돌리는 용도.
- **안 쓰는 것**: 새 그림 생성. 그래픽 생성은 기존 규칙대로 Firefly(「포토샵 써라」면 포토샵+Firefly).
- 포토샵 MCP(이미 등록돼 있음)와 겹치는 기능은 포토샵이 우선. PhotoCraft는 포토샵을 켜기 싫은 대량 처리, 또는 고객 PC에 포토샵이 없는 판매용 기본 도구로 쓴다.

## 설치 (외부 PC, Windows)
1. https://github.com/storytold/photocraft/releases 에서 Windows MSI(x64) 또는 portable zip을 받는다(코드 서명됨). PdfCraft도 같은 방식.
2. 받은 버전을 `hub/rules.json` 에 적는다(예: `"craft_versions": {"photocraft": "0.8.2"}`) — 판이 하루에 몇 번씩 바뀌므로 고정한다.
3. 확인: `photocraft-cli --help`
4. Claude Code에 MCP로 붙이려면 `.mcp.photocraft.example.json` 의 내용을 `.mcp.json` 의 `mcpServers` 에 합친다. 읽기·쓰기 폴더를 `data/media`(원본)와 `data/media/out`(결과)로 제한해 둔 설정이다. 정확한 옵션 이름은 설치한 버전의 `photocraft-cli mcp --help` 로 확인한다.

## 안전장치
- 훅이 `photocraft-cli run`·`batch`·`pdfcraft-cli` 명령에서 `--out` 이 없거나 입력 경로와 같으면 막는다(원본 덮어쓰기 방지).
- MCP로 쓸 때 요청을 한꺼번에 보내면 순서가 뒤바뀌어 실패한다는 보고가 있다. 에이전트 정의에 「응답을 받은 뒤 다음 요청」 규칙을 둔다.

## 판매 시
- MIT/Apache-2.0 이라 같이 쓸 수 있지만 **ArtCraft 이름·로고는 라이선스에서 제외**된다. 우리 제품 화면·홍보물에 ArtCraft 상표를 쓰지 않고, 「PhotoCraft(오픈소스) 연동 가능」 정도로만 적는다. 묶어서 배포하면 LICENSE 원문을 동봉한다.
- 얼리 알파라 고객 기본 기능으로 넣지 말고 「선택 연동」으로 둔다.
