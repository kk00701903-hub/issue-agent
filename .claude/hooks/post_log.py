"""도구 사용·에이전트 시작/끝을 data/events.jsonl 에 남긴다(관리 화면 로그·모니터 「사무실」에 표시).

같은 파일을 여러 훅에서 부른다(hook_event_name 으로 구분).
- PostToolUse: 도구 사용 1건(kind=tool). 서브에이전트 안에서 쓴 도구면 agent 에 그 에이전트 이름.
- PreToolUse(Agent|Task): 서브에이전트에게 일을 맡김(kind=agent_start, agent=맡은 에이전트, detail=맡긴 일).
- PostToolUse(Agent|Task): 맡긴 일이 끝남(kind=agent_stop).
- UserPromptSubmit / Stop: 본 세션(총괄)이 일을 시작함 / 답을 마침(kind=turn_start / turn_end). 입력한 글은 남기지 않는다.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import log_event, read_input  # noqa: E402

AGENT_TOOLS = ("Agent", "Task")


def summarize(tool, tin):
    if tool == "Bash":
        return str(tin.get("command", ""))[:160]
    if tool in AGENT_TOOLS:
        return str(tin.get("description") or tin.get("prompt") or "")[:80]
    for key in ("file_path", "notebook_path", "pattern", "path", "skill", "url", "query"):
        if tin.get(key):
            return str(tin[key])[:160]
    return ""


def who(data):
    """도구를 쓴 쪽: 러너가 띄운 에이전트 > 서브에이전트(agent_type) > 본 세션("")."""
    return os.environ.get("AGENT_HUB_AGENT") or str(data.get("agent_type") or "")


def main():
    data = read_input()
    ev = data.get("hook_event_name", "PostToolUse")
    sid = str(data.get("session_id", ""))[:12]
    tool = data.get("tool_name", "")
    tin = data.get("tool_input") or {}
    if ev == "UserPromptSubmit":
        log_event("turn_start", agent=who(data), session=sid)
    elif ev == "Stop":
        log_event("turn_end", agent=who(data), session=sid)
    elif ev == "PreToolUse" and tool in AGENT_TOOLS:
        from pre_tool_guard import hr_block_reason   # 인사로 막힌 호출은 「일 시작」으로 남기지 않는다(막힌 기록은 가드 훅이 남김)
        if hr_block_reason(str(tin.get("subagent_type") or "")):
            sys.exit(0)
        log_event("agent_start", agent=str(tin.get("subagent_type") or "general-purpose"), by=who(data),
                  task=str(data.get("tool_use_id", "")), session=sid, detail=summarize(tool, tin))
    elif ev == "PostToolUse" and tool in AGENT_TOOLS:
        log_event("agent_stop", agent=str(tin.get("subagent_type") or "general-purpose"), by=who(data),
                  task=str(data.get("tool_use_id", "")), session=sid, detail=summarize(tool, tin))
    elif ev == "PostToolUse":
        fields = dict(tool=tool, detail=summarize(tool, tin), session=sid)
        a = who(data)
        if a:
            fields["agent"] = a
        log_event("tool", **fields)
    sys.exit(0)


if __name__ == "__main__":
    main()
