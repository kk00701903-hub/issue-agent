"""도구(Tool) 레지스트리 — 판매 단위.

구조
- 도구 = tools/<id>/tool.json(판매용 카탈로그, 고객 공통) + 도구 폴더의 규칙·검수기·스킬·문서.
- 작업공간 설정 = data/tools/<id>.json(고객마다 다름, 판매본에 안 들어감):
    {"enabled": true|false, "agents": [연결한 에이전트], "settings": {...}, "rules": {규칙 덮어쓰기}}
- 에이전트는 도구에 「연결」해서 쓴다. 실행기는 (도구 켜짐 + 이용권에 포함 + 에이전트 연결됨)일 때만 돌린다.
- 팀(관리 화면·사무실의 방) = 켜진 도구의 team + 공용 에이전트(shared). data/agents.local.json 이 있으면 고객 수정분을 덮어쓴다.
"""
import copy
import importlib
import json
import re

from hub import store

TOOLS_DIR = store.ROOT / "tools"
WS_DIR = store.DATA / "tools"
LOCAL_AGENTS = store.DATA / "agents.local.json"
ID_RE = re.compile(r"^[a-z][a-z0-9_-]{1,30}$")
CORE_TOOL = "shared"


# ---------- 카탈로그 ----------
def manifests():
    out = {}
    if not TOOLS_DIR.is_dir():
        return out
    for p in sorted(TOOLS_DIR.glob("*/tool.json")):
        m = store.read_json(p)
        if isinstance(m, dict) and ID_RE.match(str(m.get("id", ""))):
            out[m["id"]] = m
    return out


def manifest(tool_id):
    return manifests().get(tool_id)


# ---------- 작업공간 설정 ----------
def _ws_path(tool_id):
    return WS_DIR / f"{tool_id}.json"


def workspace(tool_id):
    return store.read_json(_ws_path(tool_id), {}) or {}


def _save_ws(tool_id, ws):
    store.write_json(_ws_path(tool_id), ws)


def entitled(tool_id):
    """이용권(라이선스)에 이 도구가 들어 있는가. 공용 에이전트는 항상 포함."""
    if tool_id == CORE_TOOL:
        return True
    from hub import license
    feats = license.features()
    return "*" in feats or tool_id in feats


def enabled(tool_id):
    m = manifest(tool_id)
    if not m:
        return False
    if m.get("core"):
        return True
    ws = workspace(tool_id)
    on = ws.get("enabled")
    if on is None:
        on = m.get("default_enabled", True)
    return bool(on) and entitled(tool_id)


def connected_agents(tool_id):
    m = manifest(tool_id) or {}
    ws = workspace(tool_id)
    names = ws.get("agents")
    if names is None:
        names = m.get("default_agents", [])
    seen, out = set(), []
    for n in names:
        if n not in seen:
            seen.add(n)
            out.append(n)
    return out


def settings(tool_id):
    m = manifest(tool_id) or {}
    base = copy.deepcopy(m.get("settings", {}))
    base.update(workspace(tool_id).get("settings", {}) or {})
    return base


def rules(tool_id):
    """도구 기본 규칙(tools/<id>/rules.json) ⊕ 작업공간 덮어쓰기."""
    base = store.read_json(TOOLS_DIR / tool_id / "rules.json", {}) or {}
    base = {k: v for k, v in base.items() if not k.startswith("_")}
    base.update(workspace(tool_id).get("rules", {}) or {})
    return base


def accounts(tool_id="instagram"):
    acc = settings(tool_id).get("accounts") or []
    return [a for a in acc if isinstance(a, dict) and a.get("id")]


def account(tool_id, acc_id):
    for a in accounts(tool_id):
        if a["id"] == acc_id:
            return a
    return None


# ---------- 바꾸기(관리 화면) ----------
def set_enabled(tool_id, on):
    if not manifest(tool_id):
        return None
    ws = workspace(tool_id)
    ws["enabled"] = bool(on)
    _save_ws(tool_id, ws)
    return ws


def connect(tool_id, agent, on):
    if not manifest(tool_id) or agent not in all_agent_names():
        return None
    ws = workspace(tool_id)
    names = connected_agents(tool_id)
    if on and agent not in names:
        names.append(agent)
    if not on:
        names = [n for n in names if n != agent]
    ws["agents"] = names
    _save_ws(tool_id, ws)
    return names


ACC_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,40}$")


def save_settings(tool_id, new):
    """설정 저장. 계정 목록은 형식을 검사한다(id·label·profile·skill·person_intro)."""
    m = manifest(tool_id)
    if not m or not isinstance(new, dict):
        return None
    ws = workspace(tool_id)
    cur = ws.get("settings", {}) or {}
    allowed = set((m.get("settings") or {}).keys())
    for k, v in new.items():
        if k not in allowed:
            continue
        if k == "accounts":
            clean = []
            for a in v if isinstance(v, list) else []:
                if not isinstance(a, dict) or not ACC_ID_RE.match(str(a.get("id", ""))):
                    continue
                clean.append({"id": a["id"], "label": str(a.get("label") or a["id"])[:30],
                              "profile": "silent" if a.get("profile") == "silent" else "voice",
                              "skill": str(a.get("skill") or ("insta-silent" if a.get("profile") == "silent" else "insta-reels"))[:40],
                              "person_intro": bool(a.get("person_intro")),
                              "main": str(a.get("main") or "")[:40],
                              "topics": [str(x)[:40] for x in (a.get("topics") or []) if str(x).strip()][:20]})
            if not clean:
                continue
            cur["accounts"] = clean[:20]
        elif isinstance(v, list):
            cur[k] = [str(x)[:60] for x in v][:30]
        else:
            cur[k] = str(v)[:300]
    ws["settings"] = cur
    _save_ws(tool_id, ws)
    return settings(tool_id)


def save_rules(tool_id, new):
    """규칙 덮어쓰기(작업공간). 도구 기본 규칙에 있는 키만 받는다."""
    base = store.read_json(TOOLS_DIR / tool_id / "rules.json", None)
    if base is None or not isinstance(new, dict):
        return None
    ws = workspace(tool_id)
    cur = ws.get("rules", {}) or {}
    for k, v in new.items():
        if k in base and not k.startswith("_"):
            if type(base[k]) is list:
                v = [str(x)[:40] for x in (v if isinstance(v, list) else [])][:30]
            elif isinstance(base[k], (int, float)):
                try:
                    v = float(v)
                except (TypeError, ValueError):
                    continue
            else:
                v = str(v)[:200]
            cur[k] = v
    ws["rules"] = cur
    _save_ws(tool_id, ws)
    return rules(tool_id)


# ---------- 팀·에이전트 ----------
def _local_agents():
    return store.read_json(LOCAL_AGENTS, {}) or {}


def all_agent_names():
    names = set()
    for m in manifests().values():
        for a in (m.get("team") or {}).get("agents", []):
            names.add(a["name"])
    for g in _local_agents().get("groups", []):
        for a in g.get("agents", []):
            names.add(a.get("name"))
    return names


def teams(include_disabled=False):
    """관리 화면·사무실에 보일 팀 목록. 고객 수정분(data/agents.local.json)을 이름 기준으로 덮어쓴다."""
    local = {g.get("id"): g for g in _local_agents().get("groups", [])}
    out = []
    for tid, m in manifests().items():
        t = m.get("team")
        if not t or (not include_disabled and not enabled(tid)):
            continue
        t = copy.deepcopy(t)
        t["tool"] = tid
        lg = local.get(t["id"])
        if lg:
            for k in ("title", "purpose", "lead", "flow", "status_step"):
                if k in lg:
                    t[k] = lg[k]
            by = {a["name"]: a for a in t["agents"]}
            for a in lg.get("agents", []):
                if a.get("name") in by:
                    by[a["name"]].update(a)
                else:
                    t["agents"].append(a)
        out.append(t)
    # 도구에 없는 고객 팀(직접 만든 팀)도 보인다
    have = {t["id"] for t in out}
    for gid, lg in local.items():
        if gid and gid not in have and not _team_owner(gid):
            out.append({**lg, "tool": None})
    orders = {tid: m.get("order", 50) for tid, m in manifests().items()}
    out.sort(key=lambda t: (orders.get(t.get("tool"), 80), t["id"]))
    return out


def _team_owner(team_id):
    for tid, m in manifests().items():
        if (m.get("team") or {}).get("id") == team_id:
            return tid
    return None


def tool_of_agent(agent):
    for tid, m in manifests().items():
        if any(a["name"] == agent for a in (m.get("team") or {}).get("agents", [])):
            return tid
    return None


# ---------- 실행 ----------
def run_spec(tool_id):
    return (manifest(tool_id) or {}).get("run") or {}


def check_run(tool_id, agent):
    """실행해도 되는지. 돌려주는 값: (ok, 이유)"""
    m = manifest(tool_id)
    if not m:
        return False, f"없는 도구: {tool_id}"
    if not entitled(tool_id):
        return False, f"「{m['name']}」 도구가 이용권(요금제)에 없음"
    if not enabled(tool_id):
        return False, f"「{m['name']}」 도구가 꺼져 있음(관리 화면 → 도구에서 켜기)"
    if agent not in connected_agents(tool_id):
        return False, f"{agent} 에이전트가 「{m['name']}」 도구에 연결되어 있지 않음(관리 화면 → 도구 → 에이전트 연결)"
    return True, ""


def build_prompt(tool_id, agent, params, out_path):
    m = manifest(tool_id) or {}
    spec = m.get("run") or {}
    vals = {k: (str(v) if v not in (None, "") else "(없음)") for k, v in (params or {}).items()}
    vals.update(agent=agent, tool_name=m.get("name", tool_id), out=out_path)
    if tool_id == "instagram":
        acc = account(tool_id, params.get("account")) or {}
        vals["skill"] = acc.get("skill") or ("insta-silent" if acc.get("profile") == "silent" else "insta-reels")
    d = str((params or {}).get("details") or "").strip()
    vals["details_line"] = f"- 자세한 요청: {d}" if d else ""
    lines = []
    for line in spec.get("prompt", []):
        try:
            lines.append(line.format_map(_Default(vals)))
        except (ValueError, IndexError):
            lines.append(line)
    return "\n".join(x for x in lines if x.strip())


class _Default(dict):
    def __missing__(self, key):
        return "(없음)"


def validator(tool_id):
    """도구 검수기(tools/<id>/validator.py 의 validate(pkg, ctx)). 없으면 None."""
    m = manifest(tool_id) or {}
    if not m.get("validator"):
        return None
    try:
        mod = importlib.import_module(f"tools.{tool_id}.validator")
        return getattr(mod, "validate", None)
    except ImportError:
        return None


def validate_document(text, min_chars=80):
    """검수기가 없는 도구(문서 결과): 비어 있지 않은지·너무 짧지 않은지만 본다."""
    errors, warnings = [], []
    t = (text or "").strip()
    if not t:
        errors.append({"rule": "empty", "msg": "결과 파일이 비어 있음"})
    elif len(t) < min_chars:
        warnings.append({"rule": "short", "msg": f"결과가 짧음({len(t)}자, 공백 포함)"})
    if t and "확인 필요" not in t:
        warnings.append({"rule": "check_list", "msg": "「확인 필요」 목록이 없음(근거 모르는 사실 표시)"})
    return {"passed": not errors, "errors": errors, "warnings": warnings, "stats": {"chars": len(t)}}


# ---------- 화면용 요약 ----------
def status():
    out = []
    for tid, m in sorted(manifests().items(), key=lambda kv: kv[1].get("order", 50)):
        out.append({
            "id": tid, "name": m.get("name", tid), "icon": m.get("icon", ""), "category": m.get("category", ""),
            "summary": m.get("summary", ""), "highlights": m.get("highlights", []), "version": m.get("version", ""),
            "beta": bool(m.get("beta")), "core": bool(m.get("core")),
            "entitled": entitled(tid), "enabled": enabled(tid),
            "agents": connected_agents(tid), "team": (m.get("team") or {}).get("id"),
            "team_agents": [a["name"] for a in (m.get("team") or {}).get("agents", [])],
            "run": {k: v for k, v in (m.get("run") or {}).items() if k != "prompt"},
            "settings": settings(tid), "settings_keys": list((m.get("settings") or {}).keys()),
            "rules": rules(tid) if (TOOLS_DIR / tid / "rules.json").exists() else None,
            "publish": bool(m.get("publish")), "calendar": bool(m.get("calendar")),
            "external": m.get("external", []), "safety": m.get("safety", []),
        })
    return out
