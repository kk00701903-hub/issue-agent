---
name: insta-silent
description: 인스타그램 도구 — 음성 없는(무음) 계정의 릴스 패키지 작성 규칙. 도구 설정에서 profile 이 silent 인 계정에 쓴다.
---

# 무음 계정 릴스 규칙

- 음성 없음. `voice` 는 비워 두고(`null`), 장면에 `voice_text` 를 넣지 않는다.
- 음악은 인스타 무료 음원만 쓴다. `bgm` 은 `{"source":"instagram_free","name":"<곡 이름 또는 메모>"}` 로 적고 `id` 는 쓰지 않는다.
- 형식은 A(리액션) / B(파스텔) 두 가지다. `style` 에 `A` 또는 `B` 를 적는다.
- 후킹·캡션·소개 댓글·표지 규칙은 insta-reels 의 문장·캡션 부분과 같다. 장면 속도 규칙도 같다.
- 다른 계정과 계정·자료를 섞지 않는다.
