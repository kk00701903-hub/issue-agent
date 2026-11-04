"""한 달 콘텐츠 계획표(릴스). 저장 위치: data/plans/<YYYY-MM>_<계정>.json

벤치마킹: 「30분 만에 한 달 콘텐츠 계획」 — 난이도(주 몇 회) → 업로드 요일·시간 → 메인 주제·하위 주제 → 콘텐츠 유형 → 한 달 달력.
화면(캘린더)에서 만들고 고치며, reels-maker 는 그날 칸의 주제·유형·제목을 받아 패키지를 만든다.
"""
import re

from hub import store, toolkit

MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
LEVELS = {"쉬움": 3, "보통": 5, "어려움": 7}
MAX_ITEMS = 62


def _path(month, account):
    return store.DATA / "plans" / f"{month}_{account}.json"


def valid(month, account):
    return bool(MONTH_RE.match(month or "")) and account in {a['id'] for a in toolkit.accounts('instagram')}


def load(month, account):
    if not valid(month, account):
        return None
    return store.read_json(_path(month, account), None) or {"month": month, "account": account, "items": []}


def _s(v, n):
    return str(v or "")[:n]


def clean(month, account, body):
    """화면에서 온 계획을 정해진 모양으로만 저장한다."""
    level = body.get("level") if body.get("level") in LEVELS else "보통"
    items = []
    for it in (body.get("items") or [])[:MAX_ITEMS]:
        if not isinstance(it, dict):
            continue
        date = _s(it.get("date"), 10)
        if not re.match(rf"^{month}-\d{{2}}$", date):
            continue
        items.append({
            "date": date,
            "time": _s(it.get("time"), 5) if re.match(r"^\d{2}:\d{2}$", str(it.get("time", ""))) else "19:00",
            "topic": _s(it.get("topic"), 40),
            "type": _s(it.get("type"), 20),
            "title": _s(it.get("title"), 120),
            "run_id": _s(it.get("run_id"), 40) or None,
        })
    items.sort(key=lambda x: (x["date"], x["time"]))
    return {
        "month": month, "account": account, "level": level, "per_week": LEVELS[level],
        "main_topic": _s(body.get("main_topic"), 40),
        "topics": [_s(x, 40) for x in (body.get("topics") or [])[:12] if str(x).strip()],
        "types": [_s(x, 20) for x in (body.get("types") or [])[:12] if str(x).strip()],
        "items": items, "updated": store.now(),
    }


def save(month, account, body):
    if not valid(month, account) or not isinstance(body, dict):
        return None
    plan = clean(month, account, body)
    store.write_json(_path(month, account), plan)
    store.log_work(f"콘텐츠 계획 저장 {month} · {account} · {len(plan['items'])}칸 ({plan['level']}, 주 {plan['per_week']}회)")
    return plan
