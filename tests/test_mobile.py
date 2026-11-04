"""휴대폰으로 보기(같은 와이파이) 시험: 비밀번호가 있어야만 켜지고, 집 안 주소에서만 들어온다.

python -m unittest discover -s tests
"""
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

os.environ["AGENT_HUB_NO_LOG"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from hub import server  # noqa: E402


def req(host, client):
    return SimpleNamespace(headers={"Host": host, "Cookie": ""}, client_address=(client, 5000))


class LanTests(unittest.TestCase):
    def setUp(self):
        self._env = {k: os.environ.get(k) for k in ("HUB_LAN", "HUB_PASSWORD")}

    def tearDown(self):
        for k, v in self._env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def test_off_by_default(self):
        os.environ.pop("HUB_LAN", None)
        self.assertTrue(server.Handler._host_ok(req("127.0.0.1:4830", "127.0.0.1")))
        self.assertFalse(server.Handler._host_ok(req("192.168.0.12:4830", "192.168.0.30")))

    def test_needs_password(self):
        os.environ["HUB_LAN"] = "1"; os.environ["HUB_PASSWORD"] = ""
        self.assertFalse(server.lan_enabled())
        self.assertFalse(server.Handler._host_ok(req("192.168.0.12:4830", "192.168.0.30")))

    def test_lan_only_private(self):
        os.environ["HUB_LAN"] = "1"; os.environ["HUB_PASSWORD"] = "pw-123456"
        self.assertTrue(server.Handler._host_ok(req("192.168.0.12:4830", "192.168.0.30")))
        self.assertFalse(server.Handler._host_ok(req("evil.example.com:4830", "192.168.0.30")))   # DNS 리바인딩 막기
        self.assertFalse(server.Handler._host_ok(req("192.168.0.12:4830", "8.8.8.8")))            # 집 밖 기기
        self.assertFalse(server.Handler._logged_in(req("192.168.0.12:4830", "192.168.0.30")))     # 로그인 전

    def test_no_password_means_this_pc_only(self):
        os.environ["HUB_PASSWORD"] = ""
        self.assertTrue(server.Handler._logged_in(req("127.0.0.1:4830", "127.0.0.1")))
        self.assertFalse(server.Handler._logged_in(req("192.168.0.12:4830", "192.168.0.30")))


if __name__ == "__main__":
    unittest.main()
