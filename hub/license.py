"""라이선스(이용권).

판매 방식(SaaS): 고객은 웹 콘솔에서 가입·결제하고, PC 실행기를 콘솔에 연결(연결 코드)한다.
콘솔은 판매자 비밀키로 서명한 「이용권 토큰」(AH2)을 이 PC에 내려 준다. 실행기는 공개키로만 검증하므로
고객 PC의 코드를 뜯어봐도 토큰을 만들 수 없다.

AH2 토큰 = "AH2." + base64url(JSON) + "." + base64url(Ed25519 서명)
  JSON: {"v":2, "org":고객 이름, "org_id":..., "plan":"starter|pro|team|trial", "tools":["instagram",...] 또는 ["*"],
         "device": 이 PC 기기 ID, "iat": 발급 시각, "exp": "YYYY-MM-DD"(이날까지), "grace_days": 7}
- 기기 ID 가 다르면(다른 PC에 복사) 무효.
- 만료 뒤 grace_days 동안은 「유예」로 계속 쓰고 화면에 경고(인터넷이 끊겨 갱신 못 한 경우 대비).
- 이용권이 없으면 평가판(TRIAL_DAYS일, 모든 도구).

옛 키(AH1, HMAC)는 비밀값이 코드에 들어 있어 위조할 수 있으므로 판매본에서는 받지 않는다.
이미 발급한 옛 키를 계속 쓰려면 hub/config.json 에 "allow_legacy_license": true (판매자 본인 PC 전용).

명령
  python -m hub.license check              지금 상태
  python -m hub.license device             이 PC 기기 ID
  python -m hub.license set-token <토큰>   토큰 넣기(보통은 콘솔 연결이 자동으로 넣음)
"""
import argparse
import base64
import hashlib
import hmac
import json
import os
import secrets
import sys
from datetime import date, timedelta

from hub import ed25519, store

LICENSE_FILE = store.DATA / "license.json"
DEVICE_FILE = store.DATA / "device.json"
PUBKEY_FILE = store.HUB / "keys" / "vendor.pub"
TRIAL_DAYS = 14
LEGACY_SECRET = os.environ.get("HUB_LICENSE_SECRET", "agent-hub-eval-secret-change-before-sale")


# ---------- 기기 ID ----------
def device_id():
    d = store.read_json(DEVICE_FILE, {}) or {}
    if not d.get("id"):
        d = {"id": "dev_" + secrets.token_hex(8), "created": store.now()}
        store.write_json(DEVICE_FILE, d)
    return d["id"]


# ---------- AH2 ----------
def _b64d(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _b64e(b):
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def vendor_pubkey():
    env = os.environ.get("HUB_VENDOR_PUBKEY", "").strip()
    if env:
        return bytes.fromhex(env)
    try:
        return bytes.fromhex(PUBKEY_FILE.read_text(encoding="utf-8").strip())
    except (FileNotFoundError, ValueError):
        return None


def make_token(payload, seed):
    """판매자(웹 콘솔)가 토큰을 만든다. seed = 32바이트 비밀키."""
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return "AH2." + _b64e(body) + "." + _b64e(ed25519.sign(seed, body))


def parse_token(token, pub=None, device=None):
    """맞으면 payload(dict), 아니면 None."""
    try:
        tag, body64, sig64 = str(token).strip().split(".")
        if tag != "AH2":
            return None
        body, sig = _b64d(body64), _b64d(sig64)
        pub = pub or vendor_pubkey()
        if not pub or not ed25519.verify(pub, body, sig):
            return None
        p = json.loads(body.decode("utf-8"))
        if p.get("v") != 2 or not p.get("exp"):
            return None
        if p.get("device") and p["device"] != (device or device_id()):
            return None
        return p
    except (ValueError, TypeError, json.JSONDecodeError):
        return None


# ---------- 옛 키(AH1) ----------
def _sig(customer, expires, secret):
    msg = f"{customer.strip()}|{expires}".encode("utf-8")
    return base64.b32encode(hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).digest()[:15]).decode().rstrip("=")


def issue(customer, secret, days=365):
    """옛 키 발급(판매자 본인 PC 시험용)."""
    expires = (date.today() + timedelta(days=days)).isoformat()
    return f"AH1-{expires.replace('-', '')}-{_sig(customer, expires, secret)}"


def parse(key, customer):
    try:
        tag, exp, sig = key.strip().split("-", 2)
        if tag != "AH1" or len(exp) != 8:
            return None
        expires = f"{exp[:4]}-{exp[4:6]}-{exp[6:]}"
        if not hmac.compare_digest(sig, _sig(customer, expires, LEGACY_SECRET)):
            return None
        return {"customer": customer, "expires": expires}
    except ValueError:
        return None


def legacy_allowed():
    return bool(store.config().get("allow_legacy_license")) or os.environ.get("HUB_ALLOW_LEGACY") == "1"


# ---------- 상태 ----------
def _state():
    st = store.read_json(LICENSE_FILE, {}) or {}
    if "trial_started" not in st:
        st["trial_started"] = date.today().isoformat()
        store.write_json(LICENSE_FILE, st)
    return st


def set_key(key):
    """관리 화면 입력칸: AH2 토큰이든 옛 키든 받는다."""
    st = _state()
    key = key.strip()
    if key.startswith("AH2."):
        st["token"] = key
    else:
        st["key"] = key
    store.write_json(LICENSE_FILE, st)


def set_token(token, source="manual"):
    st = _state()
    st["token"] = token.strip()
    st["token_source"] = source
    st["token_saved"] = store.now()
    store.write_json(LICENSE_FILE, st)


def status():
    """{'mode': 'licensed'|'grace'|'trial'|'expired', 'days_left', 'customer', 'expires', 'plan', 'tools', 'source'}"""
    st = _state()
    customer = (store.config().get("branding") or {}).get("customer_name", "")
    token = os.environ.get("HUB_LICENSE_TOKEN") or st.get("token", "")
    bad = {}
    if token:
        p = parse_token(token)
        if p:
            left = (date.fromisoformat(p["exp"]) - date.today()).days
            grace = int(p.get("grace_days", 7))
            mode = "licensed" if left >= 0 else ("grace" if left >= -grace else "expired")
            return {"mode": mode, "days_left": left, "customer": p.get("org") or customer, "expires": p["exp"],
                    "plan": p.get("plan", ""), "tools": p.get("tools", []), "source": "cloud", "key_ok": True,
                    "device": device_id(), "org_id": p.get("org_id", "")}
        bad = {"key_ok": False, "error": "이용권 토큰이 맞지 않음(다른 PC용이거나 손상됨)"}
    key = os.environ.get("HUB_LICENSE_KEY") or st.get("key", "")
    if key and legacy_allowed():
        info = parse(key, customer)
        if info:
            left = (date.fromisoformat(info["expires"]) - date.today()).days
            return {"mode": "licensed" if left >= 0 else "expired", "days_left": left, "customer": customer,
                    "expires": info["expires"], "plan": "legacy", "tools": ["*"], "source": "legacy", "key_ok": True, "device": device_id()}
        bad = bad or {"key_ok": False}
    elif key and not bad:
        bad = {"key_ok": False, "error": "옛 형식 키는 받지 않음 — 웹 콘솔에서 이 PC를 연결하세요"}
    started = date.fromisoformat(st["trial_started"])
    left = TRIAL_DAYS - (date.today() - started).days
    out = {"mode": "trial" if left >= 0 else "expired", "days_left": left, "customer": customer,
           "expires": (started + timedelta(days=TRIAL_DAYS)).isoformat(), "plan": "trial",
           "tools": ["*"] if left >= 0 else [], "source": "trial", "device": device_id()}
    out.update(bad)
    return out


def allowed():
    return status()["mode"] != "expired"


def features():
    """이용권에 든 도구 ID 목록(「*」=전부)."""
    st = status()
    return st.get("tools", []) if st["mode"] != "expired" else []


def main(argv=None):
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd")
    i = sub.add_parser("issue"); i.add_argument("--customer", required=True); i.add_argument("--secret", required=True); i.add_argument("--days", type=int, default=365)
    sub.add_parser("check")
    sub.add_parser("device")
    s = sub.add_parser("set"); s.add_argument("key")
    t = sub.add_parser("set-token"); t.add_argument("token")
    a = ap.parse_args(argv)
    if a.cmd == "issue":
        print(issue(a.customer, a.secret, a.days))
    elif a.cmd == "set":
        set_key(a.key); print(json.dumps(status(), ensure_ascii=False))
    elif a.cmd == "set-token":
        set_token(a.token); print(json.dumps(status(), ensure_ascii=False))
    elif a.cmd == "device":
        print(device_id())
    else:
        print(json.dumps(status(), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
