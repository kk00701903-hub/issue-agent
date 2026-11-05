"""예약 작업(자동화): 정해진 시간에 돌아가는 일을 한곳에 모아 보고, 관리 화면이 직접 돌리거나(허브 실행) 다른 곳에서 도는 자동화의 실행 보고를 받는다.

- where="hub": 관리 화면 서버가 시간에 맞춰 러너로 실행한다(도구·에이전트·주제). 결과는 늘 승인함으로 간다 — 게시·제출은 사람이 한다.
  인사(근무 시프트·정직·해고)·예산·이용권 확인은 러너가 그대로 한다.
- where="external": Cowork 예약 작업·Windows 작업 스케줄러·Claude Code 등 다른 곳에서 도는 자동화. 여기서는 목록·시간표·실행 기록만 관리하고,
  그쪽 스크립트가 `python scripts/report_run.py <id> ok "메모"` 로 실행 결과를 알려 준다.
- data/schedules.json 에 저장(고객마다 다름, 판매본에 안 들어감).

시간 표기는 cron 5칸(분 시 일 월 요일, 요일 0=일요일)을 쓰고 화면에는 「매일 08:30」처럼 보여 준다.
"""
import json
import re
import secrets
import threading
import time
from datetime import datetime, timedelta

from hub import store, toolkit

FILE = store.DATA / "schedules.json"
AREAS = {"insta": "인스타그램", "game": "게임", "design": "디자인·퍼블", "dev": "개발", "novel": "웹소설", "goods": "이모티콘·굿즈",
         "kmong": "크몽", "invest": "투자", "etc": "기타"}
WHERE = {"hub": "관리 화면이 실행", "cowork": "Claude 예약 작업(Cowork)", "make": "Make 시나리오", "windows": "Windows 작업 스케줄러", "claude_code": "Claude Code(PC)", "other": "기타"}
DAY_KO = "일월화수목금토"
_lock = threading.Lock()


# ---------- cron ----------
def _field(spec, lo, hi):
    out = set()
    for part in str(spec).split(","):
        step = 1
        if "/" in part:
            part, st = part.split("/", 1)
            step = int(st)
        if part in ("*", ""):
            a, b = lo, hi
        elif "-" in part:
            a, b = (int(x) for x in part.split("-", 1))
        else:
            a = b = int(part)
        if a < lo or b > hi or a > b or step < 1:
            raise ValueError(spec)
        out.update(range(a, b + 1, step))
    return out


def parse_cron(expr):
    f = str(expr or "").split()
    if len(f) != 5:
        raise ValueError("cron 은 5칸(분 시 일 월 요일)")
    mi, ho, dom, mo, dow = _field(f[0], 0, 59), _field(f[1], 0, 23), _field(f[2], 1, 31), _field(f[3], 1, 12), _field(f[4].replace("7", "0"), 0, 6)
    return mi, ho, dom, mo, dow, f[2] == "*", f[4] == "*"


def next_run(expr, after=None):
    try:
        mi, ho, dom, mo, dow, dom_any, dow_any = parse_cron(expr)
    except (ValueError, TypeError):
        return None
    t = (after or datetime.now()).replace(second=0, microsecond=0) + timedelta(minutes=1)
    for _ in range(60 * 24 * 370):
        wd = (t.weekday() + 1) % 7   # 0=일
        day_ok = (t.day in dom) if dow_any else (wd in dow) if dom_any else (t.day in dom or wd in dow)
        if t.month in mo and day_ok and t.hour in ho and t.minute in mi:
            return t
        t += timedelta(minutes=1)
    return None


def human(expr):
    """cron → 「매일 08:30」 같은 말."""
    try:
        mi, ho, dom, mo, dow, dom_any, dow_any = parse_cron(expr)
    except (ValueError, TypeError):
        return expr or "-"
    f = expr.split()
    if f[0].isdigit() and f[1].startswith("*/"):
        return f"{f[1][2:]}시간마다 {int(f[0]):02d}분"
    if f[0].isdigit() and f[1] == "*":
        return f"매시간 {int(f[0]):02d}분"
    times = ", ".join(f"{h:02d}:{m:02d}" for h in sorted(ho) for m in sorted(mi)) if len(ho) * len(mi) <= 6 else f"{f[1]}시 {f[0]}분"
    if not dom_any and dow_any:
        return f"매월 {', '.join(str(d) for d in sorted(dom))}일 {times}"
    if dow_any:
        return f"매일 {times}"
    if dow == {1, 2, 3, 4, 5}:
        return f"평일 {times}"
    if dow == {0, 6}:
        return f"주말 {times}"
    return f"매주 {''.join(DAY_KO[d] for d in sorted(dow))} {times}"


# ---------- 저장 ----------
def load():
    try:
        d = json.loads(FILE.read_text(encoding="utf-8"))
        return d if isinstance(d, dict) else {"jobs": []}
    except (FileNotFoundError, json.JSONDecodeError):
        return {"jobs": []}


def _save(d):
    store.write_json(FILE, d)


def jobs():
    out = []
    for j in load().get("jobs", []):
        nr = next_run(j.get("cron")) if j.get("enabled", True) else None
        out.append({**j, "when": human(j.get("cron")), "next_run": nr.isoformat(timespec="minutes") if nr else "",
                    "area_name": AREAS.get(j.get("area"), j.get("area", "")), "where_name": WHERE.get(j.get("where"), j.get("where", ""))})
    return out


def status():
    return {"jobs": jobs(), "areas": AREAS, "where": WHERE}


def _clean(j, old=None):
    o = dict(old or {})
    name = str(j.get("name", o.get("name", ""))).strip()[:60]
    if not name:
        raise ValueError("이름을 적어 주세요")
    cron = " ".join(str(j.get("cron", o.get("cron", ""))).split())
    parse_cron(cron)
    where = j.get("where", o.get("where", "hub"))
    if where not in WHERE:
        raise ValueError("실행 위치를 확인하세요")
    area = j.get("area", o.get("area", "etc"))
    if area not in AREAS:
        area = "etc"
    o.update(name=name, cron=cron, where=where, area=area, enabled=bool(j.get("enabled", o.get("enabled", True))),
             note=str(j.get("note", o.get("note", "")))[:300], command=str(j.get("command", o.get("command", "")))[:300])
    if where == "hub":
        tool = str(j.get("tool", o.get("tool", "")))
        if not toolkit.manifest(tool):
            raise ValueError("관리 화면이 실행하려면 도구를 골라야 합니다")
        agent = str(j.get("agent", o.get("agent", ""))) or (toolkit.run_spec(tool) or {}).get("agent", "")
        params = j.get("params", o.get("params", {})) or {}
        o.update(tool=tool, agent=agent, params={str(k)[:30]: str(v)[:200] for k, v in dict(params).items()},
                 dry_run=bool(j.get("dry_run", o.get("dry_run", False))))
    return o


def save_job(j):
    with _lock:
        d = load()
        jid = str(j.get("id") or "")
        cur = next((x for x in d["jobs"] if x["id"] == jid), None)
        new = _clean(j, cur)
        if cur:
            cur.clear(); cur.update(new)
        else:
            new["id"] = "job_" + secrets.token_hex(4)
            new["created"] = datetime.now().astimezone().isoformat(timespec="seconds")
            new["history"] = []
            d["jobs"].append(new)
        _save(d)
    store.log_work(f"자동화: 예약 작업 {'고침' if cur else '추가'} — {new['name']} ({human(new['cron'])}, {WHERE[new['where']]})")
    return new


def delete_job(jid):
    with _lock:
        d = load()
        j = next((x for x in d["jobs"] if x["id"] == jid), None)
        if not j:
            return False
        d["jobs"].remove(j)
        _save(d)
    store.log_work(f"자동화: 예약 작업 지움 — {j['name']}")
    return True


def record(jid, status_, note="", run_id=""):
    """실행 기록(허브 실행·바깥 보고 둘 다)."""
    with _lock:
        d = load()
        j = next((x for x in d["jobs"] if x["id"] == jid), None)
        if not j:
            return False
        h = {"ts": datetime.now().astimezone().isoformat(timespec="seconds"), "status": status_, "note": str(note)[:200], "run": run_id}
        j["last_run"], j["last_status"], j["last_note"] = h["ts"], status_, h["note"]
        j["history"] = (j.get("history") or [])[-29:] + [h]
        _save(d)
    store.append_event({"kind": "schedule", "agent": j.get("agent", ""), "detail": f"{j['name']} · {status_}" + (f" · {note}" if note else "")})
    return True


def run_now(jid):
    """허브 실행 작업을 지금 한 번 돌린다(배경에서). 돌려주는 값: (ok, 메시지)."""
    j = next((x for x in load()["jobs"] if x["id"] == jid), None)
    if not j:
        return False, "없는 작업"
    if j.get("where") != "hub":
        return False, "다른 곳에서 도는 자동화는 여기서 실행하지 않습니다(그쪽에서 실행하면 기록이 들어옵니다)"
    threading.Thread(target=_execute, args=(j,), daemon=True).start()
    return True, "시작했습니다. 결과는 승인함으로 갑니다."


def _execute(j):
    from hub import runner
    params = dict(j.get("params") or {})
    if "{date}" in params.get("topic", ""):
        params["topic"] = params["topic"].replace("{date}", datetime.now().strftime("%m월 %d일"))
    try:
        run = runner.run_agent(j.get("agent"), params, dry_run=("ok" if j.get("dry_run") else None), tool=j.get("tool"))
        record(j["id"], run.get("status", "?"), (run.get("history") or [{}])[-1].get("note", ""), run.get("id", ""))
    except Exception as e:  # noqa: BLE001
        record(j["id"], "error", str(e)[:200])


# ---------- 시계 ----------
def _tick(now=None):
    now = (now or datetime.now()).replace(second=0, microsecond=0)
    for j in load().get("jobs", []):
        if j.get("where") != "hub" or not j.get("enabled", True):
            continue
        last = j.get("last_tick", "")
        nr = next_run(j["cron"], now - timedelta(minutes=1))
        if nr == now and last != now.isoformat():
            with _lock:
                d = load()
                x = next((y for y in d["jobs"] if y["id"] == j["id"]), None)
                if x:
                    x["last_tick"] = now.isoformat(); _save(d)
            threading.Thread(target=_execute, args=(j,), daemon=True).start()


def start_background():
    def loop():
        while True:
            try:
                _tick()
            except Exception:  # noqa: BLE001
                pass
            time.sleep(30)
    threading.Thread(target=loop, daemon=True, name="schedules").start()
