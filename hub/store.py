"""JSON 파일 저장소. 외부 패키지 없이 동작한다."""
import json
import os
import re
import threading
import uuid
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HUB = ROOT / "hub"
DATA = ROOT / "data"
RUNS = DATA / "runs"
EVENTS = DATA / "events.jsonl"
WORKLOG = ROOT / "docs" / "work-log.md"
BGM_STATE = DATA / "bgm_state.json"

_lock = threading.Lock()
_ID_RE = re.compile(r"^[0-9A-Za-z-]{6,40}$")


def now():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def today():
    return datetime.now().astimezone().strftime("%Y-%m-%d")


def read_json(path, default=None):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def write_json(path, obj):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def config():
    return read_json(HUB / "config.json", {}) or {}


def rules():
    return read_json(HUB / "rules.json", {}) or {}


def load_groups():
    data = read_json(HUB / "agents.json", {}) or {}
    if isinstance(data, list):  # 옛 형식(평면 목록) 호환
        return [{"id": "all", "title": "에이전트", "lead": "", "purpose": "", "agents": data}]
    return data.get("groups", [])


def load_agents():
    return [a for g in load_groups() for a in g.get("agents", [])]


# ---- 실행(run) ----
def valid_id(rid):
    return bool(rid) and bool(_ID_RE.match(rid))


def run_dir(rid):
    return RUNS / rid


def new_run(agent, params):
    rid = datetime.now().strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:4]
    run = {
        "id": rid,
        "agent": agent,
        "params": params,
        "status": "queued",
        "created": now(),
        "history": [{"ts": now(), "status": "queued", "note": ""}],
        "cost_usd": None,
        "usage": None,
        "validation": None,
        "decision": None,
    }
    save_run(run)
    return run


def save_run(run):
    with _lock:
        write_json(run_dir(run["id"]) / "run.json", run)


def get_run(rid):
    if not valid_id(rid):
        return None
    return read_json(run_dir(rid) / "run.json")


def get_package(rid):
    if not valid_id(rid):
        return None
    return read_json(run_dir(rid) / "package.json")


def list_runs(limit=100):
    if not RUNS.exists():
        return []
    ids = sorted((p.name for p in RUNS.iterdir() if p.is_dir()), reverse=True)[:limit]
    runs = [read_json(RUNS / i / "run.json") for i in ids]
    return [r for r in runs if r]


STATUS_KO = {
    "queued": "대기", "running": "작업 중", "validating": "검수 중", "awaiting_approval": "승인 대기",
    "validation_failed": "검수 실패", "approved": "승인됨", "rejected": "반려됨", "error": "오류",
}


def set_status(run, status, note=""):
    run["status"] = status
    run["history"].append({"ts": now(), "status": status, "note": note})
    save_run(run)
    append_event({"kind": "status", "run": run["id"], "agent": run["agent"], "detail": f"{STATUS_KO.get(status, status)} {note}".strip()})


# ---- 이벤트 로그 ----
def append_event(ev):
    ev.setdefault("ts", now())
    with _lock:
        EVENTS.parent.mkdir(parents=True, exist_ok=True)
        with open(EVENTS, "a", encoding="utf-8") as f:
            f.write(json.dumps(ev, ensure_ascii=False) + "\n")


def tail_events(n=80):
    try:
        with open(EVENTS, "r", encoding="utf-8") as f:
            lines = f.readlines()[-n:]
    except FileNotFoundError:
        return []
    out = []
    for line in lines:
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return out


# ---- 작업 기록(docs/work-log.md) ----
def log_work(text):
    if os.environ.get("AGENT_HUB_NO_LOG"):  # 단위 시험에서는 작업 기록을 남기지 않는다
        return
    with _lock:
        WORKLOG.parent.mkdir(parents=True, exist_ok=True)
        existing = WORKLOG.read_text(encoding="utf-8") if WORKLOG.exists() else "# 작업 기록\n"
        header = f"## {today()}"
        if header not in existing:
            existing = existing.rstrip("\n") + f"\n\n{header}\n"
        existing = existing.rstrip("\n") + f"\n- {datetime.now().strftime('%H:%M')} · {text}\n"
        WORKLOG.write_text(existing, encoding="utf-8")


def read_worklog(max_chars=6000):
    try:
        return WORKLOG.read_text(encoding="utf-8")[-max_chars:]
    except FileNotFoundError:
        return ""


# ---- BGM 로테이션 상태 ----
def bgm_key(account, is_world):
    return f"{account}:{'world' if is_world else 'general'}"


def bgm_state():
    return read_json(BGM_STATE, {}) or {}


def bgm_record(account, is_world, bgm_id):
    st = bgm_state()
    st[bgm_key(account, is_world)] = bgm_id
    write_json(BGM_STATE, st)


# ---- 사용량 ----
def usage_summary():
    cfg = config()
    day = today()
    per_agent = {}
    total = 0.0
    for r in list_runs(500):
        if not r.get("created", "").startswith(day):
            continue
        cost = r.get("cost_usd") or 0.0
        total += cost
        a = per_agent.setdefault(r["agent"], {"runs": 0, "cost_usd": 0.0})
        a["runs"] += 1
        a["cost_usd"] += cost
    return {
        "date": day,
        "total_usd": round(total, 4),
        "budget_usd": cfg.get("daily_budget_usd"),
        "per_agent": per_agent,
    }
