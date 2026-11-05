"""예약 작업(자동화) 시험: cron 해석·다음 실행·저장 검증·실행 기록.

python -m unittest discover -s tests
"""
import os
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

os.environ["AGENT_HUB_NO_LOG"] = "1"
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from hub import schedules  # noqa: E402


class ScheduleTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._file = schedules.FILE
        schedules.FILE = Path(self.tmp.name) / "schedules.json"

    def tearDown(self):
        schedules.FILE = self._file
        self.tmp.cleanup()

    def test_human_and_next(self):
        self.assertEqual(schedules.human("30 8 * * *"), "매일 08:30")
        self.assertEqual(schedules.human("0 9 * * 1-5"), "평일 09:00")
        self.assertEqual(schedules.human("0 */3 * * *"), "3시간마다 00분")
        self.assertEqual(schedules.human("15 * * * *"), "매시간 15분")
        self.assertEqual(schedules.human("0 22 * * 1,3,5"), "매주 월수금 22:00")
        base = datetime(2026, 11, 6, 9, 0)   # 금 09:00
        self.assertEqual(schedules.next_run("0 9 * * 1-5", base), datetime(2026, 11, 9, 9, 0))
        self.assertIsNone(schedules.next_run("bad"))

    def test_save_validate_record(self):
        with self.assertRaises(ValueError):
            schedules.save_job({"name": "", "cron": "0 9 * * *", "where": "cowork"})
        with self.assertRaises(ValueError):
            schedules.save_job({"name": "x", "cron": "0 25 * * *", "where": "cowork"})
        j = schedules.save_job({"name": "매일 릴스 조사", "area": "insta", "where": "cowork", "cron": "0 8 * * *"})
        self.assertTrue(j["id"].startswith("job_"))
        self.assertTrue(schedules.record(j["id"], "ok", "3개 주제"))
        got = schedules.jobs()[0]
        self.assertEqual(got["last_status"], "ok")
        self.assertEqual(got["when"], "매일 08:00")
        self.assertEqual(schedules.run_now(j["id"])[0], False)   # 바깥 자동화는 여기서 안 돌림
        self.assertTrue(schedules.delete_job(j["id"]))
        self.assertEqual(schedules.jobs(), [])


if __name__ == "__main__":
    unittest.main()
