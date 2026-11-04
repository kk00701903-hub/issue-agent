"""PC 실행기 ↔ 웹 콘솔 연결.

1) 고객이 웹 콘솔에서 「PC 연결 코드」를 받는다(10분 유효).
2) 이 PC 관리 화면(설정 → 웹 콘솔 연결)에 콘솔 주소와 코드를 넣으면 pair() 가 기기 토큰과 이용권(AH2)을 받는다.
3) 실행기가 켜져 있는 동안 15분마다 sync() 가 상태 요약을 보내고 이용권을 새로 받는다.

보내는 것(개인정보 최소): 실행기 버전, 기기 ID, 켜진 도구 ID, 오늘 실행 건수(상태별 개수), 작업 중 에이전트 수.
보내지 않는 것: 주제·원고·패키지 내용·파일·키·로그 내용.
"""
import json
import socket
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse

from hub import license, store
from hub.version import VERSION

STATE = store.DATA / "cloud.json"
SYNC_EVERY_SEC = 15 * 60
_started = False


def _state():
    return store.read_json(STATE, {}) or {}


def _save(st):
    store.write_json(STATE, st)


def status():
    st = _state()
    return {"paired": bool(st.get("device_token")), "console": st.get("console", ""), "org": st.get("org", ""),
            "paired_at": st.get("paired_at", ""), "last_sync": st.get("last_sync", ""), "last_error": st.get("last_error", ""),
            "device": license.device_id()}


def _console_ok(url):
    u = urlparse(url)
    if u.scheme == "https" and u.netloc:
        return True
    return u.scheme == "http" and (u.hostname or "") in ("127.0.0.1", "localhost")  # 개발·시험용


def _post(url, body, token=None, timeout=10):
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST", headers={"Content-Type": "application/json", "X-Hub": "1",
                                                                         "User-Agent": f"AgentHubRunner/{VERSION}"})
    if token:
        req.add_header("Authorization", "Bearer " + token)
    host = urlparse(url).hostname or ""
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({})) if host in ("127.0.0.1", "localhost") else urllib.request.build_opener()
    try:
        with opener.open(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8") or "{}")
        except Exception:  # noqa: BLE001
            return e.code, {"error": str(e)}
    except (urllib.error.URLError, socket.timeout, OSError) as e:
        return 0, {"error": f"콘솔에 연결할 수 없음: {e}"}


def summary():
    """콘솔로 보내는 상태 요약(내용 없음, 개수만)."""
    from hub import toolkit
    today = store.today()
    counts = {}
    for r in store.list_runs(200):
        if str(r.get("created", "")).startswith(today):
            counts[r["status"]] = counts.get(r["status"], 0) + 1
    live = store.live_agents()
    return {"version": VERSION, "device": license.device_id(), "host": socket.gethostname()[:40],
            "tools_enabled": [t["id"] for t in toolkit.status() if t["enabled"]],
            "runs_today": counts, "agents_working": sum(1 for v in live.values() if v.get("busy"))}


def pair(console, code):
    console = console.strip().rstrip("/")
    if not _console_ok(console):
        return False, {"error": "콘솔 주소는 https:// 로 시작해야 합니다"}
    if not code.strip():
        return False, {"error": "연결 코드를 넣으세요"}
    st, out = _post(console + "/api/device/pair", {"code": code.strip(), **summary()})
    if st != 200 or not out.get("device_token"):
        return False, {"error": out.get("error") or f"연결 실패({st})"}
    s = {"console": console, "device_token": out["device_token"], "org": out.get("org", ""), "paired_at": store.now(),
         "last_sync": store.now(), "last_error": ""}
    _save(s)
    if out.get("entitlement"):
        license.set_token(out["entitlement"], "cloud")
    store.log_work(f"웹 콘솔 연결: {console} · {out.get('org', '')}")
    return True, {"ok": True, "cloud": status(), "license": license.status()}


def sync():
    s = _state()
    if not s.get("device_token"):
        return False, {"error": "웹 콘솔에 연결되어 있지 않음"}
    st, out = _post(s["console"] + "/api/device/heartbeat", summary(), token=s["device_token"])
    if st == 200:
        if out.get("entitlement"):
            license.set_token(out["entitlement"], "cloud")
        s.update(last_sync=store.now(), last_error="", org=out.get("org", s.get("org", "")))
        _save(s)
        return True, {"ok": True, "cloud": status(), "license": license.status()}
    s["last_error"] = out.get("error") or f"동기화 실패({st})"
    if st in (401, 403):  # 콘솔에서 이 기기를 지움
        s["device_token"] = ""
    _save(s)
    return False, {"error": s["last_error"]}


def unpair():
    s = _state()
    s["device_token"] = ""
    _save(s)


def start_background():
    global _started
    if _started:
        return
    _started = True

    def loop():
        while True:
            if _state().get("device_token"):
                try:
                    sync()
                except Exception:  # noqa: BLE001 — 동기화 실패가 실행기를 멈추면 안 된다
                    pass
            time.sleep(SYNC_EVERY_SEC)

    threading.Thread(target=loop, daemon=True, name="cloud-sync").start()
