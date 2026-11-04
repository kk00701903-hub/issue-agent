"""에이전트 인사(HR): 근무 시프트·사규·징계(최고 해고)·징계위원회.

에이전트는 사람이 아니므로 칭찬·벌이 「의욕」을 바꾸지는 않는다. 그래서 징계는 모두 실제로 효력이 있는 조치로 만든다.
  주의·견책  → 기록이 남고, 다음 실행부터 그 위반 내용을 지시문 맨 앞에 「다시 하지 말 것」으로 넣는다.
  감봉       → 그 에이전트의 하루 예산 한도를 절반으로 줄인다(기간 동안).
  정직       → 기간 동안 실행·서브에이전트 호출을 막는다(러너와 훅 둘 다).
  해고       → 모든 도구에서 연결을 끊고 실행·호출을 막는다. 복직은 사람이 결정한다.
근무 시프트 밖에서는 실행하지 않는다(러너가 거절, 훅이 서브에이전트 호출을 막음). 시프트가 없으면 24시간 근무.

data/hr.json 은 에이전트가 고칠 수 없다(훅이 막음). 결정은 늘 사람이 관리 화면에서 한다.
"""
import json
from datetime import date, datetime, timedelta
from pathlib import Path

from hub import store, toolkit

HR_FILE = store.DATA / "hr.json"
RULEBOOK_FILE = Path(__file__).resolve().parent / "hr_rulebook.json"

LEVELS = [
    {"id": "none", "label": "불문", "rank": 0, "effect": "기록만 남기고 조치하지 않음"},
    {"id": "caution", "label": "주의", "rank": 1, "effect": "기록 + 다음 실행 지시문에 위반 내용 넣기"},
    {"id": "reprimand", "label": "견책", "rank": 2, "effect": "주의와 같고, 위반 내용을 「반드시」로 강하게 넣음"},
    {"id": "paycut", "label": "감봉", "rank": 3, "effect": "기간 동안 하루 예산 한도 절반"},
    {"id": "suspend", "label": "정직", "rank": 4, "effect": "기간 동안 실행·호출 금지"},
    {"id": "dismiss", "label": "해고", "rank": 5, "effect": "모든 도구에서 연결 해제 + 실행·호출 금지(복직은 사람이 결정)"},
]
LEVEL = {x["id"]: x for x in LEVELS}
SHIFTS = {
    "always": {"label": "24시간", "days": [0, 1, 2, 3, 4, 5, 6], "start": "00:00", "end": "24:00"},
    "day": {"label": "주간(평일 09–18)", "days": [0, 1, 2, 3, 4], "start": "09:00", "end": "18:00"},
    "day7": {"label": "주간(매일 09–18)", "days": [0, 1, 2, 3, 4, 5, 6], "start": "09:00", "end": "18:00"},
    "evening": {"label": "저녁(매일 14–23)", "days": [0, 1, 2, 3, 4, 5, 6], "start": "14:00", "end": "23:00"},
    "night": {"label": "야간(매일 22–07)", "days": [0, 1, 2, 3, 4, 5, 6], "start": "22:00", "end": "07:00"},
}
DAY_KO = "월화수목금토일"


def load():
    try:
        d = json.loads(HR_FILE.read_text(encoding="utf-8"))
        return d if isinstance(d, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save(d):
    store.write_json(HR_FILE, d)


def rulebook():
    try:
        return json.loads(RULEBOOK_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {"title": "에이전트 사규", "articles": []}


def person(agent, d=None):
    d = d if d is not None else load()
    p = (d.get("agents") or {}).get(agent) or {}
    return {"shift": p.get("shift") or {"preset": "always"}, "status": p.get("status", "active"), "until": p.get("until", ""),
            "budget_factor": p.get("budget_factor", 1.0), "records": p.get("records", []), "tools_before": p.get("tools_before", [])}


def _put(agent, p):
    d = load()
    d.setdefault("agents", {})[agent] = p
    _save(d)


def _mins(hhmm):
    h, m = (hhmm or "0:0").split(":")
    return int(h) * 60 + int(m)


def shift_of(p):
    s = p.get("shift") or {"preset": "always"}
    base = SHIFTS.get(s.get("preset")) or {}
    days = s.get("days", base.get("days", list(range(7))))
    return {"preset": s.get("preset", "custom"), "days": days, "start": s.get("start", base.get("start", "00:00")), "end": s.get("end", base.get("end", "24:00"))}


def shift_text(p):
    s = shift_of(p)
    if s["preset"] in SHIFTS:
        return SHIFTS[s["preset"]]["label"]
    days = "".join(DAY_KO[i] for i in sorted(s["days"])) or "없음"
    return f"{days} {s['start']}–{s['end']}"


def on_shift(p, now=None):
    now = now or datetime.now()
    s = shift_of(p)
    a, b, t, wd = _mins(s["start"]), _mins(s["end"]), now.hour * 60 + now.minute, now.weekday()
    if a == b or (a == 0 and b >= 24 * 60):
        return wd in s["days"]
    if a < b:
        return wd in s["days"] and a <= t < b
    # 밤을 넘기는 시프트(22–07): 시작한 날 기준
    return (wd in s["days"] and t >= a) or (((wd - 1) % 7) in s["days"] and t < b)


def _expire(agent, p):
    """기간이 끝난 정직·감봉은 저절로 풀린다."""
    if p["status"] in ("suspended",) and p["until"] and p["until"] < date.today().isoformat():
        p["status"], p["until"] = "active", ""
        _put(agent, p)
    if p.get("budget_factor", 1.0) < 1.0 and p.get("paycut_until") and p["paycut_until"] < date.today().isoformat():
        p["budget_factor"] = 1.0
        _put(agent, p)
    return p


def can_work(agent, now=None):
    """(ok, 이유). 러너가 실행 전에, 훅이 서브에이전트 호출 전에 같은 기준으로 본다."""
    p = _expire(agent, person(agent))
    if p["status"] == "dismissed":
        return False, f"{agent} 은(는) 해고되어 일할 수 없음(인사 → 징계위원회에서 복직 가능)"
    if p["status"] == "suspended":
        return False, f"{agent} 은(는) 정직 중({p['until']}까지)"
    if not on_shift(p, now):
        return False, f"{agent} 근무 시간이 아님(시프트: {shift_text(p)})"
    return True, ""


def budget_factor(agent):
    return float(_expire(agent, person(agent)).get("budget_factor", 1.0) or 1.0)


def prompt_notes(agent):
    """주의·견책 이상 기록을 실행 지시문 앞에 넣을 문장으로."""
    recs = [r for r in person(agent)["records"] if LEVEL.get(r.get("level"), {}).get("rank", 0) >= 1][-5:]
    if not recs:
        return ""
    lines = ["[사규 위반 기록 — 같은 실수를 다시 하지 말 것]"]
    for r in recs:
        must = "반드시 " if LEVEL[r["level"]]["rank"] >= 2 else ""
        lines.append(f"- {r.get('date', '')} {LEVEL[r['level']]['label']}: {r.get('reason', '')} → {must}{r.get('fix') or '사규 ' + ', '.join(r.get('articles', [])) + ' 를 지킬 것'}")
    return "\n".join(lines)


def evidence(agent, days=14):
    """징계위원회 안건: 기록에서 찾은 위반 근거(사규 조항과 함께). 지어내지 않고 기록만."""
    since = (date.today() - timedelta(days=days)).isoformat()
    out = []
    for e in store.tail_events(3000):
        if (e.get("ts") or "") < since or (e.get("agent") or "") != agent:
            continue
        if e.get("kind") == "blocked":
            out.append({"ts": e.get("ts", ""), "article": "제4조", "what": "금지 행동 시도(훅 차단)", "detail": e.get("reason", "") or e.get("detail", "")})
    for r in store.list_runs(300):
        if r.get("agent") != agent or (r.get("created") or "") < since:
            continue
        st = r.get("status")
        hist = r.get("history") or [{}]
        msg = str(hist[-1].get("note") or "")
        topic = str((r.get("params") or {}).get("topic") or "")
        dec = r.get("decision") or {}
        note = str(dec.get("note") or "") if isinstance(dec, dict) else ""
        if st == "validation_failed":
            out.append({"ts": r.get("created", ""), "article": "제5조", "what": "규칙 검수 실패", "detail": topic + (" · " + msg if msg else ""), "run": r.get("id")})
        elif st == "rejected":
            out.append({"ts": r.get("created", ""), "article": "제5조", "what": "사람이 반려", "detail": topic + (" · " + note if note else ""), "run": r.get("id")})
        elif st == "error" and "한도" in msg:
            out.append({"ts": r.get("created", ""), "article": "제6조", "what": "예산 한도 초과", "detail": msg, "run": r.get("id")})
        elif st == "error":
            out.append({"ts": r.get("created", ""), "article": "제5조", "what": "실행 오류", "detail": msg[:160], "run": r.get("id")})
    out.sort(key=lambda x: x["ts"], reverse=True)
    return out


def summary():
    """관리 화면용: 에이전트별 인사 상태."""
    d = load()
    res = {}
    for name in toolkit.all_agent_names():
        p = _expire(name, person(name, d))
        ok, why = can_work(name)
        res[name] = {"shift": shift_of(p), "shift_text": shift_text(p), "status": p["status"], "until": p["until"],
                     "budget_factor": p.get("budget_factor", 1.0), "on_shift": on_shift(p), "can_work": ok, "why": why,
                     "records": p["records"][-10:]}
    return {"agents": res, "levels": LEVELS, "rulebook": rulebook(), "shifts": {k: v["label"] for k, v in SHIFTS.items()}, "committees": d.get("committees", [])[-30:]}


def set_shift(agent, shift):
    if agent not in toolkit.all_agent_names():
        return None
    preset = str(shift.get("preset") or "custom")
    if preset in SHIFTS:
        s = {"preset": preset}
    else:
        days = sorted({int(x) for x in shift.get("days", []) if str(x).isdigit() and 0 <= int(x) <= 6})
        st, en = str(shift.get("start", "09:00"))[:5], str(shift.get("end", "18:00"))[:5]
        for t in (st, en):
            if len(t) != 5 or t[2] != ":" or not (t[:2] + t[3:]).isdigit() or not (0 <= _mins(t) <= 24 * 60):
                return None
        s = {"preset": "custom", "days": days, "start": st, "end": en}
    p = person(agent)
    p["shift"] = s
    _put(agent, p)
    store.log_work(f"인사: {agent} 근무 시프트 → {shift_text(p)}")
    return shift_text(p)


def decide(agent, level, reason, articles=None, days=0, fix="", evidence_ids=None):
    """징계위원회 의결. 사람이 관리 화면에서만 부른다."""
    if agent not in toolkit.all_agent_names() or level not in LEVEL:
        return None
    reason = str(reason or "").strip()[:300]
    if level != "none" and not reason:
        return None
    days = max(0, min(int(days or 0), 90))
    p = person(agent)
    today = date.today()
    rec = {"date": today.isoformat(), "level": level, "reason": reason, "articles": list(articles or [])[:6], "fix": str(fix or "")[:200],
           "days": days, "evidence": list(evidence_ids or [])[:20]}
    if level == "paycut":
        p["budget_factor"] = 0.5
        p["paycut_until"] = (today + timedelta(days=max(days, 1) - 1)).isoformat()
    elif level == "suspend":
        p["status"], p["until"] = "suspended", (today + timedelta(days=max(days, 1) - 1)).isoformat()
    elif level == "dismiss":
        before = [t for t in toolkit.manifests() if agent in toolkit.connected_agents(t)]
        for t in before:
            toolkit.connect(t, agent, False)
        p["status"], p["until"], p["tools_before"] = "dismissed", "", before
    p["records"] = (p.get("records") or []) + [rec]
    _put(agent, p)
    dd = load()
    dd.setdefault("committees", []).append({"ts": datetime.now().astimezone().isoformat(timespec="seconds"), "agent": agent, **rec})
    _save(dd)
    store.log_work(f"인사: 징계위원회 — {agent} {LEVEL[level]['label']}" + (f" {days}일" if days and level in ("paycut", "suspend") else "") + f" · 사유: {reason}")
    return rec


def reinstate(agent):
    """복직: 정직·해고를 풀고, 해고 때 끊은 도구 연결을 되돌린다."""
    if agent not in toolkit.all_agent_names():
        return None
    p = person(agent)
    for t in p.get("tools_before") or []:
        toolkit.connect(t, agent, True)
    p.update(status="active", until="", tools_before=[], budget_factor=1.0)
    p["records"] = (p.get("records") or []) + [{"date": date.today().isoformat(), "level": "none", "reason": "복직", "articles": []}]
    _put(agent, p)
    store.log_work(f"인사: {agent} 복직")
    return True


# ---------- 성과 평가 ----------
# 평가표에 쓰는 것과 같은 기록이 다음 실행 지시문에도 그대로 들어간다(①반려 이유 ②기준 예시 ③자주 걸리는 검수 실수).
def _runs(limit=500):
    return store.list_runs(limit)


def _note(r):
    d = r.get("decision") or {}
    return str(d.get("note") or "").strip() if isinstance(d, dict) else ""


def _failed_once(r):
    return any(h.get("status") == "validation_failed" for h in (r.get("history") or []))


def top_rules(tool, runs=None, n=3):
    """그 도구에서 자주 걸린 검수 규칙(최근 실행 기준)."""
    cnt, sample = {}, {}
    for r in runs if runs is not None else _runs(200):
        if (r.get("tool") or "instagram") != tool:
            continue
        for e in (r.get("validation") or {}).get("errors", []) or []:
            k = e.get("rule") or "?"
            cnt[k] = cnt.get(k, 0) + 1
            sample.setdefault(k, e.get("msg", ""))
    return [{"rule": k, "count": c, "msg": sample[k]} for k, c in sorted(cnt.items(), key=lambda x: -x[1])[:n]]


def examples(tool=None):
    ex = load().get("examples") or {}
    return ex.get(tool, []) if tool else ex


def toggle_example(run_id, on):
    r = store.get_run(run_id)
    if not r or r.get("status") != "approved":
        return None
    tool = r.get("tool") or "instagram"
    d = load()
    lst = [x for x in (d.setdefault("examples", {}).get(tool) or []) if x != run_id]
    if on:
        lst = (lst + [run_id])[-3:]   # 도구마다 최근 3개까지
    d["examples"][tool] = lst
    _save(d)
    store.log_work(f"인사: 기준 예시 {'지정' if on else '해제'} {run_id} ({tool})")
    return lst


def work_notes(agent, tool):
    """다음 실행 지시문에 넣을 성과 기록: 최근 반려 이유, 자주 걸리는 검수 실수, 기준 예시."""
    runs = _runs(200)
    lines = []
    rej = [(_note(r), (r.get("params") or {}).get("topic", "")) for r in runs if r.get("agent") == agent and r.get("status") == "rejected" and _note(r)][:3]
    if rej:
        lines.append("[최근 반려 이유 — 같은 이유로 반려되지 않게]")
        lines += [f"- 「{t}」: {n}" for n, t in rej]
    tr = top_rules(tool, runs)
    if tr:
        lines.append("[이 도구에서 자주 걸리는 검수 실수 — 만들기 전에 먼저 확인]")
        lines += [f"- {x['rule']} ({x['count']}회): {x['msg']}" for x in tr]
    ex = [x for x in examples(tool) if (store.ROOT / "data" / "runs" / x).exists()]
    if ex:
        lines.append("[사람이 승인한 기준 예시 — 형식과 수준만 참고하고 내용은 베끼지 말 것]")
        for x in ex:
            f = next((p for p in (store.ROOT / "data" / "runs" / x).iterdir() if p.name in ("package.json", "result.md")), None)
            if f:
                lines.append(f"- {f.relative_to(store.ROOT).as_posix()}")
    return "\n".join(lines)


def performance():
    """에이전트별 성과표. 실행 기록만으로 계산한다(지어내지 않음)."""
    runs = _runs(500)
    per = {}
    for r in runs:
        a = r.get("agent") or ""
        per.setdefault(a, []).append(r)
    costs = sorted(c for c in ((x.get("cost_usd") or 0) for x in runs) if c > 0)
    med = costs[len(costs) // 2] if costs else 0
    d = load()
    out = {}
    for a, rs in per.items():
        fin = [r for r in rs if r.get("status") in ("approved", "rejected", "error", "validation_failed")]
        appr = sum(1 for r in rs if r.get("status") == "approved")
        rej = sum(1 for r in rs if r.get("status") == "rejected")
        judged = appr + rej
        first = [r for r in rs if r.get("status") in ("approved", "rejected", "awaiting_approval")]
        fp = sum(1 for r in first if not _failed_once(r))
        cs = [r.get("cost_usd") or 0 for r in rs if r.get("cost_usd")]
        avg = sum(cs) / len(cs) if cs else 0
        tools = sorted({r.get("tool") or "instagram" for r in rs})
        recs = [x for x in ((d.get("agents") or {}).get(a, {}).get("records") or []) if LEVEL.get(x.get("level"), {}).get("rank", 0) >= 2]
        ar = appr / judged if judged else None
        fr = fp / len(first) if first else None
        cf = min(1.0, med / avg) if avg and med else 1.0
        score = None
        if ar is not None or fr is not None:
            score = round(50 * (ar if ar is not None else fr) + 30 * (fr if fr is not None else ar) + 20 * cf - 5 * len(recs))
            score = max(0, min(100, score))
        grade = "평가 대기" if score is None else "A" if score >= 85 else "B" if score >= 70 else "C" if score >= 50 else "D"
        rules = {}
        for r in rs:
            for e in (r.get("validation") or {}).get("errors", []) or []:
                rules[e.get("rule") or "?"] = rules.get(e.get("rule") or "?", 0) + 1
        out[a] = {"runs": len(rs), "finished": len(fin), "approved": appr, "rejected": rej, "approval_rate": ar, "first_pass": fr,
                  "cost_total": round(sum(cs), 4), "cost_avg": round(avg, 4), "tools": tools, "discipline": len(recs),
                  "score": score, "grade": grade, "reject_reasons": [_note(r) for r in rs if r.get("status") == "rejected" and _note(r)][:3],
                  "top_rules": sorted(rules.items(), key=lambda x: -x[1])[:3],
                  "approved_runs": [{"id": r["id"], "topic": (r.get("params") or {}).get("topic", ""), "tool": r.get("tool") or "instagram"} for r in rs if r.get("status") == "approved"][:5]}
    return {"agents": out, "examples": examples(), "median_cost": med}
