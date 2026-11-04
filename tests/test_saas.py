"""SaaS 시험: 웹 콘솔 가입 → 도구 고르기 → PC 연결 코드 → 실행기 연결 → 이용권(AH2) 검증 → 동기화 → 연결 끊기.

python -m unittest discover -s tests
"""
import json
import os
import secrets
import sys
import tempfile
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

os.environ["AGENT_HUB_NO_LOG"] = "1"
os.environ["NO_PROXY"] = os.environ["no_proxy"] = "127.0.0.1,localhost"  # 시험 서버는 프록시를 거치지 않게
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from hub import ed25519  # noqa: E402


class Ed25519Tests(unittest.TestCase):
    def test_rfc8032_vector_and_tamper(self):
        seed = bytes.fromhex("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60")
        pk = ed25519.public_key(seed)
        self.assertEqual(pk.hex(), "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a")
        sig = ed25519.sign(seed, b"hello")
        self.assertTrue(ed25519.verify(pk, b"hello", sig))
        self.assertFalse(ed25519.verify(pk, b"hellO", sig))
        self.assertFalse(ed25519.verify(pk, b"hello", sig[:-1] + bytes([sig[-1] ^ 1])))

    def test_matches_cryptography_if_installed(self):
        try:
            from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        except ImportError:
            self.skipTest("cryptography 없음")
        seed = secrets.token_bytes(32)
        k = Ed25519PrivateKey.from_private_bytes(seed)
        self.assertEqual(ed25519.sign(seed, b"x" * 100), k.sign(b"x" * 100))


class SaasFlowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        t = Path(cls.tmp.name)
        cls.seed = secrets.token_bytes(32)
        os.environ["CLOUD_SIGNING_SEED"] = cls.seed.hex()
        os.environ["HUB_VENDOR_PUBKEY"] = ed25519.public_key(cls.seed).hex()
        os.environ["CLOUD_DEV"] = "1"
        os.environ["BILLING_WEBHOOK_SECRET"] = "whsec_test"
        from cloud import app, db
        db.DB_PATH = t / "console.db"
        db.init()
        cls.app = app
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
        cls.base = f"http://127.0.0.1:{cls.srv.server_address[1]}"
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        # 실행기 쪽 파일은 임시 폴더로
        from hub import cloud_link, license
        cls.lic, cls.link = license, cloud_link
        cls._saved = (license.LICENSE_FILE, license.DEVICE_FILE, cloud_link.STATE)
        license.LICENSE_FILE, license.DEVICE_FILE, cloud_link.STATE = t / "license.json", t / "device.json", t / "cloud.json"

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.lic.LICENSE_FILE, cls.lic.DEVICE_FILE, cls.link.STATE = cls._saved
        for k in ("CLOUD_SIGNING_SEED", "HUB_VENDOR_PUBKEY", "CLOUD_DEV", "BILLING_WEBHOOK_SECRET"):
            os.environ.pop(k, None)
        cls.tmp.cleanup()

    def req(self, path, body=None, cookie=None, headers=None):
        data = None if body is None else json.dumps(body).encode()
        r = urllib.request.Request(self.base + path, data=data, method="GET" if body is None else "POST")
        r.add_header("Content-Type", "application/json")
        if body is not None:
            r.add_header("X-Hub", "1")
        if cookie:
            r.add_header("Cookie", cookie)
        for k, v in (headers or {}).items():
            r.add_header(k, v)
        try:
            with urllib.request.urlopen(r, timeout=10) as res:
                return res.status, json.loads(res.read() or b"{}"), res.headers
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}"), e.headers

    def signup(self, email):
        st, out, hd = self.req("/api/signup", {"email": email, "password": "pw-1234567890", "org": "시험 스튜디오", "agree": True})
        self.assertEqual(st, 200, out)
        return hd["Set-Cookie"].split(";")[0]

    def test_full_flow(self):
        ck = self.signup("owner@example.com")
        st, me, _ = self.req("/api/me", cookie=ck)
        self.assertEqual(me["org"]["plan"], "trial")
        # 평가판 → 스타터 결제(웹훅) → 도구 1개만
        st, co, _ = self.req("/api/billing/checkout", {"plan": "starter"}, cookie=ck)
        self.assertEqual(st, 200)
        import hashlib, hmac as _h
        body = json.dumps({"ref": co["ref"], "status": "paid"}).encode()
        sig = _h.new(b"whsec_test", body, hashlib.sha256).hexdigest()
        r = urllib.request.Request(self.base + "/api/billing/webhook", data=body, method="POST", headers={"X-Signature": sig, "Content-Type": "application/json"})
        with urllib.request.urlopen(r) as res:
            self.assertEqual(res.status, 200)
        st, out, _ = self.req("/api/org/tools", {"tools": ["instagram", "webnovel"]}, cookie=ck)
        self.assertEqual(st, 400)  # 스타터는 1개
        st, out, _ = self.req("/api/org/tools", {"tools": ["instagram"]}, cookie=ck)
        self.assertEqual(out["org"]["tools"], ["instagram"])
        # PC 연결
        st, code, _ = self.req("/api/devices/code", {}, cookie=ck)
        ok, info = self.link.pair(self.base, code["code"])
        self.assertTrue(ok, info)
        s = self.lic.status()
        self.assertEqual((s["mode"], s["plan"], s["tools"]), ("licensed", "starter", ["instagram"]))
        self.assertIn("instagram", self.lic.features())
        self.assertNotIn("webnovel", self.lic.features())
        # 같은 코드 두 번 못 씀
        self.assertFalse(self.link.pair(self.base, code["code"])[0])
        # 동기화
        self.assertTrue(self.link.sync()[0])
        st, me, _ = self.req("/api/me", cookie=ck)
        self.assertEqual(len(me["devices"]), 1)
        self.assertNotIn("topic", json.dumps(me["devices"][0]["summary"]))   # 내용은 안 받음
        # 다른 PC로 토큰 복사 → 무효
        tok = json.loads(self.lic.LICENSE_FILE.read_text())["token"]
        self.assertIsNone(self.lic.parse_token(tok, device="dev_0000000000000000"))
        # 서명 위조 → 무효
        self.assertIsNone(self.lic.parse_token(tok[:-3] + ("AAA" if not tok.endswith("AAA") else "BBB")))
        # 콘솔에서 연결 끊기 → 동기화 실패
        self.req(f"/api/devices/{me['devices'][0]['id']}/revoke", {}, cookie=ck)
        self.assertFalse(self.link.sync()[0])

    def test_csrf_and_auth_guards(self):
        r = urllib.request.Request(self.base + "/api/signup", data=b'{"email":"x@y.zz"}', method="POST", headers={"Content-Type": "application/json"})
        with self.assertRaises(urllib.error.HTTPError) as cm:
            urllib.request.urlopen(r)
        self.assertEqual(cm.exception.code, 403)  # X-Hub 없음
        st, _, _ = self.req("/api/me")
        self.assertEqual(st, 401)
        st, _, _ = self.req("/api/device/heartbeat", {}, headers={"Authorization": "Bearer dvt_nope"})
        self.assertEqual(st, 401)
        st, _, _ = self.req("/api/billing/webhook", {"ref": "x", "status": "paid"}, headers={"X-Signature": "bad"})
        self.assertEqual(st, 401)

    def test_expired_plan_gives_no_tools(self):
        ck = self.signup("late@example.com")
        st, code, _ = self.req("/api/devices/code", {}, cookie=ck)
        from cloud import db
        u = db.user_by_email("late@example.com")
        db.exec("UPDATE orgs SET plan_until='2020-01-01' WHERE id=?", (u["org_id"],))
        ok, _ = self.link.pair(self.base, code["code"])
        self.assertTrue(ok)
        self.assertEqual(self.lic.status()["mode"], "expired")
        self.assertEqual(self.lic.features(), [])

    def test_annual_pricing(self):
        a = self.app
        self.assertEqual(a.price_of("starter", 1), 29000)
        self.assertEqual(a.price_of("starter", 12), 278400)   # 연간 20% 할인
        self.assertEqual(a.price_of("pro", 6), 426600)        # 6개월 10% 할인
        self.assertIsNone(a.price_of("pro", 5))
        t = {r["id"]: r for r in a.price_table()}
        y = next(p for p in t["team"]["periods"] if p["months"] == 12)
        self.assertEqual((y["per_month"], y["saving"]), (159200, 477600))
        ck = self.signup("year@example.com")
        st, out, _ = self.req("/api/billing/checkout", {"plan": "pro", "months": 12}, cookie=ck)
        self.assertEqual(st, 200)
        st, _, _ = self.req("/api/billing/checkout", {"plan": "pro", "months": 3}, cookie=ck)
        self.assertEqual(st, 400)

    def test_cloud_tool_ids_match_catalog(self):
        from hub import toolkit
        cat = {t for t, m in toolkit.manifests().items() if not m.get("core")}
        self.assertEqual(set(self.app.TOOL_IDS), cat)


class ToolkitTests(unittest.TestCase):
    def test_every_tool_runs_and_prompts(self):
        from hub import toolkit
        for tid, m in toolkit.manifests().items():
            if m.get("core"):
                continue
            spec = m["run"]
            self.assertIn(spec["agent"], m["default_agents"], tid)
            p = toolkit.build_prompt(tid, spec["agent"], {"topic": "시험", "account": "a"}, "data/runs/x/" + spec["output"])
            self.assertIn("data/runs/x/", p, tid)
            self.assertNotIn("{", p, tid)

    def test_catalog_has_no_seller_private_data(self):
        bad = ["top.pick", "오정꿀", "ojeongkkul", "우히히시", "(주)제때", "송전탑", "ourfrequency", "E:\\\\dev", "C:\\\\dev\\\\"]
        for p in list((ROOT / "tools").rglob("*.json")) + list((ROOT / "tools").rglob("*.md")) + list((ROOT / "tools").rglob("*.py")):
            text = p.read_text(encoding="utf-8")
            for b in bad:
                self.assertNotIn(b, text, f"{p}: {b}")

    def test_document_validator(self):
        from hub import toolkit
        self.assertFalse(toolkit.validate_document("")["passed"])
        self.assertTrue(toolkit.validate_document("가" * 100 + "\n## 확인 필요\n- 없음")["passed"])


if __name__ == "__main__":
    unittest.main()


class KmongTests(unittest.TestCase):
    def test_kmong_rules(self):
        from tools.kmong.samples import sample
        from tools.kmong.validator import validate
        import json as _j
        rules = {k: v for k, v in _j.loads((ROOT / "tools/kmong/rules.json").read_text(encoding="utf-8")).items() if not k.startswith("_")}
        ok = validate(sample("인스타 릴스 대본 10편"), rules=rules)
        self.assertTrue(ok["passed"], ok["errors"])
        bad = validate(sample("x", scenario="bad"), rules=rules)
        self.assertTrue({"package_gap", "contact", "absolute", "guarantee"} <= {e["rule"] for e in bad["errors"]})
        eb = sample("전자책", kind="ebook"); eb["preview_pages"] = eb["preview_pages"][:3]
        self.assertIn("preview", {e["rule"] for e in validate(eb, rules=rules)["errors"]})
        cheap = sample("싼 것", kind="ebook"); cheap["packages"] = [dict(cheap["packages"][0], price=5000)]
        self.assertIn("min_price", {e["rule"] for e in validate(cheap, rules=rules)["errors"]})
