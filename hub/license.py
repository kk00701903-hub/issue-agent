"""라이선스: 30일 평가판 뒤 라이선스 키 필요.

키 발급(판매자 PC에서):  python -m hub.license issue --customer "고객사 이름" --secret <판매자 비밀문자열> [--days 365]
키 확인:                 python -m hub.license check
키 입력:                 .env 의 HUB_LICENSE_KEY=... 또는 관리 화면 설정에서 입력(data/license.json)

주의: 키는 HMAC(판매자 비밀문자열)로 만들며, 검증을 위해 같은 비밀문자열이 고객 PC의 코드(VERIFY_SECRET)에도 들어간다.
이는 '실수로 복제 사용'을 막는 수준이지 역공학을 막지 못한다. 정식 판매 전에는 공개키 서명(Ed25519)으로 바꿀 것(docs/release-checklist.md).
"""
import argparse
import base64
import hashlib
import hmac
import json
import os
import sys
from datetime import date, datetime, timedelta

from hub import store

LICENSE_FILE = store.DATA / "license.json"
TRIAL_DAYS = 30
VERIFY_SECRET = os.environ.get("HUB_LICENSE_SECRET", "agent-hub-eval-secret-change-before-sale")


def _sig(customer, expires, secret):
    msg = f"{customer.strip()}|{expires}".encode("utf-8")
    return base64.b32encode(hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).digest()[:15]).decode().rstrip("=")


def issue(customer, secret, days=365):
    expires = (date.today() + timedelta(days=days)).isoformat()
    sig = _sig(customer, expires, secret)
    return f"AH1-{expires.replace('-', '')}-{sig}"


def parse(key, customer):
    try:
        tag, exp, sig = key.strip().split("-", 2)
        if tag != "AH1" or len(exp) != 8:
            return None
        expires = f"{exp[:4]}-{exp[4:6]}-{exp[6:]}"
        if not hmac.compare_digest(sig, _sig(customer, expires, VERIFY_SECRET)):
            return None
        return {"customer": customer, "expires": expires}
    except ValueError:
        return None


def _state():
    st = store.read_json(LICENSE_FILE, {}) or {}
    if "trial_started" not in st:
        st["trial_started"] = date.today().isoformat()
        store.write_json(LICENSE_FILE, st)
    return st


def set_key(key):
    st = _state()
    st["key"] = key.strip()
    store.write_json(LICENSE_FILE, st)


def status():
    """{'mode': 'licensed'|'trial'|'expired', 'days_left': n, 'customer': str, 'expires': str}"""
    st = _state()
    customer = (store.config().get("branding") or {}).get("customer_name", "")
    key = os.environ.get("HUB_LICENSE_KEY") or st.get("key", "")
    if key:
        info = parse(key, customer)
        if info:
            left = (date.fromisoformat(info["expires"]) - date.today()).days
            return {"mode": "licensed" if left >= 0 else "expired", "days_left": left, "customer": customer, "expires": info["expires"], "key_ok": True}
        bad = {"key_ok": False}
    else:
        bad = {}
    started = date.fromisoformat(st["trial_started"])
    left = TRIAL_DAYS - (date.today() - started).days
    out = {"mode": "trial" if left >= 0 else "expired", "days_left": left, "customer": customer, "expires": (started + timedelta(days=TRIAL_DAYS)).isoformat()}
    out.update(bad)
    return out


def allowed():
    return status()["mode"] != "expired"


def main(argv=None):
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd")
    i = sub.add_parser("issue"); i.add_argument("--customer", required=True); i.add_argument("--secret", required=True); i.add_argument("--days", type=int, default=365)
    sub.add_parser("check")
    s = sub.add_parser("set"); s.add_argument("key")
    a = ap.parse_args(argv)
    if a.cmd == "issue":
        print(issue(a.customer, a.secret, a.days))
    elif a.cmd == "set":
        set_key(a.key); print(json.dumps(status(), ensure_ascii=False))
    else:
        print(json.dumps(status(), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
