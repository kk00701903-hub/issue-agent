"""크몽 도구 — 서비스 등록 자료 검수기(코드로 하는 검사, LLM 아님).

사용: python -m tools.kmong.validator data/runs/<ID>/package.json
규칙 값: tools/kmong/rules.json(+ 작업공간 덮어쓰기). 근거: 크몽 노하우·콘텐츠 서비스 등록 가이드.
"""
import json
import re
import sys

from hub import toolkit

TOOL = "kmong"


def _t(v):
    return str(v or "").strip()


def _texts(pkg):
    """외부 연락처·절대 표현을 볼 모든 글(필드 이름, 글)."""
    out = [("title", pkg.get("title")), ("summary", pkg.get("summary")), ("description", pkg.get("description"))]
    for i, p in enumerate(pkg.get("packages") or [], 1):
        out += [(f"packages[{i}].title", p.get("title")), (f"packages[{i}].includes", " ".join(map(str, p.get("includes") or [])))]
    for i, f in enumerate(pkg.get("faq") or [], 1):
        out += [(f"faq[{i}]", f"{f.get('q', '')} {f.get('a', '')}")]
    out += [("keywords", " ".join(map(str, pkg.get("keywords") or []))), ("after_order_message", pkg.get("after_order_message"))]
    return [(k, _t(v)) for k, v in out if _t(v)]


def validate(pkg, ctx=None, rules=None):
    r = rules or (ctx or {}).get("rules") or toolkit.rules(TOOL)
    errors, warnings = [], []
    E = lambda rule, msg: errors.append({"rule": rule, "msg": msg})  # noqa: E731
    W = lambda rule, msg: warnings.append({"rule": rule, "msg": msg})  # noqa: E731

    for key in ("title", "category", "summary", "description"):
        if not _t(pkg.get(key)):
            E("required", f"{key} 가 비어 있음")
    kind = pkg.get("kind") or "service"
    if kind not in r.get("min_price", {}):
        E("kind", f"판매 형태(kind)는 {', '.join(r.get('min_price', {}))} 중 하나")
    if len(_t(pkg.get("title"))) > int(r.get("title_max", 40)):
        W("title_len", f"제목 {len(_t(pkg.get('title')))}자(공백 포함) — {r.get('title_max')}자를 넘으면 목록에서 잘릴 수 있음")
    if len(_t(pkg.get("summary"))) > int(r.get("summary_max", 100)):
        W("summary_len", f"요약 {len(_t(pkg.get('summary')))}자(공백 포함) — {r.get('summary_max')}자 안으로")

    # 패키지: 3단, 가격 차이, 최소 금액
    pk = pkg.get("packages") or []
    if len(pk) not in (1, 3):
        E("packages", "패키지는 1개 또는 3개(STANDARD·DELUXE·PREMIUM)")
    prices = []
    for i, p in enumerate(pk, 1):
        try:
            price = int(p.get("price"))
        except (TypeError, ValueError):
            E("price", f"패키지 {i}: price 가 숫자가 아님(가격을 예측할 수 없는 표현은 등록 불가)")
            continue
        prices.append(price)
        for key in ("title", "days"):
            if not _t(p.get(key)):
                E("required", f"패키지 {i}: {key} 가 비어 있음")
        if not p.get("includes"):
            E("required", f"패키지 {i}: 제공 내용(includes)이 비어 있음 — 제공 분량을 적어야 함")
        if p.get("revisions") in (None, ""):
            W("revisions", f"패키지 {i}: 수정 횟수(revisions)가 없음")
    minp = int((r.get("min_price") or {}).get(kind, 5000))
    if prices and min(prices) < minp:
        E("min_price", f"최소 판매 금액 {minp:,}원 이상({kind})")
    if len(prices) == 3:
        gap = int(r.get("package_gap_min", 10000))
        if not (prices[0] < prices[1] < prices[2]):
            E("package_order", "패키지 가격은 STANDARD < DELUXE < PREMIUM 순으로 올라가야 함")
        elif min(prices[1] - prices[0], prices[2] - prices[1]) < gap:
            E("package_gap", f"패키지 사이 가격 차이는 {gap:,}원 이상")

    # 전자책 미리보기
    if kind == "ebook" and len(pkg.get("preview_pages") or []) < int(r.get("ebook_preview_min", 5)):
        E("preview", f"전자책 미리보기는 {r.get('ebook_preview_min', 5)}장 이상(한 장씩, 가리기·블러 없이)")

    # 글 검사: 외부 연락처, 절대 표현, 무조건 보증, 가격 문의 유도, 증빙 필요 주장
    for field, text in _texts(pkg):
        for pat in r.get("contact_patterns", []):
            if re.search(pat, text, re.IGNORECASE):
                E("contact", f"{field}: 외부 연락처·링크·SNS 로 보이는 글이 있음(주문 전 외부 연락 금지)")
                break
        for w in r.get("absolute_words", []):
            if w in text:
                E("absolute", f"{field}: 「{w}」 같은 절대 표현은 쓸 수 없음")
                break
        for pat in r.get("guarantee_patterns", []):
            if re.search(pat, text, re.IGNORECASE):
                E("guarantee", f"{field}: 범위·조건 없는 무조건 보증 표현(예: 100% A/S, 무제한 수정)")
                break
        for pat in r.get("ask_price_patterns", []):
            if re.search(pat, text):
                E("ask_price", f"{field}: 「가격 문의」처럼 가격을 알 수 없는 표현")
                break
        for w in r.get("claim_words", []):
            if w in text and not pkg.get("evidence"):
                W("claim", f"{field}: 「{w}」 — 증빙(evidence)이 없으면 쓸 수 없음. 사용자에게 확인")
                break
    for i, f in enumerate(pkg.get("faq") or [], 1):
        if re.search(r"(연락처|전화번호|주민|계좌)", _t(f.get("q")) + _t(f.get("a"))):
            W("faq_privacy", f"FAQ {i}: 연락처·개인정보를 요구하는 듯한 문장")
    if len(pkg.get("keywords") or []) > 5:
        W("keywords", "검색 키워드가 많음 — 서비스와 직접 관련된 것만(무관한 단어 금지)")

    return {"passed": not errors, "errors": errors, "warnings": warnings,
            "stats": {"packages": len(pk), "min_price": min(prices) if prices else None}}


def main(argv):
    if len(argv) != 2:
        print("사용: python -m tools.kmong.validator <package.json>")
        return 2
    try:
        with open(argv[1], "r", encoding="utf-8") as f:
            pkg = json.load(f)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"passed": False, "errors": [{"rule": "file", "msg": str(e)}], "warnings": []}, ensure_ascii=False))
        return 1
    res = validate(pkg)
    print(json.dumps(res, ensure_ascii=False, indent=2))
    return 0 if res["passed"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
