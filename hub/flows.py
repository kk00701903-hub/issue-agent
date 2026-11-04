"""워크플로우(노드·선) 저장소. data/flows.json 에 그룹별로 저장한다.
처음에는 hub/agents.json 의 flow(직선 순서)를 노드 그래프로 바꿔 채운다."""
from hub import store

FLOWS = store.DATA / "flows.json"
KINDS = ("agent", "code", "browser", "human", "note")


def _seed(group):
    nodes, edges = [], []
    for i, s in enumerate(group.get("flow", [])):
        nid = f"n{i + 1}"
        nodes.append({"id": nid, "label": s["step"], "who": s["who"], "kind": s["kind"], "x": 40 + (i % 3) * 270, "y": 50 + (i // 3) * 140, "note": ""})
        if i:
            edges.append({"from": f"n{i}", "to": nid})
    return {"nodes": nodes, "edges": edges}


def load_all():
    data = store.read_json(FLOWS, {}) or {}
    changed = False
    for g in store.load_groups():
        if g["id"] not in data:
            data[g["id"]] = _seed(g)
            changed = True
    if changed:
        store.write_json(FLOWS, data)
    return data


def _clean(flow):
    """사용자 입력을 그대로 저장하지 않고 필요한 필드만 남긴다."""
    nodes, ids = [], set()
    for n in (flow.get("nodes") or [])[:200]:
        nid = str(n.get("id", ""))[:20]
        if not nid or nid in ids:
            continue
        ids.add(nid)
        kind = n.get("kind") if n.get("kind") in KINDS else "agent"
        nodes.append({
            "id": nid,
            "label": str(n.get("label", ""))[:60],
            "who": str(n.get("who", ""))[:60],
            "kind": kind,
            "x": max(0, min(int(float(n.get("x", 0) or 0)), 6000)),
            "y": max(0, min(int(float(n.get("y", 0) or 0)), 4000)),
            "note": str(n.get("note", ""))[:300],
        })
    edges, seen = [], set()
    for e in (flow.get("edges") or [])[:400]:
        a, b = str(e.get("from", "")), str(e.get("to", ""))
        if a in ids and b in ids and a != b and (a, b) not in seen:
            seen.add((a, b))
            edges.append({"from": a, "to": b})
    return {"nodes": nodes, "edges": edges}


def save(group_id, flow):
    data = load_all()
    if group_id not in data:
        return None
    data[group_id] = _clean(flow)
    store.write_json(FLOWS, data)
    store.log_work(f"워크플로우 저장 · {group_id} · 노드 {len(data[group_id]['nodes'])} 선 {len(data[group_id]['edges'])}")
    return data[group_id]


def ordered(flow):
    """선을 따라 순서대로 정렬(위상 정렬). 순환이면 x 좌표 순."""
    nodes = {n["id"]: n for n in flow.get("nodes", [])}
    indeg = {k: 0 for k in nodes}
    out = {k: [] for k in nodes}
    for e in flow.get("edges", []):
        if e["from"] in nodes and e["to"] in nodes:
            indeg[e["to"]] += 1
            out[e["from"]].append(e["to"])
    ready = sorted([k for k, d in indeg.items() if d == 0], key=lambda k: (nodes[k]["y"], nodes[k]["x"]))
    result = []
    while ready:
        k = ready.pop(0)
        result.append(nodes[k])
        for t in out[k]:
            indeg[t] -= 1
            if indeg[t] == 0:
                ready.append(t)
        ready.sort(key=lambda k: (nodes[k]["y"], nodes[k]["x"]))
    if len(result) != len(nodes):
        return sorted(nodes.values(), key=lambda n: (n["x"], n["y"]))
    return result


# ---------------------------------------------------------------------------
# AI 흐름 생성: 설명을 받아 노드·선을 만든다. API 키가 없으면 규칙 기반으로 만든다.
# ---------------------------------------------------------------------------
import json as _json
import os as _os
import re as _re
import urllib.request as _url

API_URL = "https://api.anthropic.com/v1/messages"


def _agents_for(group_id):
    groups = store.load_groups()
    g = next((x for x in groups if x["id"] == group_id), None)
    shared = next((x for x in groups if x["id"] == "shared"), {"agents": []})
    if not g:
        return None, []
    agents = list(g.get("agents", [])) + ([a for a in shared["agents"]] if group_id != "shared" else [])
    return g, agents


def _kind_of(agent):
    if agent["name"] == "browser-operator" or "browser-operator" in agent.get("tools", ""):
        return "browser"
    if "Python" in agent.get("tools", ""):
        return "code"
    return "agent"


def _system_prompt(g, agents):
    lines = [f"- {a['name']} | {a['title']} | {a['role']} | 상태:{a['state']} | 종류:{_kind_of(a)}" for a in agents]
    return (
        "너는 업무 자동화 워크플로우 설계자다. 사용자의 설명을 읽고 노드와 선으로 된 흐름을 JSON 하나로만 답한다.\n"
        f"그룹: {g['title']} — {g.get('purpose', '')}\n"
        "쓸 수 있는 에이전트(이름 | 제목 | 역할 | 상태 | 종류):\n" + "\n".join(lines) + "\n"
        "규칙:\n"
        "1. 가능한 한 위 에이전트를 who 에 그 이름 그대로 쓴다. 맞는 것이 없으면 who 에 짧은 새 이름을 쓰고 note 에 '새 에이전트 필요'라고 적는다.\n"
        "2. kind 는 agent, code, browser, human, note 중 하나. 사람이 하는 일은 human(who='사람').\n"
        "3. 게시·예약·제출·등록·결제·커밋처럼 되돌리기 어려운 마지막 행동은 반드시 human 노드로 둔다.\n"
        "4. browser 노드 뒤에는 반드시 human 노드가 이어져야 한다.\n"
        "5. 만든 것을 검사하는 단계(검수)를 만드는 단계와 다른 노드로 둔다.\n"
        "6. 노드는 3~10개. label 은 12자 이내 한국어. id 는 n1, n2 … 순서.\n"
        '출력 형식(설명 없이 JSON만): {"nodes":[{"id":"n1","label":"","who":"","kind":"agent","note":""}],"edges":[{"from":"n1","to":"n2"}]}'
    )


def _parse_json(text):
    m = _re.search(r"\{.*\}", text or "", _re.S)
    if not m:
        raise ValueError("JSON 없음")
    return _json.loads(m.group(0))


def _call_claude(system, prompt, model):
    key = _os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY 없음")
    body = _json.dumps({"model": model, "max_tokens": 2000, "system": system,
                        "messages": [{"role": "user", "content": prompt}]}).encode("utf-8")
    req = _url.Request(API_URL, data=body, method="POST", headers={
        "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01"})
    with _url.urlopen(req, timeout=60) as r:
        data = _json.loads(r.read().decode("utf-8"))
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    return text, data.get("usage", {})


def _local_generate(prompt, agents):
    """키가 없을 때: 문장을 단계로 나누고 에이전트 제목·역할의 낱말로 짝을 찾는다."""
    parts = [p.strip() for p in _re.split(r"→|->|\n|,|그다음|다음에|그리고|하고 나서|한 뒤|후에", prompt) if p.strip()]
    nodes = []
    for i, p in enumerate(parts[:10]):
        best, score = None, 0
        words = set(_re.findall(r"[가-힣A-Za-z]{2,}", p))
        for a in agents:
            hay = a["title"] + " " + a["role"] + " " + a["name"]
            s = sum(1 for w in words if w in hay)
            if s > score:
                best, score = a, s
        if any(w in p for w in ("승인", "확인", "게시", "예약", "제출", "등록", "커밋", "결제")) and (not best or score < 2):
            nodes.append({"id": f"n{i + 1}", "label": p[:12], "who": "사람", "kind": "human", "note": ""})
        elif best and any(n["who"] == best["name"] for n in nodes):
            # 같은 에이전트가 두 번 잡히면 설명 문구를 단계 이름으로 쓴다
            nodes.append({"id": f"n{i + 1}", "label": p[:12], "who": "새 에이전트", "kind": "agent", "note": "새 에이전트 필요 — " + p[:60]})
        elif best:
            nodes.append({"id": f"n{i + 1}", "label": best["title"][:12], "who": best["name"], "kind": _kind_of(best), "note": p[:80]})
        else:
            nodes.append({"id": f"n{i + 1}", "label": p[:12], "who": "새 에이전트", "kind": "agent", "note": "새 에이전트 필요"})
    edges = [{"from": nodes[i]["id"], "to": nodes[i + 1]["id"]} for i in range(len(nodes) - 1)]
    return {"nodes": nodes, "edges": edges}


def _enforce(flow):
    """안전 규칙을 코드로 한 번 더 맞춘다: 끝은 사람, 크롬 통제 뒤에는 사람."""
    nodes, edges = flow["nodes"], flow["edges"]
    ids = [n["id"] for n in nodes]
    nid = lambda: "n" + str(max([int(i[1:]) for i in ids if i[1:].isdigit()] + [0]) + 1)
    for n in list(nodes):
        if n["kind"] == "browser" and not any(e["from"] == n["id"] for e in edges):
            h = {"id": nid(), "label": "사람 확인", "who": "사람", "kind": "human", "note": "최종 버튼은 사람이 누른다", "x": 0, "y": 0}
            nodes.append(h); ids.append(h["id"]); edges.append({"from": n["id"], "to": h["id"]})
    if nodes and not any(n["kind"] == "human" for n in nodes):
        ends = [n for n in nodes if not any(e["from"] == n["id"] for e in edges) and n["kind"] != "note"] or [nodes[-1]]
        h = {"id": nid(), "label": "사람 확인", "who": "사람", "kind": "human", "note": "최종 확인은 사람이 한다", "x": 0, "y": 0}
        nodes.append(h)
        for t in ends:
            edges.append({"from": t["id"], "to": h["id"]})
    return flow


def _layout(flow):
    for i, n in enumerate(ordered(flow)):
        n["x"], n["y"] = 40 + (i % 3) * 270, 50 + (i // 3) * 140
    return flow


def generate(group_id, prompt, call=None):
    """반환: (flow, info). call 은 시험용으로 바꿀 수 있는 API 호출 함수."""
    g, agents = _agents_for(group_id)
    if g is None:
        return None, {"error": "없는 그룹"}
    prompt = (prompt or "").strip()[:2000]
    if not prompt:
        return None, {"error": "만들고 싶은 흐름을 적어 주세요"}
    from hub import models
    provider, _p, model = models.route("flow")
    info = {"source": "ai", "model": model, "provider": provider}
    try:
        if call:  # 시험용 가짜 호출
            text, usage = call(_system_prompt(g, agents), prompt, model)
        else:     # 설정(model_routes.flow)에 따라 Claude 또는 다른 제공자
            text, usage, _meta = models.complete("flow", _system_prompt(g, agents), prompt)
        raw = _parse_json(text)
        info["usage"] = usage
    except Exception as e:  # noqa: BLE001 — 키 없음·네트워크·형식 오류는 규칙 기반으로
        raw = _local_generate(prompt, agents)
        info = {"source": "local", "reason": str(e)[:120]}
    for n in raw.get("nodes", []):
        n.setdefault("x", 0); n.setdefault("y", 0); n.setdefault("note", "")
    flow = _layout(_enforce(_clean(raw)))
    store.log_work(f"흐름 AI 생성 · {group_id} · {info['source']} · 노드 {len(flow['nodes'])} · 요청: {prompt[:40]}")
    return flow, info
