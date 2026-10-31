"""PreToolUse 훅: 어겨서는 안 되는 규칙을 코드로 막는다.

종료 코드 2 + stderr 메시지 = 도구 실행을 막고 그 메시지를 Claude에게 돌려준다.
막는 것:
  1) git 커밋·푸시 등 (커밋은 사용자가 Cursor에서 직접 한다)
  2) 되돌릴 수 없는 삭제 명령
  3) hub/ 와 .claude/ 수정 (에이전트가 자기 규칙을 바꾸지 못하게)
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import ROOT, log_event, read_input  # noqa: E402

BASH_RULES = [
    (r"\bgit\s+(commit|push|merge|rebase|reset\s+--hard|clean\b)", "git 커밋·푸시는 사용자가 직접 한다. 파일만 수정한다."),
    (r"\bgit\s+add\s+(-A|--all|\.)", "git add 는 하지 않는다(커밋은 사용자가 Cursor에서 한다)."),
    (r"\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*)\b", "삭제 명령(rm -r/-f)은 막혀 있다. 지울 파일은 사용자에게 알린다."),
    (r"\b(rmdir|del|erase)\b\s+.*(/s|/q)", "삭제 명령은 막혀 있다. 지울 파일은 사용자에게 알린다."),
    (r"Remove-Item\b.*-Recurse", "삭제 명령은 막혀 있다. 지울 파일은 사용자에게 알린다."),
    (r"\b(shutil\.rmtree|os\.remove|os\.unlink)\b", "스크립트로 삭제하는 것은 막혀 있다."),
]

PROTECTED_DIRS = ["hub", ".claude"]


def browser_words():
    """hub/rules.json 의 차단·허용 단어. 파일이 없으면 기본값."""
    try:
        with open(ROOT / "hub" / "rules.json", "r", encoding="utf-8") as f:
            r = json.load(f)
        return [w.lower() for w in r.get("browser_block_words", [])], [w.lower() for w in r.get("browser_allow_words", [])]
    except Exception:
        return ["게시", "공유", "제출", "등록", "결제", "삭제", "publish", "submit", "post", "pay", "delete"], ["i agree", "release", "임시저장"]


def web_reader_rules():
    try:
        with open(ROOT / "hub" / "rules.json", "r", encoding="utf-8") as f:
            r = json.load(f)
        return r.get("web_reader_allowed_channels", ["web", "youtube", "github"]), r.get("web_reader_blocked_hosts", [])
    except Exception:
        return ["web", "youtube", "github"], ["instagram.com", "x.com", "twitter.com", "facebook.com"]


AGENT_REACH_CHANNELS = {"bilibili", "v2ex", "github", "youtube", "web", "xiaohongshu", "xueqiu", "boss", "xiaoyuzhou",
                        "linkedin", "reddit", "twitter", "facebook", "instagram", "x"}


def check_agent_reach(cmd):
    """agent-reach 명령에서 허용되지 않은 채널·호스트, 명령줄 키 입력을 막는다."""
    if "agent-reach" not in cmd:
        return
    allowed, hosts = web_reader_rules()
    low = cmd.lower()
    for h in hosts:
        if re.search(r"(?<![a-z0-9-])" + re.escape(h.lower()) + r"(?![a-z0-9-])", low):
            block_tool(f"agent-reach 로 {h} 를 읽지 않는다(수익 계정 보호). 필요하면 사용자가 직접 확인한다.", "Bash", cmd)
    for m in re.finditer(r"agent-reach\s+([a-z0-9_-]+)(?:\s+([a-z0-9_-]+))?(?:\s+(\S+))?", low):
        first, second, third = m.group(1), m.group(2) or "", m.group(3) or ""
        chan = second if first in ("add", "remove") else first
        if first in ("add",) or chan in AGENT_REACH_CHANNELS:
            if chan in AGENT_REACH_CHANNELS and chan not in allowed:
                block_tool(f"agent-reach 「{chan}」 채널은 꺼져 있다(허용: {', '.join(allowed)}). 켜려면 사용자가 hub/rules.json 을 고친다.", "Bash", cmd)
        if first == "configure" and third:
            block_tool("API 키를 명령줄에 쓰지 않는다. 사용자가 터미널에서 agent-reach configure 를 직접 실행한다.", "Bash", cmd)


def check_craft(cmd):
    """photocraft-cli / pdfcraft-cli: 원본 덮어쓰기 방지(--out 필수, 입력과 같으면 차단)."""
    m = re.search(r"\b(photocraft-cli|pdfcraft-cli)\s+(run|batch|merge|edit)\b(.*)", cmd)
    if not m:
        return
    rest = m.group(3)
    out = re.search(r"--out\s+(\"[^\"]+\"|'[^']+'|\S+)", rest)
    if not out:
        block_tool(f"{m.group(1)} {m.group(2)} 에는 --out(결과 폴더)을 꼭 지정한다. 원본은 덮어쓰지 않는다.", "Bash", cmd)
    out_path = out.group(1).strip("\"'")
    ins = re.findall(r"--in\s+(\"[^\"]+\"|'[^']+'|\S+)", rest)
    first = re.match(r"\s*(\"[^\"]+\"|'[^']+'|[^-\s]\S*)", rest)
    candidates = [x.strip("\"'") for x in ins] + ([first.group(1).strip("\"'")] if first else [])
    if any(c and c.rstrip("/\\") == out_path.rstrip("/\\") for c in candidates):
        block_tool("결과(--out)를 원본과 같은 곳에 저장하지 않는다. data/media/out 아래로 저장한다.", "Bash", cmd)


def check_browser_click(tool, tin):
    """Playwright MCP 클릭·제출의 대상 글자에 최종 버튼 단어가 있으면 막는다."""
    if not (tool.startswith("mcp__playwright__") and any(k in tool for k in ("click", "press", "submit", "select_option"))):
        return
    text = " ".join(str(tin.get(k, "")) for k in ("element", "text", "ref", "name", "submit", "key")).lower()
    block, allow = browser_words()
    if any(a in text for a in allow):
        return
    for b in block:
        if b in text:
            block_tool(f"최종 버튼(「{b}」)은 사람이 누른다. 직전 화면에서 멈추고 입력값을 보고할 것.", tool, text)


def block_tool(reason, tool, detail):
    log_event("blocked", tool=tool, reason=reason, detail=detail[:200])
    sys.stderr.write("차단됨: " + reason + "\n")
    sys.exit(2)


block = block_tool


def main():
    data = read_input()
    tool = data.get("tool_name", "")
    tin = data.get("tool_input") or {}

    if tool == "Bash":
        cmd = str(tin.get("command", ""))
        check_agent_reach(cmd)
        check_craft(cmd)
        for pattern, reason in BASH_RULES:
            if re.search(pattern, cmd, re.IGNORECASE):
                block(reason, tool, cmd)
        # 보호 폴더를 셸로 우회해 수정하는 경우
        if re.search(r"(>|>>|\btee\b|\bsed\s+-i\b|\bmv\b|\bcp\b).*(\bhub/|\.claude/)", cmd):
            block("hub/ 와 .claude/ 는 에이전트가 수정할 수 없다.", tool, cmd)

    elif tool in ("Write", "Edit", "NotebookEdit"):
        raw = tin.get("file_path") or tin.get("notebook_path") or ""
        if raw:
            try:
                path = Path(raw).resolve()
                rel = path.relative_to(ROOT)
                if rel.parts and rel.parts[0] in PROTECTED_DIRS:
                    block("hub/ 와 .claude/ 는 에이전트가 수정할 수 없다: " + str(rel), tool, raw)
            except ValueError:
                pass  # 프로젝트 밖 경로는 여기서 판단하지 않는다

    else:
        check_browser_click(tool, tin)
    sys.exit(0)


if __name__ == "__main__":
    main()
