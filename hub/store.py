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
    """팀 목록 = 켜진 도구의 팀(tools/*/tool.json) + 고객 수정분(data/agents.local.json).

    옛 설치본의 hub/agents.json 은 처음 한 번 data/agents.local.json 으로 옮겨 고객 수정분으로 쓴다."""
    old, local = HUB / "agents.json", DATA / "agents.local.json"
    if old.exists() and not local.exists():
        data = read_json(old, {}) or {}
        if isinstance(data, list):
            data = {"groups": [{"id": "all", "title": "에이전트", "lead": "", "purpose": "", "agents": data}]}
        write_json(local, data)
    from hub import toolkit  # 순환 import 방지
    return toolkit.teams()


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
    """결과: 인스타그램은 package.json(dict), 문서형 도구는 {"document": 본문}."""
    if not valid_id(rid):
        return None
    pkg = read_json(run_dir(rid) / "package.json")
    if pkg is not None:
        return pkg
    md = run_dir(rid) / "result.md"
    if md.exists():
        return {"document": md.read_text(encoding="utf-8")[:200_000]}
    return None


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


LIVE_TOOL_SEC = 120        # 마지막 도구 사용 뒤 이 시간 안이면 「일하는 중」
LIVE_TASK_MAX_SEC = 3 * 3600   # 끝 기록이 없는 맡긴 일은 이 시간이 지나면 끝난 것으로 본다(창을 닫은 경우)
MAIN_AGENT = "claude-main"     # PC에서 직접 대화하는 본 세션(총괄)


def live_agents(scan=4000, now=None):
    """훅 기록으로 지금 실제로 누가 무엇을 하는지 요약한다(모니터 「사무실」이 이대로 움직인다).

    돌려주는 값: {에이전트: {busy, since, last_ts, last_tool, last_detail, task, by, tools_today}}
    - busy: 맡긴 일이 진행 중이거나(agent_start 뒤 agent_stop 없음), 본 세션이 답하는 중이거나(turn_start 뒤 turn_end 없음),
            최근 LIVE_TOOL_SEC 안에 도구를 썼음
    """
    try:
        with open(EVENTS, "r", encoding="utf-8") as f:
            lines = f.readlines()[-scan:]
    except FileNotFoundError:
        return {}
    now = now or datetime.now().astimezone()
    today = now.date().isoformat()
    out, open_tasks, turn = {}, {}, {}

    def ts_of(e):
        try:
            return datetime.fromisoformat(e.get("ts", ""))
        except Exception:
            return None

    def slot(name):
        return out.setdefault(name, {"busy": False, "since": "", "last_ts": "", "last_tool": "", "last_detail": "",
                                     "task": "", "by": "", "tools_today": 0})
    for line in lines:
        try:
            e = json.loads(line)
        except json.JSONDecodeError:
            continue
        k = e.get("kind")
        name = e.get("agent") or MAIN_AGENT
        if k == "tool":
            # 서브에이전트 이름이 안 붙은 기록(옛 Claude Code)인데 맡긴 일이 딱 하나 진행 중이면 그 에이전트가 쓴 것으로 본다
            if not e.get("agent"):
                mine = [t for t in open_tasks.values() if t["session"] == e.get("session", "") and t["agent"] != MAIN_AGENT]
                if len(mine) == 1:
                    name = mine[0]["agent"]
            s = slot(name)
            s.update(last_ts=e.get("ts", ""), last_tool=e.get("tool", ""), last_detail=e.get("detail", ""))
            if (e.get("ts") or "").startswith(today):
                s["tools_today"] += 1
        elif k == "agent_start":
            open_tasks[e.get("task") or e.get("ts")] = {"agent": name, "ts": e.get("ts", ""), "detail": e.get("detail", ""),
                                                        "by": e.get("by") or MAIN_AGENT, "session": e.get("session", "")}
            slot(name).update(last_ts=e.get("ts", ""))
        elif k == "agent_stop":
            open_tasks.pop(e.get("task") or "", None)
            slot(name).update(last_ts=e.get("ts", ""), last_tool="", last_detail="맡은 일 끝남: " + (e.get("detail") or ""))
        elif k == "turn_start":
            turn[e.get("session", "")] = e.get("ts", "")
            slot(name).update(last_ts=e.get("ts", ""))
        elif k == "turn_end":
            turn.pop(e.get("session", ""), None)
            slot(name).update(last_ts=e.get("ts", ""))
    for t in open_tasks.values():
        st = ts_of(t)
        if st and (now - st).total_seconds() > LIVE_TASK_MAX_SEC:
            continue
        s = slot(t["agent"])
        s.update(busy=True, since=t["ts"], task=t["detail"], by=t["by"])
    for sess, ts in turn.items():
        st = ts_of({"ts": ts})
        if st and (now - st).total_seconds() <= LIVE_TASK_MAX_SEC:
            s = slot(MAIN_AGENT)
            s["busy"] = True
            s["since"] = s["since"] or ts
    for s in out.values():
        lt = ts_of({"ts": s["last_ts"]})
        if lt and (now - lt).total_seconds() <= LIVE_TOOL_SEC and s["last_tool"]:
            s["busy"] = True
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
        "agent_budgets_usd": cfg.get("agent_budgets_usd") or {},
        "per_agent": per_agent,
    }
