"""훅 공용 함수. 외부 패키지 없이 동작한다."""
import json
import os
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(os.environ.get("CLAUDE_PROJECT_DIR") or Path(__file__).resolve().parents[2]).resolve()
EVENTS = ROOT / "data" / "events.jsonl"


def read_input():
    try:
        return json.load(sys.stdin)
    except Exception:
        return {}


def log_event(kind, **fields):
    if os.environ.get("AGENT_HUB_NO_LOG"):  # 단위 시험에서는 기록하지 않는다
        return
    try:
        EVENTS.parent.mkdir(parents=True, exist_ok=True)
        rec = {
            "ts": datetime.now().astimezone().isoformat(timespec="seconds"),
            "kind": kind,
            "run": os.environ.get("AGENT_HUB_RUN_ID", ""),
            "agent": os.environ.get("AGENT_HUB_AGENT", ""),
        }
        rec.update(fields)
        with open(EVENTS, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    except Exception:
        pass  # 로그 실패가 작업을 막으면 안 된다
