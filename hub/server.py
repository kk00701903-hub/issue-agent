"""관리 화면 서버(외부 패키지 없음). 내 PC 안(127.0.0.1)에서만 접근된다.

실행: python -m hub.server        → http://127.0.0.1:4830
"""
import json
import re
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import os
import secrets

from hub import cloud_link, flows, hr, license, models, plans, runner, secrets_env, store, toolkit
from hub.version import VERSION

SESSIONS = set()  # 로그인 세션 토큰(메모리). 서버를 끄면 다시 로그인한다.


def password():
    runner.load_dotenv()
    return os.environ.get("HUB_PASSWORD", "")

FLOW_RE = re.compile(r"^/api/flows/([a-z]+)$")
GEN_RE = re.compile(r"^/api/flows/([a-z]+)/generate$")
STATIC_RE = re.compile(r"^/static/([A-Za-z0-9_.-]+)$")
ICON_RE = re.compile(r"^/icons/([A-Za-z0-9_.-]+\.png)$")

STATIC = Path(__file__).resolve().parent / "static"
LOCAL_HOSTS = ("127.0.0.1", "localhost")


def lan_enabled():
    """휴대폰으로 보기(같은 와이파이): .env 에 HUB_LAN=1 이고 HUB_PASSWORD 가 있을 때만 켠다. 비밀번호 없이 집 밖 기기가 들어오는 일은 없다."""
    runner.load_dotenv()
    return os.environ.get("HUB_LAN", "") in ("1", "true", "on") and bool(password())


def lan_ips():
    import socket
    ips = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))   # 실제로 보내지 않는다. 이 PC의 공유기 쪽 주소만 알아낸다
        ips.add(s.getsockname()[0]); s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    return sorted(ip for ip in ips if _private(ip))


def _private(host):
    parts = host.split(".")
    if len(parts) != 4 or not all(p.isdigit() for p in parts):
        return False
    a, b = int(parts[0]), int(parts[1])
    return a == 10 or (a == 172 and 16 <= b <= 31) or (a == 192 and b == 168)


def lan_status():
    port = int(store.config().get("port", 4830))
    on = lan_enabled()
    return {"enabled": on, "requested": os.environ.get("HUB_LAN", "") in ("1", "true", "on"), "password_set": bool(password()),
            "urls": [f"http://{ip}:{port}/" for ip in lan_ips()] if on else []}
RUN_RE = re.compile(r"^/api/runs/([0-9A-Za-z-]+)$")
DECISION_RE = re.compile(r"^/api/runs/([0-9A-Za-z-]+)/decision$")
PLAN_RE = re.compile(r"^/api/plans/(\d{4}-\d{2})/([A-Za-z0-9._-]+)$")
TOOL_RE = re.compile(r"^/api/tools/([a-z][a-z0-9_-]{1,30})$")
TOOL_AGENT_RE = re.compile(r"^/api/tools/([a-z][a-z0-9_-]{1,30})/agents$")
TOOL_RULES_RE = re.compile(r"^/api/tools/([a-z][a-z0-9_-]{1,30})/rules$")
HR_RE = re.compile(r"^/api/hr/([A-Za-z0-9_.-]{1,60})/(shift|decide|reinstate|evidence)$")


def summarize(run):
    p = run.get("params", {})
    v = run.get("validation") or {}
    return {
        "id": run["id"],
        "agent": run["agent"],
        "tool": run.get("tool") or "instagram",
        "status": run["status"],
        "created": run["created"],
        "account": p.get("account"),
        "topic": p.get("topic"),
        "cost_usd": run.get("cost_usd"),
        "errors": len(v.get("errors", [])),
        "warnings": len(v.get("warnings", [])),
        "note": str(((run.get("history") or [{}])[-1] or {}).get("note") or "")[:160],
    }


def manifest():
    """PWA 매니페스트. 이름·색은 고객사 브랜딩을 따른다."""
    b = store.config().get("branding", {}) or {}
    name = b.get("product_name", "Agent Hub")
    full = f"{name} · {b['customer_name']}" if b.get("customer_name") else name
    accent = b.get("accent", "#073190")
    return {
        "name": full, "short_name": name, "id": "/", "start_url": "/", "scope": "/",
        "display": "standalone", "display_override": ["window-controls-overlay", "standalone"],
        "background_color": "#f6f5f2", "theme_color": accent, "lang": "ko",
        "description": "PC에서 도는 Claude 에이전트 관리 화면",
        "icons": [
            {"src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
            {"src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
        "shortcuts": [
            {"name": "승인함", "url": "/#inbox", "icons": [{"src": "/icons/icon-192.png", "sizes": "192x192"}]},
            {"name": "흐름", "url": "/#flow", "icons": [{"src": "/icons/icon-192.png", "sizes": "192x192"}]},
            {"name": "로그", "url": "/#log", "icons": [{"src": "/icons/icon-192.png", "sizes": "192x192"}]},
        ],
    }


def build_state():
    runner.load_dotenv()  # 모델 키 유무 표시용
    runs = store.list_runs(100)
    summaries = [summarize(r) for r in runs]
    groups = []
    for g in store.load_groups():
        agents = []
        for a in g.get("agents", []):
            counts = {}
            for s in summaries:
                if s["agent"] == a["name"]:
                    counts[s["status"]] = counts.get(s["status"], 0) + 1
            agents.append({**a, "counts": counts})
        groups.append({**g, "agents": agents})
    all_flows = flows.load_all()
    for g in groups:
        g["flow_graph"] = all_flows.get(g["id"], {"nodes": [], "edges": []})
        g["flow_order"] = [{"step": n["label"], "who": n["who"], "kind": n["kind"]} for n in flows.ordered(g["flow_graph"])]
    cfg = store.config()
    return {
        "groups": groups,
        "runs": summaries,
        "events": store.tail_events(80),
        "live": store.live_agents(),
        "hr": hr.summary(),
        "lan": lan_status(),
        "keys": secrets_env.status(),
        "perf": hr.performance(),
        "usage": store.usage_summary(),
        "branding": cfg.get("branding", {}),
        "license": license.status(),
        "tools": toolkit.status(),
        "accounts": toolkit.accounts("instagram") if toolkit.enabled("instagram") else [],
        "cloud": cloud_link.status(),
        "models": models.status(),
        "version": VERSION,
    }


def decide(rid, decision, note):
    run = store.get_run(rid)
    if not run:
        return 404, {"error": "실행 기록 없음"}
    status = run["status"]
    if decision == "approve":
        if status != "awaiting_approval":
            return 409, {"error": f"승인할 수 없는 상태: {status} (검수를 통과한 건만 승인 가능)"}
        pkg = store.get_package(rid) or {}
        if (run.get("tool") or "instagram") == "instagram":
            series = str(pkg.get("series", ""))
            wp = toolkit.rules("instagram").get("world_series_prefix") or ""
            is_world = bool(wp) and series.startswith(wp)
            bid = str((pkg.get("bgm") or {}).get("id", "")).upper()
            if bid:
                store.bgm_record(pkg.get("account"), is_world, bid)
        run["decision"] = {"value": "approved", "note": note, "ts": store.now()}
        store.set_status(run, "approved", note)
        p = run.get("params", {})
        store.log_work(f"승인 {rid} · {run.get('tool') or 'instagram'} · {p.get('account') or p.get('work') or ''} · {p.get('topic')} (게시·제출은 사람이 직접)")
    elif decision == "reject":
        if status not in ("awaiting_approval", "validation_failed"):
            return 409, {"error": f"반려할 수 없는 상태: {status}"}
        run["decision"] = {"value": "rejected", "note": note, "ts": store.now()}
        store.set_status(run, "rejected", note)
        store.log_work(f"반려 {rid} · 사유: {note or '(없음)'}")
    else:
        return 400, {"error": "decision 은 approve 또는 reject"}
    return 200, {"ok": True, "status": run["status"]}


class Handler(BaseHTTPRequestHandler):
    server_version = "AgentHub/0.1"

    def log_message(self, fmt, *args):  # 콘솔 소음 줄이기
        pass

    # --- 공통 ---
    def _host_ok(self):
        host = self.headers.get("Host", "").split(":")[0]
        if host in LOCAL_HOSTS:
            return True
        # 휴대폰으로 보기: 같은 공유기 안 주소(192.168.x.x 등)로 들어온 것만, 그리고 그 기기의 주소도 집 안 주소일 때만
        return lan_enabled() and _private(host) and _private(self.client_address[0])

    def _send(self, code, body, ctype="application/json; charset=utf-8", extra=None):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode("utf-8")
        extra = dict(extra or {})
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", extra.pop("Cache-Control", "no-store"))
        for k, v in extra.items():
            self.send_header(k, v)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def _logged_in(self):
        if not password():
            return self.client_address[0] in ("127.0.0.1", "::1")   # 비밀번호가 없으면 이 PC에서만
        cookie = self.headers.get("Cookie", "")
        for part in cookie.split(";"):
            k, _, v = part.strip().partition("=")
            if k == "hub_session" and v in SESSIONS:
                return True
        return False

    def _body(self):
        try:
            n = min(int(self.headers.get("Content-Length", "0")), 2_000_000)
            return json.loads(self.rfile.read(n) or b"{}") if n else {}
        except (ValueError, json.JSONDecodeError):
            return {}

    # --- GET ---
    def do_GET(self):
        if not self._host_ok():
            return self._send(403, {"error": "로컬 접근만 허용"})
        path = self.path.split("?")[0]
        if path in ("/", "/index.html"):
            return self._send(200, (STATIC / "index.html").read_bytes(), "text/html; charset=utf-8")
        if path == "/manifest.webmanifest":
            return self._send(200, json.dumps(manifest(), ensure_ascii=False).encode("utf-8"), "application/manifest+json; charset=utf-8")
        if path == "/sw.js":  # 서비스 워커는 범위(/)를 위해 최상위 주소로 내보낸다
            return self._send(200, (STATIC / "sw.js").read_bytes(), "text/javascript; charset=utf-8", {"Service-Worker-Allowed": "/"})
        m = ICON_RE.match(path)
        if m and (STATIC / "icons" / m.group(1)).is_file():
            return self._send(200, (STATIC / "icons" / m.group(1)).read_bytes(), "image/png", {"Cache-Control": "public, max-age=86400"})
        if path == "/favicon.ico":
            return self._send(200, (STATIC / "icons" / "favicon-32.png").read_bytes(), "image/png")
        m = STATIC_RE.match(path)
        if m and (STATIC / m.group(1)).is_file():
            ext = m.group(1).rsplit(".", 1)[-1]
            ctype = {"js": "text/javascript; charset=utf-8", "html": "text/html; charset=utf-8", "css": "text/css; charset=utf-8",
                     "png": "image/png", "glb": "model/gltf-binary", "webp": "image/webp", "jpg": "image/jpeg", "txt": "text/plain; charset=utf-8"}.get(ext, "text/plain; charset=utf-8")
            return self._send(200, (STATIC / m.group(1)).read_bytes(), ctype)
        if path == "/api/session":
            cfg = store.config()
            return self._send(200, {"need_login": bool(password()), "logged_in": self._logged_in(), "branding": cfg.get("branding", {}), "version": VERSION})
        if not self._logged_in():
            return self._send(401, {"error": "로그인 필요"})
        if path == "/api/state":
            return self._send(200, build_state())
        if path == "/api/flows":
            return self._send(200, flows.load_all())
        if path == "/api/worklog":
            return self._send(200, {"text": store.read_worklog()})
        m = PLAN_RE.match(path)
        if m:
            plan = plans.load(m.group(1), m.group(2))
            return self._send(200, plan) if plan is not None else self._send(400, {"error": "월(YYYY-MM)·계정을 확인하세요"})
        m = RUN_RE.match(path)
        if m:
            run = store.get_run(m.group(1))
            if not run:
                return self._send(404, {"error": "실행 기록 없음"})
            return self._send(200, {"run": run, "package": store.get_package(m.group(1))})
        self._send(404, {"error": "없는 주소"})

    # --- POST ---
    def do_POST(self):
        if not self._host_ok():
            return self._send(403, {"error": "로컬 접근만 허용"})
        if self.headers.get("X-Hub") != "1":  # 다른 사이트에서 몰래 누르는 요청 방지
            return self._send(403, {"error": "X-Hub 헤더 필요"})
        path = self.path.split("?")[0]
        body = self._body()
        if path == "/api/login":
            pw = password()
            if pw and secrets.compare_digest(str(body.get("password", "")), pw):
                tok = secrets.token_urlsafe(24); SESSIONS.add(tok)
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Set-Cookie", f"hub_session={tok}; Path=/; HttpOnly; SameSite=Strict")
                data = b'{"ok": true}'
                self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
                return
            return self._send(401, {"error": "비밀번호가 틀렸습니다"})
        if not self._logged_in():
            return self._send(401, {"error": "로그인 필요"})
        if path == "/api/logout":
            return self._send(200, {"ok": True})
        if path == "/api/license":
            key = str(body.get("key", ""))[:80]
            if not key:
                return self._send(400, {"error": "키가 비어 있음"})
            license.set_key(key)
            st = license.status()
            return self._send(200 if st.get("key_ok") else 400, st if st.get("key_ok") else {"error": "키가 맞지 않습니다(고객사 이름과 키가 짝이어야 함)", **st})
        if not license.allowed() and path not in ("/api/license", "/api/cloud/pair", "/api/cloud/sync"):
            return self._send(402, {"error": "평가 기간이 끝났습니다. 라이선스 키를 입력하세요.", "license": license.status()})
        m = DECISION_RE.match(path)
        if m:
            code, out = decide(m.group(1), body.get("decision"), str(body.get("note", ""))[:300])
            return self._send(code, out)
        m = GEN_RE.match(path)
        if m:
            runner.load_dotenv()
            flow, info = flows.generate(m.group(1), str(body.get("prompt", "")))
            if flow is None:
                return self._send(400, info)
            return self._send(200, {"flow": flow, "info": info})
        m = FLOW_RE.match(path)
        if m:
            saved = flows.save(m.group(1), body if isinstance(body, dict) else {})
            if saved is None:
                return self._send(404, {"error": "없는 그룹"})
            return self._send(200, {"ok": True, "flow": saved})
        m = PLAN_RE.match(path)
        if m:
            plan = plans.save(m.group(1), m.group(2), body)
            return self._send(200, {"ok": True, "plan": plan}) if plan is not None else self._send(400, {"error": "월(YYYY-MM)·계정을 확인하세요"})
        if path == "/api/demo":  # 화면 시험용: 에이전트를 부르지 않는 드라이런만 허용(비용 없음)
            scenario = body.get("scenario") if body.get("scenario") in ("ok", "bad") else "ok"
            tool = body.get("tool") if toolkit.manifest(str(body.get("tool") or "")) else "instagram"
            if tool == "instagram":
                ids = [a["id"] for a in toolkit.accounts("instagram")]
                if not ids:
                    return self._send(400, {"error": "인스타그램 도구에 계정을 먼저 등록하세요"})
                account = body.get("account") if body.get("account") in ids else ids[0]
                params = {"account": account, "topic": str(body.get("topic") or "(데모) 계약 전 확인할 3가지")[:80], "series": str(body.get("series", ""))[:40], "type": body.get("type", "general")}
            else:
                params = {"topic": str(body.get("topic") or "(데모) 시험 요청")[:80]}
                if tool == "kmong":
                    params["kind"] = body.get("kind") if body.get("kind") in ("service", "ebook", "knowhow") else "service"
            agent = toolkit.run_spec(tool).get("agent")
            threading.Thread(target=runner.run_agent, args=(agent, params, scenario), kwargs={"tool": tool}, daemon=True).start()
            return self._send(202, {"ok": True})
        m = TOOL_AGENT_RE.match(path)
        if m:
            names = toolkit.connect(m.group(1), str(body.get("agent", "")), bool(body.get("on")))
            return self._send(200, {"ok": True, "agents": names}) if names is not None else self._send(400, {"error": "도구 또는 에이전트를 확인하세요"})
        m = TOOL_RULES_RE.match(path)
        if m:
            r = toolkit.save_rules(m.group(1), body.get("rules") or {})
            return self._send(200, {"ok": True, "rules": r}) if r is not None else self._send(400, {"error": "규칙이 없는 도구"})
        m = TOOL_RE.match(path)
        if m:
            tid = m.group(1)
            if not toolkit.manifest(tid):
                return self._send(404, {"error": "없는 도구"})
            if "enabled" in body:
                if body.get("enabled") and not toolkit.entitled(tid):
                    return self._send(402, {"error": "이용권(요금제)에 없는 도구입니다. 웹 콘솔에서 요금제를 바꾸세요."})
                toolkit.set_enabled(tid, bool(body.get("enabled")))
            if isinstance(body.get("settings"), dict):
                toolkit.save_settings(tid, body["settings"])
            return self._send(200, {"ok": True, "tools": toolkit.status()})
        if path == "/api/keys":   # API 키 넣기: 이 PC에서 연 화면에서만(휴대폰 보기로는 못 바꿈)
            if self.client_address[0] not in ("127.0.0.1", "::1"):
                return self._send(403, {"error": "API 키는 이 PC에서 연 관리 화면에서만 바꿀 수 있습니다"})
            ok, err = secrets_env.save(str(body.get("name", ""))[:60], str(body.get("value", ""))[:400])
            return self._send(200, {"ok": True, "keys": secrets_env.status()}) if ok else self._send(400, {"error": err})
        if path == "/api/hr-example":
            lst = hr.toggle_example(str(body.get("run", ""))[:40], bool(body.get("on")))
            return self._send(200, {"ok": True, "examples": lst}) if lst is not None else self._send(400, {"error": "승인된 실행만 기준 예시로 지정할 수 있습니다"})
        m = HR_RE.match(path)
        if m:
            agent, act = m.group(1), m.group(2)
            if act == "shift":
                t = hr.set_shift(agent, body.get("shift") or {})
                return self._send(200, {"ok": True, "shift_text": t, "hr": hr.summary()}) if t else self._send(400, {"error": "에이전트 또는 근무 시간을 확인하세요"})
            if act == "decide":
                rec = hr.decide(agent, str(body.get("level", "")), body.get("reason", ""), body.get("articles") or [], body.get("days") or 0, body.get("fix", ""), body.get("evidence") or [])
                return self._send(200, {"ok": True, "record": rec, "hr": hr.summary()}) if rec else self._send(400, {"error": "징계 종류와 사유를 확인하세요"})
            if act == "reinstate":
                return self._send(200, {"ok": True, "hr": hr.summary()}) if hr.reinstate(agent) else self._send(400, {"error": "없는 에이전트"})
            if act == "evidence":
                return self._send(200, {"evidence": hr.evidence(agent), "rulebook": hr.rulebook()})
        if path == "/api/cloud/pair":
            ok, info = cloud_link.pair(str(body.get("console", ""))[:200], str(body.get("code", ""))[:40])
            return self._send(200 if ok else 400, info)
        if path == "/api/cloud/sync":
            ok, info = cloud_link.sync()
            return self._send(200 if ok else 400, info)
        if path == "/api/cloud/unpair":
            cloud_link.unpair()
            return self._send(200, {"ok": True})
        self._send(404, {"error": "없는 주소"})


def main():
    port = int(store.config().get("port", 4830))
    lan = lan_enabled()
    # 기본은 127.0.0.1 만(외부에서 접근 불가). 휴대폰으로 보기를 켜면 집 안 공유기 주소에서만, 비밀번호 로그인 후에만 열린다.
    srv = ThreadingHTTPServer(("0.0.0.0" if lan else "127.0.0.1", port), Handler)
    if os.environ.get("HUB_LAN", "") in ("1", "true", "on") and not lan:
        print("휴대폰으로 보기(HUB_LAN=1)는 .env 에 HUB_PASSWORD 를 정해야 켜집니다. 지금은 이 PC에서만 열립니다.")
    if lan:
        for u in lan_status()["urls"]:
            print(f"휴대폰(같은 와이파이)에서 열기: {u}")
    cloud_link.start_background()  # 웹 콘솔에 연결돼 있으면 주기적으로 상태 보고·이용권 갱신
    print(f"Agent Hub: http://127.0.0.1:{port}  (끄려면 Ctrl+C)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    sys.exit(main())
