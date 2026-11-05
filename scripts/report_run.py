"""다른 곳(Cowork 예약 작업·Windows 작업 스케줄러·Claude Code)에서 도는 자동화가 실행 결과를 관리 화면 「자동화 → 예약 작업」에 알린다.

  python scripts/report_run.py <작업 ID> ok "메모"      (상태: ok | error | skipped)
작업 ID 는 관리 화면 「자동화 → 예약 작업」의 각 줄에 보인다(job_xxxxxxxx).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from hub import schedules  # noqa: E402


def main(argv):
    if len(argv) < 3 or argv[2] not in ("ok", "error", "skipped"):
        print(__doc__)
        return 2
    ok = schedules.record(argv[1], argv[2], " ".join(argv[3:]))
    print("기록했습니다" if ok else "없는 작업 ID 입니다")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
