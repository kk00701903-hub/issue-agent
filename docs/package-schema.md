# 릴스 패키지 스키마 (package.json)

```json
{
  "account": "top.pick00 | top.pick01 | ojeongkkul",
  "series": "시리즈명 (예: 전세, 세계의 지도자)",
  "type": "general | person",
  "topic": "주제 한 줄",
  "hook": { "line1": "첫 줄", "line2": "둘째 줄", "pattern": "고른 후킹 패턴 이름" },
  "cover_title": "표지 제목",
  "scenes": [
    { "text": "화면 글자", "seconds": 4.5, "voice_text": "읽을 대본(오정꿀은 생략)" }
  ],
  "bgm": { "id": "M2", "source": "local" },
  "voice": { "engine": "edge-tts", "name": "ko-KR-SunHiNeural" },
  "caption": "캡션(링크 금지)",
  "intro_comment": "소개 댓글",
  "leader_intro": "top.pick01 인물 릴스만: 어느 나라 대통령(지도자)인지 한 줄",
  "style": "오정꿀만: A 또는 B",
  "video_path": "영상 제작 단계에서 채움(선택). 있으면 승인함 미리보기에 재생됨",
  "notes": ["확인 필요 항목"]
}
```

- 오정꿀: `voice` 는 `null`, `bgm` 은 `{"source":"instagram_free","name":"..."}`, 장면에 `voice_text` 없음.
- `seconds` 는 그 장면이 화면에 머무는 시간. 글자를 다 읽을 시간이 있는지 검수기가 확인한다(`hub/rules.json` 의 읽기 속도 기준).

## 선택 항목 (2026-11-01 추가, 검수기는 아직 보지 않음)
```json
"plan": { "date": "2026-11-03", "topic": "전세", "type": "흔한 실수" },
"dm_cta": {
  "keyword": "전세",
  "comment_line": "댓글에 「전세」 남기면 계약 전 체크리스트 DM으로 보내드려요",
  "dm_gate": "팔로우 확인을 위해 아래 버튼을 눌러주세요. 확인되면 체크리스트를 바로 보내드려요",
  "button": "팔로우 확인",
  "retry": "팔로우 직후엔 확인이 늦을 수 있어요. 팔로우하고 한 번만 더 눌러 주세요",
  "retry_button": "팔로우 완료했어요",
  "deliver": "요청하신 체크리스트예요 👉 (링크)",
  "fallback_after": 2
}
```
- `plan`: 캘린더 칸에서 온 주제·유형(docs/benchmark-content-plan.md).
- `dm_cta`: 댓글→DM 자동 응답 문구(docs/benchmark-dm-funnel.md). 링크는 캡션이 아니라 `deliver` 에만. `fallback_after` 는 2 이하.
