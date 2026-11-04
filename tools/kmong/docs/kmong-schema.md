# 크몽 서비스 자료 스키마 (package.json)

```json
{
  "kind": "service | ebook | knowhow",
  "title": "서비스 제목(40자 안팎, 공백 포함)",
  "category": "대분류 > 소분류",
  "summary": "목록에 보이는 요약(100자 안)",
  "description": "상세 설명(마크다운). 대상·작업 순서·제공 내용·안내",
  "packages": [
    {"name": "STANDARD", "title": "…", "price": 30000, "days": 2, "revisions": 1, "includes": ["…"]},
    {"name": "DELUXE",   "title": "…", "price": 55000, "days": 3, "revisions": 2, "includes": ["…"]},
    {"name": "PREMIUM",  "title": "…", "price": 85000, "days": 5, "revisions": 3, "includes": ["…"]}
  ],
  "faq": [{"q": "…", "a": "…"}],
  "keywords": ["서비스와 직접 관련된 검색어(5개 안)"],
  "after_order_message": "결제 후 안내 메시지(연락처·개인정보 요구 금지)",
  "preview_pages": ["전자책이면 미리보기 5장 이상 파일 이름"],
  "main_image": {"prompt": "메인 이미지 시안 설명(글자 없는 그림 + 제목은 사람이 얹음)"},
  "evidence": ["경력·수상·수익을 쓸 때만: 사용자가 준 증빙 설명"],
  "notes": ["확인 필요 항목"]
}
```
- 가격은 원 단위 숫자. 패키지는 1개 또는 3개, 3개면 가격이 올라가고 사이 차이 1만 원 이상.
