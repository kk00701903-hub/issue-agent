"""설정 화면 API 키 넣기 시험: 정해진 이름만, .env 다른 줄은 그대로, 값은 응답에 안 나옴."""
import os
import sys
import tempfile
import unittest
from pathlib import Path

os.environ["AGENT_HUB_NO_LOG"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from hub import secrets_env  # noqa: E402


class KeyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._env = secrets_env.ENV
        secrets_env.ENV = Path(self.tmp.name) / ".env"
        secrets_env.ENV.write_text("# 메모\nHUB_PASSWORD=pw\nANTHROPIC_API_KEY=여기에_API_키\n", encoding="utf-8")
        self._k = os.environ.get("ANTHROPIC_API_KEY")

    def tearDown(self):
        secrets_env.ENV = self._env
        if self._k is None:
            os.environ.pop("ANTHROPIC_API_KEY", None)
        else:
            os.environ["ANTHROPIC_API_KEY"] = self._k
        self.tmp.cleanup()

    def test_save_and_mask(self):
        os.environ.pop("ANTHROPIC_API_KEY", None)
        st = {k["name"]: k for k in secrets_env.status()}
        self.assertFalse(st["ANTHROPIC_API_KEY"]["set"])   # 예시 값은 없는 것으로
        ok, _ = secrets_env.save("ANTHROPIC_API_KEY", "sk-ant-test-1234567890abcd")
        self.assertTrue(ok)
        text = secrets_env.ENV.read_text(encoding="utf-8")
        self.assertIn("HUB_PASSWORD=pw", text); self.assertIn("# 메모", text)
        self.assertIn("ANTHROPIC_API_KEY=sk-ant-test-1234567890abcd", text)
        st = {k["name"]: k for k in secrets_env.status()}
        self.assertEqual((st["ANTHROPIC_API_KEY"]["set"], st["ANTHROPIC_API_KEY"]["tail"]), (True, "abcd"))
        self.assertNotIn("sk-ant", str(secrets_env.status()))
        ok, _ = secrets_env.save("ANTHROPIC_API_KEY", "")
        self.assertTrue(ok); self.assertIn("ANTHROPIC_API_KEY=\n", secrets_env.ENV.read_text(encoding="utf-8"))

    def test_rejects(self):
        self.assertFalse(secrets_env.save("HUB_PASSWORD", "x" * 10)[0])       # 정해진 키만
        self.assertFalse(secrets_env.save("ANTHROPIC_API_KEY", "a b c d e f g h")[0])   # 형식
        self.assertFalse(secrets_env.save("ANTHROPIC_API_KEY", "abc\nHUB_LAN=1")[0])    # 줄 끼워 넣기


if __name__ == "__main__":
    unittest.main()
