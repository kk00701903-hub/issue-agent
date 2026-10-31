"""PostToolUse 훅: 도구 사용 내역을 data/events.jsonl 에 남긴다(관리 화면 로그에 표시)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import log_event, read_input  # noqa: E402


def summarize(tool, tin):
    if tool == "Bash":
        return str(tin.get("command", ""))[:160]
    for key in ("file_path", "notebook_path", "pattern", "path", "skill"):
        if tin.get(key):
            return str(tin[key])[:160]
    return ""


def main():
    data = read_input()
    tool = data.get("tool_name", "")
    log_event("tool", tool=tool, detail=summarize(tool, data.get("tool_input") or {}))
    sys.exit(0)


if __name__ == "__main__":
    main()
