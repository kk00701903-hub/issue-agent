"""Agent Hub 웹 콘솔(SaaS) — 가입·조직·요금제·도구 선택·PC 연결·이용권 발급.

실행(개발):  CLOUD_SIGNING_SEED=<64자 hex> python -m cloud.app --port 8080
배포:        docs/cloud-deploy.md (Docker + HTTPS 리버스 프록시)

외부 패키지 없이 표준 라이브러리 + SQLite 로 돈다. 사용자가 많아지면 db.py 만 Postgres 로 바꾼다.

역할 나눔
- 웹 콘솔(여기): 계정·결제·요금제·기기 목록. 에이전트를 돌리지 않고 고객 원고·파일을 받지 않는다.
- PC 실행기(hub/): 고객 PC에서 에이전트를 돌린다. 콘솔과는 기기 토큰으로 15분마다 상태 개수만 주고받는다.
"""
import argparse
import hashlib
import hmac
import json
import os
import re
import secrets
import sys
import threading
import time
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from cloud import db
from hub import ed25519

HERE = Path(__file__).resolve().parent
STATIC = HERE / "static"
PLANS = json.loads((HERE / "plans.json").read_text(encoding="utf-8"))
PLAN_BY_ID = {p["id"]: p for p in PLANS["plans"]}
BILLING = {b["months"]: b for b in PLANS.get("billing", [{"months": 1, "label": "월간", "discount": 0}])}


def price_of(plan_id, months):
    """결제 금액: 월 정가 × 개월 × (1 − 기간 할인), 100원 단위로 내림. 조건부 추가 할인은 관리자가 증빙 확인 뒤 따로 적용."""
    b = BILLING.get(int(months))
    if not b:
        return None
    total = PLAN_BY_ID[plan_id]["price"] * int(months) * (1 - float(b.get("discount", 0)))
    return int(total // 100 * 100)


def price_table():
    """요금표(월간·결제 기간별 금액·월 환산·절약액) — 판매 페이지와 콘솔이 같은 숫자를 쓴다."""
    rows = []
    for p in PLANS["plans"]:
        if not p.get("public"):
            continue
        r = {"id": p["id"], "name": p["name"], "monthly": p["price"], "periods": []}
        for m, b in sorted(BILLING.items()):
            amt = price_of(p["id"], m)
            r["periods"].append({"months": m, "label": b["label"], "discount": b.get("discount", 0), "amount": amt,
                                 "per_month": amt // m, "saving": p["price"] * m - amt})
        rows.append(r)
    return rows
TOOL_IDS = [t["id"] for t in PLANS["tools"]]
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[A-Za-z]{2,}$")
TOKEN_DAYS = 7          # 이용권 토큰 수명(이 안에 한 번은 동기화해야 함). 결제 기간이 더 짧으면 그날까지.
GRACE_DAYS = 7
CODE_MIN = 10           # 연결 코드 유효 시간(분)
SESSION_DAYS = 14
_login_fail = {}        # ip → [시각…] (간단한 로그인 시도 제한)
_lock = threading.Lock()


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def signing_seed():
    s = os.environ.get("CLOUD_SIGNING_SEED", "").strip()
    if len(s) != 64:
        raise SystemExit("CLOUD_SIGNING_SEED(64자 hex)가 없습니다. python -m cloud.keys new 로 만드세요.")
    return bytes.fromhex(s)


# ---------- 비밀번호·토큰 ----------
def hash_pw(pw, salt=None):
    salt = salt or secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt, 200_000)
    return "pbkdf2$200000$" + salt.hex() + "$" + dk.hex()


def check_pw(pw, stored):
    try:
        _alg, it, salt, dk = stored.split("$")
        got = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), bytes.fromhex(salt), int(it))
        return hmac.compare_digest(got.hex(), dk)
    except (ValueError, AttributeError):
        return False


def sha(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def _b64e(b):
    import base64
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def make_entitlement(org, device_id):
    """PC 실행기용 이용권 토큰(AH2). hub/license.py 의 parse_token 과 짝."""
    plan = PLAN_BY_ID.get(org["plan"], PLAN_BY_ID["trial"])
    until = date.fromisoformat(org["plan_until"])
    exp = min(until, date.today() + timedelta(days=TOKEN_DAYS))
    tools = ["*"] if plan["tools_max"] >= len(TOOL_IDS) and org["plan"] in ("trial", "team") else json.loads(org["tools"] or "[]")
    payload = {"v": 2, "org": org["name"], "org_id": org["id"], "plan": org["plan"], "tools": tools, "device": device_id,
               "iat": now(), "exp": exp.isoformat(), "grace_days": GRACE_DAYS if until >= date.today() else 0}
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return "AH2." + _b64e(body) + "." + _b64e(ed25519.sign(signing_seed(), body))


# ---------- 요금제 ----------
def org_view(org):
    plan = PLAN_BY_ID.get(org["plan"], PLAN_BY_ID["trial"])
    left = (date.fromisoformat(org["plan_until"]) - date.today()).days
    return {"id": org["id"], "name": org["name"], "plan": org["plan"], "plan_name": plan["name"], "plan_until": org["plan_until"],
            "days_left": left, "active": left >= 0, "tools": json.loads(org["tools"] or "[]"), "tools_max": plan["tools_max"],
            "devices_max": plan["devices"]}


def set_tools(org_id, tools):
    org = db.org(org_id)
    plan = PLAN_BY_ID.get(org["plan"], PLAN_BY_ID["trial"])
    beta = {t["id"] for t in PLANS["tools"] if t.get("beta")}
    tools = [t for t in dict.fromkeys(tools) if t in TOOL_IDS]
    if org["plan"] not in ("trial", "team"):  # 베타 도구는 평가판·팀 요금제만
        tools = [t for t in tools if t not in beta]
    if len(tools) > plan["tools_max"]:
        return None, f"{plan['name']} 요금제는 도구를 {plan['tools_max']}개까지 고를 수 있습니다"
    db.exec("UPDATE orgs SET tools=? WHERE id=?", (json.dumps(tools), org_id))
    db.audit(org_id, "tools", ",".join(tools))
    return tools, ""


def activate_plan(org_id, plan_id, months=1, ref=""):
    """결제 확인 뒤 요금제 적용(웹훅·관리자 명령이 부른다). 남은 기간에 이어 붙인다."""
    if plan_id not in PLAN_BY_ID or plan_id == "trial":
        return False
    org = db.org(org_id)
    if not org:
        return False
    start = max(date.today(), date.fromisoformat(org["plan_until"])) if org["plan"] == plan_id else date.today()
    until = (start + timedelta(days=31 * max(1, int(months)))).isoformat()
    tools = json.loads(org["tools"] or "[]")[:PLAN_BY_ID[plan_id]["tools_max"]]
    db.exec("UPDATE orgs SET plan=?, plan_until=?, tools=? WHERE id=?", (plan_id, until, json.dumps(tools), org_id))
    db.audit(org_id, "plan", f"{plan_id} ~{until} {ref}")
    return True


# ---------- HTTP ----------
class Handler(BaseHTTPRequestHandler):
    server_version = "AgentHubConsole/1.0"

    def log_message(self, fmt, *args):
        pass

    def _send(self, code, body, ctype="application/json; charset=utf-8", headers=None):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "same-origin")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def _body(self):
        try:
            n = min(int(self.headers.get("Content-Length", "0")), 200_000)
            return json.loads(self.rfile.read(n) or b"{}") if n else {}
        except (ValueError, json.JSONDecodeError):
            return {}

    def _ip(self):
        return (self.headers.get("X-Forwarded-For", "") or self.client_address[0]).split(",")[0].strip()

    def _user(self):
        for part in self.headers.get("Cookie", "").split(";"):
            k, _, v = part.strip().partition("=")
            if k == "ahc_session" and v:
                return db.session_user(sha(v))
        return None

    def _cookie(self, tok, days=SESSION_DAYS):
        secure = "" if os.environ.get("CLOUD_DEV") == "1" else " Secure;"
        return f"ahc_session={tok}; Path=/; HttpOnly;{secure} SameSite=Lax; Max-Age={days * 86400}"

    def _device(self):
        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return None
        return db.device_by_token(sha(auth[7:].strip()))

    # --- GET ---
    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/", "/index.html"):
            return self._send(200, (STATIC / "index.html").read_bytes(), "text/html; charset=utf-8")
        if path in ("/app", "/app/"):
            return self._send(200, (STATIC / "console.html").read_bytes(), "text/html; charset=utf-8")
        m = re.match(r"^/static/([A-Za-z0-9_.-]+)$", path)
        if m and (STATIC / m.group(1)).is_file():
            ext = m.group(1).rsplit(".", 1)[-1]
            ct = {"js": "text/javascript; charset=utf-8", "css": "text/css; charset=utf-8", "png": "image/png", "svg": "image/svg+xml", "html": "text/html; charset=utf-8"}.get(ext, "application/octet-stream")
            return self._send(200, (STATIC / m.group(1)).read_bytes(), ct)
        if path == "/api/plans":
            return self._send(200, {"plans": [p for p in PLANS["plans"] if p.get("public")], "tools": PLANS["tools"], "currency": PLANS["currency"], "trial_days": PLANS["trial_days"],
                                    "prices": price_table(), "extra_discounts": PLANS.get("extra_discounts", []), "max_discount": PLANS.get("max_discount")})
        if path == "/healthz":
            return self._send(200, {"ok": True})
        if path == "/api/me":
            u = self._user()
            if not u:
                return self._send(401, {"error": "로그인 필요"})
            org = db.org(u["org_id"])
            return self._send(200, {"user": {"email": u["email"], "role": u["role"]}, "org": org_view(org), "devices": db.devices(org["id"]),
                                    "payments": db.payments(org["id"]), "plans": [p for p in PLANS["plans"] if p.get("public")], "tools": PLANS["tools"], "prices": price_table()})
        self._send(404, {"error": "없는 주소"})

    # --- POST ---
    def do_POST(self):
        path = self.path.split("?")[0]
        if path == "/api/billing/webhook":  # 서명 검사에 원문이 필요해서 본문을 먼저 읽지 않는다
            return self._webhook()
        body = self._body()
        # 실행기(기기) API: 기기 토큰으로 인증, 브라우저 쿠키 안 씀
        if path == "/api/device/pair":
            return self._pair(body)
        if path == "/api/device/heartbeat":
            return self._heartbeat(body)
        if self.headers.get("X-Hub") != "1":  # 다른 사이트에서 몰래 보내는 요청 막기(CSRF)
            return self._send(403, {"error": "X-Hub 헤더 필요"})
        if path == "/api/signup":
            return self._signup(body)
        if path == "/api/login":
            return self._login(body)
        u = self._user()
        if not u:
            return self._send(401, {"error": "로그인 필요"})
        org_id = u["org_id"]
        if path == "/api/logout":
            for part in self.headers.get("Cookie", "").split(";"):
                k, _, v = part.strip().partition("=")
                if k == "ahc_session":
                    db.exec("DELETE FROM sessions WHERE token_hash=?", (sha(v),))
            return self._send(200, {"ok": True}, headers={"Set-Cookie": self._cookie("", 0)})
        if u["role"] != "owner":
            return self._send(403, {"error": "관리자만 바꿀 수 있습니다"})
        if path == "/api/org/tools":
            tools, err = set_tools(org_id, body.get("tools") or [])
            return self._send(200, {"ok": True, "org": org_view(db.org(org_id))}) if tools is not None else self._send(400, {"error": err})
        if path == "/api/devices/code":
            org = org_view(db.org(org_id))
            if len([d for d in db.devices(org_id) if not d["revoked"]]) >= org["devices_max"]:
                return self._send(400, {"error": f"{org['plan_name']} 요금제는 PC {org['devices_max']}대까지입니다. 안 쓰는 PC를 지우거나 요금제를 올리세요."})
            alph = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
            code = "".join(secrets.choice(alph) for _ in range(4)) + "-" + "".join(secrets.choice(alph) for _ in range(4))
            exp = (datetime.now(timezone.utc) + timedelta(minutes=CODE_MIN)).isoformat(timespec="seconds")
            db.exec("INSERT INTO pair_codes(code, org_id, expires, used) VALUES(?,?,?,0)", (code, org_id, exp))
            return self._send(200, {"code": code, "expires": exp, "minutes": CODE_MIN})
        m = re.match(r"^/api/devices/(\d+)/revoke$", path)
        if m:
            db.exec("UPDATE devices SET revoked=1, token_hash='' WHERE id=? AND org_id=?", (int(m.group(1)), org_id))
            db.audit(org_id, "device_revoke", m.group(1))
            return self._send(200, {"ok": True})
        m = re.match(r"^/api/devices/offline-token$", path)
        if m:
            dev = str(body.get("device", ""))[:40]
            if not re.match(r"^dev_[0-9a-f]{16}$", dev):
                return self._send(400, {"error": "기기 ID(dev_로 시작하는 20자)를 확인하세요"})
            org = db.org(org_id)
            if date.fromisoformat(org["plan_until"]) < date.today():
                return self._send(402, {"error": "요금제 기간이 끝났습니다"})
            db.audit(org_id, "offline_token", dev)
            return self._send(200, {"token": make_entitlement(org, dev)})
        if path == "/api/billing/checkout":
            plan = str(body.get("plan", ""))
            if plan not in PLAN_BY_ID or not PLAN_BY_ID[plan].get("public"):
                return self._send(400, {"error": "요금제를 확인하세요"})
            try:
                months = int(body.get("months") or 1)
            except (TypeError, ValueError):
                months = 0
            if months not in BILLING:
                return self._send(400, {"error": "결제 기간은 " + ", ".join(f"{m}개월" for m in sorted(BILLING)) + " 중 하나"})
            ref = "ord_" + secrets.token_hex(6)
            amount = price_of(plan, months)
            db.exec("INSERT INTO payments(org_id, plan, months, amount, status, ref, created) VALUES(?,?,?,?,?,?,?)", (org_id, plan, months, amount, "pending", ref, now()))
            return self._send(200, checkout_instructions(ref, plan, months, amount, u["email"]))
        self._send(404, {"error": "없는 주소"})

    def _signup(self, b):
        email, pw, org = str(b.get("email", "")).strip().lower()[:254], str(b.get("password", "")), str(b.get("org", "")).strip()[:60]
        if not EMAIL_RE.match(email):
            return self._send(400, {"error": "이메일 형식을 확인하세요"})
        if len(pw) < 10:
            return self._send(400, {"error": "비밀번호는 10자 이상"})
        if not b.get("agree"):
            return self._send(400, {"error": "이용약관·개인정보 처리방침에 동의해야 합니다"})
        if db.user_by_email(email):
            return self._send(409, {"error": "이미 가입한 이메일입니다"})
        until = (date.today() + timedelta(days=PLANS["trial_days"])).isoformat()
        org_id = db.exec("INSERT INTO orgs(name, plan, plan_until, tools, created) VALUES(?,?,?,?,?)", (org or email.split("@")[0], "trial", until, "[]", now()))
        uid = db.exec("INSERT INTO users(org_id, email, pw_hash, role, created) VALUES(?,?,?,?,?)", (org_id, email, hash_pw(pw), "owner", now()))
        db.audit(org_id, "signup", email)
        return self._session(uid)

    def _login(self, b):
        ip = self._ip()
        with _lock:
            fails = [t for t in _login_fail.get(ip, []) if time.time() - t < 600]
            _login_fail[ip] = fails
        if len(fails) >= 8:
            return self._send(429, {"error": "로그인 시도가 너무 많습니다. 10분 뒤 다시 하세요."})
        u = db.user_by_email(str(b.get("email", "")).strip().lower())
        if not u or not check_pw(str(b.get("password", "")), u["pw_hash"]):
            with _lock:
                _login_fail.setdefault(ip, []).append(time.time())
            return self._send(401, {"error": "이메일 또는 비밀번호가 틀렸습니다"})
        return self._session(u["id"])

    def _session(self, uid):
        tok = secrets.token_urlsafe(32)
        exp = (datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)).isoformat(timespec="seconds")
        db.exec("INSERT INTO sessions(token_hash, user_id, expires) VALUES(?,?,?)", (sha(tok), uid, exp))
        return self._send(200, {"ok": True}, headers={"Set-Cookie": self._cookie(tok)})

    def _pair(self, b):
        code = str(b.get("code", "")).strip().upper()
        dev = str(b.get("device", ""))[:40]
        if not re.match(r"^dev_[0-9a-f]{16}$", dev):
            return self._send(400, {"error": "기기 ID 형식이 틀렸습니다"})
        row = db.one("SELECT * FROM pair_codes WHERE code=?", (code,))
        if not row or row["used"] or row["expires"] < now():
            return self._send(400, {"error": "연결 코드가 틀렸거나 만료됐습니다(10분 유효). 콘솔에서 새로 받으세요."})
        org = db.org(row["org_id"])
        db.exec("UPDATE pair_codes SET used=1 WHERE code=?", (code,))
        token = "dvt_" + secrets.token_urlsafe(32)
        old = db.one("SELECT id FROM devices WHERE org_id=? AND device_id=?", (org["id"], dev))
        summary = json.dumps(_clean_summary(b), ensure_ascii=False)
        if old:
            db.exec("UPDATE devices SET token_hash=?, revoked=0, last_seen=?, last_summary=?, name=? WHERE id=?", (sha(token), now(), summary, str(b.get("host", ""))[:40], old["id"]))
        else:
            db.exec("INSERT INTO devices(org_id, device_id, name, token_hash, created, last_seen, last_summary, revoked) VALUES(?,?,?,?,?,?,?,0)",
                    (org["id"], dev, str(b.get("host", ""))[:40], sha(token), now(), now(), summary))
        db.audit(org["id"], "device_pair", dev)
        return self._send(200, {"device_token": token, "org": org["name"], "entitlement": make_entitlement(org, dev)})

    def _heartbeat(self, b):
        d = self._device()
        if not d or d["revoked"]:
            return self._send(401, {"error": "이 PC 연결이 끊겼습니다. 콘솔에서 다시 연결하세요."})
        db.exec("UPDATE devices SET last_seen=?, last_summary=? WHERE id=?", (now(), json.dumps(_clean_summary(b), ensure_ascii=False), d["id"]))
        org = db.org(d["org_id"])
        return self._send(200, {"ok": True, "org": org["name"], "entitlement": make_entitlement(org, d["device_id"])})

    def _webhook(self):
        """결제 대행사 웹훅. 서명: X-Signature = hex(HMAC-SHA256(BILLING_WEBHOOK_SECRET, 본문)).
        본문 JSON: {"ref": 주문번호, "status": "paid"}. 대행사별 형식은 billing.py 에서 바꿔 끼운다."""
        secret = os.environ.get("BILLING_WEBHOOK_SECRET", "")
        n = min(int(self.headers.get("Content-Length", "0") or 0), 100_000)
        raw = self.rfile.read(n) if n else b""
        sig = self.headers.get("X-Signature", "")
        if not secret or not hmac.compare_digest(sig, hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()):
            return self._send(401, {"error": "서명 오류"})
        try:
            b = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            return self._send(400, {"error": "본문 오류"})
        pay = db.one("SELECT * FROM payments WHERE ref=?", (str(b.get("ref", "")),))
        if not pay:
            return self._send(404, {"error": "주문 없음"})
        if b.get("status") == "paid" and pay["status"] != "paid":
            db.exec("UPDATE payments SET status='paid' WHERE id=?", (pay["id"],))
            activate_plan(pay["org_id"], pay["plan"], pay["months"], pay["ref"])
        return self._send(200, {"ok": True})


def _clean_summary(b):
    """기기가 보낸 요약에서 개수·ID 만 남긴다(내용이 섞여 와도 저장하지 않음)."""
    runs = b.get("runs_today") if isinstance(b.get("runs_today"), dict) else {}
    return {"version": str(b.get("version", ""))[:20], "tools_enabled": [str(t)[:20] for t in (b.get("tools_enabled") or [])][:20],
            "runs_today": {str(k)[:24]: int(v) for k, v in list(runs.items())[:12] if isinstance(v, int)},
            "agents_working": int(b.get("agents_working") or 0)}


def checkout_instructions(ref, plan, months, amount, email):
    """결제 안내. 결제 대행사(토스페이먼츠·포트원 등) 계약 전에는 계좌이체 안내 + 관리자 확인 방식."""
    provider = os.environ.get("BILLING_PROVIDER", "manual")
    if provider == "manual":
        bank = os.environ.get("BILLING_BANK_INFO", "(판매자 계좌 정보를 BILLING_BANK_INFO 에 넣으세요)")
        return {"provider": "manual", "ref": ref, "amount": amount, "plan": plan, "months": months,
                "message": f"{bank} 로 {amount:,}원을 보내 주세요(입금자명에 주문번호 {ref}). 확인되면 요금제가 바로 바뀝니다. 세금계산서는 {email} 로 보냅니다."}
    return {"provider": provider, "ref": ref, "amount": amount, "plan": plan, "months": months,
            "message": "결제 창 연동은 docs/cloud-deploy.md 의 「결제 연동」을 따라 붙입니다."}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8080")))
    ap.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    a = ap.parse_args(argv)
    signing_seed()  # 키가 없으면 여기서 멈춤
    db.init()
    srv = ThreadingHTTPServer((a.host, a.port), Handler)
    print(f"Agent Hub 콘솔: http://{a.host}:{a.port}  (HTTPS 는 앞단 프록시에서)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
