# 다른 AI 모델·플랫폼 8개 반영 (2026-11-03)

참고: 사용자가 보낸 카드 8장(Qwen Studio, StepFun 3.5, Dreamina, GLM 5.3 Flash, Kimi, Xiaomi MiMo-V2.6-Pro, Ling 3.1 Flash, DeepSeek). 카드에 적힌 판 이름(3.8 Max, 5.3 Flash, V2.6-Pro, 4.1 Flash 등)은 카드 그대로이고, 접속 주소·모델 이름은 각 사 문서 기준이라 쓰기 전에 한 번 맞춰 본다(`hub/config.json` 의 `providers` 에서 고칠 수 있음).

## 1. 어떻게 넣었나 — 「작업별 모델 라우팅」
Agent Hub 는 지금까지 Claude 하나만 썼다. 이제 `hub/models.py` 가 작업 이름에 따라 제공자를 고른다. **기본은 전부 Claude** 이고, 바꾸고 싶은 작업만 `hub/config.json` 의 `model_routes` 에 적는다.

```json
"model_routes": {
  "flow":  {"provider": "anthropic"},
  "trend": {"provider": "deepseek"},
  "reels_draft": {"provider": "kimi", "model": "kimi-k2-0905-preview"}
}
```
키는 `.env` 에만 넣는다(예: `DEEPSEEK_API_KEY=`). 설정 파일·코드에 키를 적지 않는다.

| 이름 | 카드 내용 | 끝점(OpenAI 호환) | 키 이름 | 쓸 만한 곳 |
| --- | --- | --- | --- | --- |
| anthropic | Claude (기본) | Anthropic | ANTHROPIC_API_KEY | 모든 작업, 원고·사내 자료는 여기만 |
| deepseek | DeepSeek V4.1 Flash — 추론·코딩·도구, 채팅 무료 | api.deepseek.com/v1 | DEEPSEEK_API_KEY | 트렌드 요약·흐름 설계(값이 싸서 자주 돌리는 일) |
| kimi | Kimi(Moonshot) — 긴 문서·리서치·보고서 | api.moonshot.ai/v1 | MOONSHOT_API_KEY | 공개 자료 긴 글 요약(유튜브 자막·뉴스 묶음) |
| glm | GLM 5.3 Flash(Zhipu) — 코딩·추론·그림 이해, 3,200억 중 180억 활성 | open.bigmodel.cn/api/paas/v4 | ZHIPU_API_KEY | 공개 화면 캡처 읽기, 릴스 표지 대비 확인 보조 |
| stepfun | StepFun 3.5 — 코딩·에이전트, 256K | api.stepfun.com/v1 | STEPFUN_API_KEY | 공개 코드(오픈소스 도구) 분석 |
| qwen | Qwen Studio(Alibaba) — 글·리서치·코딩·파일 분석·그림 | dashscope-intl…/compatible-mode/v1 | DASHSCOPE_API_KEY | 공개 자료 리서치 보조 |
| mimo | Xiaomi MiMo-V2.6-Pro — 글·그림·소리·영상 이해 | api.xiaomimimo.com/v1 (확인 필요) | MIMO_API_KEY | 참고 영상(공개 릴스) 내용 파악 |
| openrouter | Ling 3.1 Flash(InclusionAI, 262K, 무료) 등 | openrouter.ai/api/v1 | OPENROUTER_API_KEY | 무료 모델 시험 |

**Dreamina(ByteDance)** 는 그림·영상 생성 도구라 모델 라우팅이 아니라 그림·영상 규칙에 걸린다. 그림은 Firefly, 영상은 Kling 이 기본(사용자 규칙)이므로 **비교 시안용 후보**로만 적어 둔다(docs/media-studio-setup.md 와 같은 취급). 기본 도구를 바꾸려면 사용자가 정한다.

## 2. 자료 등급 — 무료·해외 모델에 보내면 안 되는 것
무료 서비스는 보낸 내용을 학습에 쓸 수 있고, 모두 해외(중국) 서버다. 그래서 작업마다 등급을 정해 두었고 **코드가 강제한다**(`models.TASK_DATA`).

| 등급 | 작업 | 보낼 수 있는 제공자 |
| --- | --- | --- |
| 비공개(private) | 웹소설 원고(novel), 사내 개발·고객 자료(company), 코드 리뷰(review) | Claude 만. 다른 제공자를 적어도 자동으로 Claude 로 돌아감 |
| 공개(public) | 흐름 설계(flow), 트렌드 조사(trend), 릴스 초안(reels_draft) | 어느 제공자든 |

- 릴스 초안도 공개 뉴스 기반일 때만. 미공개 기획·계정 수치(인사이트 내보내기)는 보내지 않는다.
- 인스타 로그인·수익 계정 정보는 어느 모델에도 보내지 않는다(기존 규칙).
- 채팅 화면(Qwen Studio·Kimi·DeepSeek 앱)을 사람이 직접 쓸 때도 같은 기준: 원고·사내 자료는 붙여 넣지 않는다.

## 3. 화면
설정 → 「모델」 칸에 작업별 제공자·모델·자료 등급·키 유무가 보인다. 키가 「없음」이면 그 작업은 Claude 로 돈다(Claude 키도 없으면 흐름 설계는 규칙 기반).

## 4. 하지 않은 것
- 실행기(runner)의 에이전트 본체는 Claude Agent SDK 라 Claude 그대로다. 라우팅은 흐름 설계처럼 **한 번 묻고 답 받는 작업**에만 붙는다. 트렌드·릴스 초안은 라우팅 이름만 먼저 만들어 두었고, 그 에이전트가 실행기에 연결될 때 같은 `models.complete("trend", …)` 를 쓰면 된다.
- 끝점 주소·모델 이름은 2026-11-03 기준 각 사 문서를 바탕으로 적었고 실제 호출은 키가 없어 시험하지 못했다(가짜 응답으로 요청 주소·사용량 변환만 시험). 처음 쓸 때 설정 → 모델 칸에서 키가 「있음」으로 바뀌는지, 흐름 「AI로 만들기」가 그 제공자 이름으로 돌아오는지 확인한다.
