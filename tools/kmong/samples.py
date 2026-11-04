"""크몽 도구 드라이런용 가짜 자료(데모 문구, 사실 주장 아님)."""


def sample(topic, kind="service", category="", scenario="ok"):
    pkg = {
        "kind": kind or "service",
        "title": f"(데모) {topic}"[:38],
        "category": category or "마케팅 > SNS 마케팅",
        "summary": "(데모) 주제만 주시면 첫 3초 후킹부터 장면 대본까지 바로 쓸 수 있게 정리해 드립니다.",
        "description": "## 이런 분께 맞아요\n- 릴스를 꾸준히 올리고 싶은데 대본이 막히는 분\n\n## 작업 순서\n1. 주문 후 주제·채널을 알려 주세요\n2. 초안 전달\n3. 수정 반영 후 최종본 전달\n\n## 안내\n- 작업일은 주문 다음 날부터 셉니다.",
        "packages": [
            {"name": "STANDARD", "title": "대본 3편", "price": 30000, "days": 2, "revisions": 1, "includes": ["후킹 문장", "장면 대본 3편"]},
            {"name": "DELUXE", "title": "대본 6편", "price": 55000, "days": 3, "revisions": 2, "includes": ["후킹 문장", "장면 대본 6편", "캡션"]},
            {"name": "PREMIUM", "title": "대본 10편", "price": 85000, "days": 5, "revisions": 3, "includes": ["후킹 문장", "장면 대본 10편", "캡션", "소개 댓글"]},
        ],
        "faq": [{"q": "수정은 몇 번 되나요?", "a": "패키지별 수정 횟수 안에서 반영해 드립니다."}],
        "keywords": ["릴스 대본", "숏폼 대본", "인스타 릴스"],
        "after_order_message": "주문 감사합니다. 주제와 채널 성격을 메시지로 알려 주세요.",
        "preview_pages": [],
        "notes": ["데모 데이터: 실제 등록용이 아님"],
    }
    if kind == "ebook":
        pkg["preview_pages"] = [f"preview_{i}.png" for i in range(1, 6)]
    if scenario == "bad":
        pkg["description"] += "\n궁금한 점은 카톡 오픈채팅이나 010-1234-5678 로 문의 주세요. 업계 최고 품질, 100% A/S 보장!"
        pkg["packages"][1]["price"] = 35000
    return pkg
