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
