"""인사(HR) 시험: 근무 시프트, 징계 효력(지시문·예산·정직·해고), 복직, 훅이 해고·근무 외 호출을 막는지.

python -m unittest discover -s tests
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

os.environ["AGENT_HUB_NO_LOG"] = "1"
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from hub import hr, toolkit  # noqa: E402

AGENT = "kmong-checker"


class HrTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        t = Path(self.tmp.name)
        self._saved = (hr.HR_FILE, toolkit.WS_DIR)
        hr.HR_FILE = t / "hr.json"
        if toolkit.WS_DIR.exists():
            shutil.copytree(toolkit.WS_DIR, t / "tools")
        toolkit.WS_DIR = t / "tools"

    def tearDown(self):
        hr.HR_FILE, toolkit.WS_DIR = self._saved
        self.tmp.cleanup()

    def test_shift(self):
        self.assertTrue(hr.can_work(AGENT)[0])   # 정하지 않으면 24시간
        hr.set_shift(AGENT, {"preset": "day"})
        p = hr.person(AGENT)
        self.assertTrue(hr.on_shift(p, datetime(2026, 11, 2, 10, 0)))    # 월 10시
        self.assertFalse(hr.on_shift(p, datetime(2026, 11, 2, 19, 0)))   # 월 19시
        self.assertFalse(hr.on_shift(p, datetime(2026, 11, 8, 10, 0)))   # 일요일
        hr.set_shift(AGENT, {"preset": "night"})
        p = hr.person(AGENT)
        self.assertTrue(hr.on_shift(p, datetime(2026, 11, 2, 23, 0)))
        self.assertTrue(hr.on_shift(p, datetime(2026, 11, 3, 6, 30)))
        self.assertFalse(hr.on_shift(p, datetime(2026, 11, 3, 12, 0)))
        self.assertIsNone(hr.set_shift(AGENT, {"preset": "custom", "days": [0], "start": "9시", "end": "18:00"}))
        self.assertEqual(hr.set_shift(AGENT, {"preset": "custom", "days": [5, 6], "start": "10:00", "end": "16:00"}), "토일 10:00–16:00")

    def test_discipline_effects_and_reinstate(self):
        self.assertIsNone(hr.decide(AGENT, "caution", ""))   # 사유 없으면 안 됨
        hr.decide(AGENT, "reprimand", "외부 연락처를 설명에 넣음", ["제5조"], fix="연락처·링크를 넣지 않는다")
        self.assertIn("반드시 연락처·링크를 넣지 않는다", hr.prompt_notes(AGENT))
        hr.decide(AGENT, "paycut", "한도 초과 반복", ["제6조"], days=3)
        self.assertEqual(hr.budget_factor(AGENT), 0.5)
        hr.decide(AGENT, "suspend", "금지 행동 반복", ["제4조"], days=2)
        self.assertFalse(hr.can_work(AGENT)[0])
        tools = [t for t in toolkit.manifests() if AGENT in toolkit.connected_agents(t)]
        self.assertTrue(tools)
        hr.decide(AGENT, "dismiss", "정직 중에도 같은 위반", ["제4조", "제8조"])
        ok, why = hr.can_work(AGENT)
        self.assertFalse(ok); self.assertIn("해고", why)
        self.assertFalse([t for t in toolkit.manifests() if AGENT in toolkit.connected_agents(t)])   # 도구 연결 해제
        self.assertFalse(toolkit.check_run(tools[0], AGENT)[0])
        hr.reinstate(AGENT)
        self.assertTrue(hr.can_work(AGENT)[0])
        self.assertEqual(sorted(t for t in toolkit.manifests() if AGENT in toolkit.connected_agents(t)), sorted(tools))
        self.assertEqual([c["level"] for c in hr.load()["committees"]], ["reprimand", "paycut", "suspend", "dismiss"])

    def test_hook_blocks_dismissed_and_protects_record(self):
        proj = Path(self.tmp.name) / "proj"
        shutil.copytree(ROOT / ".claude" / "hooks", proj / ".claude" / "hooks")
        (proj / "data").mkdir(parents=True)
        (proj / "data" / "hr.json").write_text(json.dumps({"agents": {AGENT: {"status": "dismissed"}, "trend-scout": {"shift": {"preset": "custom", "days": [], "start": "09:00", "end": "18:00"}}}}), encoding="utf-8")
        env = {**os.environ, "CLAUDE_PROJECT_DIR": str(proj)}
        env.pop("AGENT_HUB_NO_LOG", None)

        def hook(name, payload):
            return subprocess.run([sys.executable, str(proj / ".claude" / "hooks" / name)], input=json.dumps(payload), capture_output=True, text=True, env=env)
        r = hook("pre_tool_guard.py", {"tool_name": "Agent", "tool_input": {"subagent_type": AGENT}})
        self.assertEqual(r.returncode, 2); self.assertIn("해고", r.stderr)
        r = hook("pre_tool_guard.py", {"tool_name": "Task", "tool_input": {"subagent_type": "trend-scout"}})
        self.assertEqual(r.returncode, 2); self.assertIn("근무 시간", r.stderr)
        r = hook("pre_tool_guard.py", {"tool_name": "Agent", "tool_input": {"subagent_type": "reels-reviewer"}})
        self.assertEqual(r.returncode, 0)
        r = hook("pre_tool_guard.py", {"tool_name": "Write", "tool_input": {"file_path": str(proj / "data" / "hr.json")}})
        self.assertEqual(r.returncode, 2)
        r = hook("pre_tool_guard.py", {"tool_name": "Bash", "tool_input": {"command": "echo {} > data/hr.json"}})
        self.assertEqual(r.returncode, 2)
        # 막힌 호출은 「일 시작」 기록이 남지 않는다(모니터에 일하는 것처럼 안 보이게)
        hook("post_log.py", {"hook_event_name": "PreToolUse", "tool_name": "Agent", "tool_input": {"subagent_type": AGENT}})
        ev = (proj / "data" / "events.jsonl").read_text(encoding="utf-8")
        self.assertNotIn("agent_start", ev)


if __name__ == "__main__":
    unittest.main()
