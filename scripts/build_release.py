"""판매 묶음 만들기.

  python scripts/build_release.py                 → dist/AgentHub-Runner-<버전>.zip, dist/AgentHub-Console-<버전>.zip
  python scripts/build_release.py --allow-no-key  → 공개키 없이(시험용, 판매 금지)

실행기 묶음(고객 PC에 설치)
- 코어(hub/), 도구(tools/), 고객 설명서(docs/customer), 설치·실행 스크립트
- .claude/ 는 도구 폴더의 에이전트·스킬로 새로 만든다(판매자 개인 에이전트·스킬은 안 들어감)
- 판매자 개인 데이터(data/, .env, hub/agents.json, 작업 기록, 벤치마킹 문서)는 넣지 않는다
- 넣기 전에 개인 정보 글자(계정 ID·회사명 등)를 검사해 하나라도 있으면 멈춘다
콘솔 묶음(판매자 서버에 배포): cloud/ + hub/ed25519.py + Dockerfile
"""
import argparse
import io
import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from hub.version import VERSION  # noqa: E402

# 판매본에 들어가면 안 되는 글자(판매자 개인 정보). 찾으면 묶음을 만들지 않는다.
PRIVATE = ["top.pick", "오정꿀", "ojeongkkul", "우히히시", "(주)제때", "제때 AI", "송전탑", "ourfrequency", "말랑팡", "C:\\dev\\agent", "E:\\dev", "C_temp_archive",
           "카카오 이모티콘\\", "jette", "kk00701903"]
SKIP_DIRS = {"__pycache__", ".git", "data", "dist", "node_modules"}
RUNNER_FILES = ["hub", "tools", "docs/customer", "requirements.txt", ".env.example", ".mcp.json", "THIRD_PARTY_NOTICES.md", "LICENSE.txt",
                "run.bat", "autostart-on.bat", "autostart-off.bat", "docs/browser-setup.md", "docs/web-reader-setup.md", "docs/craft-tools-setup.md", "docs/alt-models.md"]
RUNNER_EXCLUDE = {"hub/agents.json", "hub/static/office-worker-ref.png", "hub/static/office-room.png", "hub/static/office-room-fg.png", "hub/static/office-room-v2.png", "hub/static/office-room-v3.png", "hub/static/office-room-v3-fg.png", "hub/static/office-room-v4.png", "hub/validators/__pycache__"}
HOOK_FILES = [".claude/hooks/_common.py", ".claude/hooks/pre_tool_guard.py", ".claude/hooks/post_log.py", ".claude/settings.json"]


# 판매자 운영 문서를 판매본으로 바꿀 때 고칠 글자(파일별)
PRODUCT_EDITS = {
    "docs/browser-setup.md": [("로그인할 계정: 인스타 top.pick00·top.pick01·오정꿀, 문피아(최종추천), LINE 크리에이터스, 카카오 이모티콘 스튜디오, OGQ, 마플샵, 레드버블, 앱인토스 콘솔.",
                               "로그인할 계정: 일에 쓰는 작업 계정(인스타그램·연재처·판매처 등)만."),
                              ("E:\\chrome-agent-profile", "C:\\AgentHub\\chrome-profile")],
    "docs/web-reader-setup.md": [("작업용 크롬 프로필(E:\\chrome-agent-profile)에는 top.pick00·top.pick01·오정꿀 같은 수익 계정이 로그인돼 있다.",
                                  "작업용 크롬 프로필에는 수익 계정이 로그인돼 있을 수 있다.")],
}


def walk(rel):
    p = ROOT / rel
    if p.is_file():
        yield rel
        return
    for f in sorted(p.rglob("*")):
        if f.is_file() and not (set(f.relative_to(ROOT).parts) & SKIP_DIRS) and f.suffix not in (".pyc", ".tmp"):
            yield f.relative_to(ROOT).as_posix()


def product_config():
    c = json.loads((ROOT / "hub/config.json").read_text(encoding="utf-8"))
    c["branding"]["customer_name"] = ""
    c.pop("allow_legacy_license", None)
    c["agent_budgets_usd"] = {"reels-maker": 3.0}
    return json.dumps(c, ensure_ascii=False, indent=2) + "\n"


def product_env():
    t = (ROOT / ".env.example").read_text(encoding="utf-8")
    t = t.replace("# 라이선스 키(평가 30일 뒤 필요). 설정 탭에서 입력해도 됨\nHUB_LICENSE_KEY=\n",
                  "# 이용권은 웹 콘솔 연결로 자동으로 들어옵니다(관리 화면 → 설정 → 웹 콘솔 연결).\n")
    return t


def install_bat():
    t = (ROOT / "install.bat").read_text(encoding="utf-8")
    return "\n".join(l for l in t.splitlines() if "unittest" not in l) + "\n"


def claude_dir():
    """도구 폴더의 에이전트·스킬로 고객용 .claude/ 를 만든다."""
    out = {}
    for f in HOOK_FILES:
        out[f] = (ROOT / f).read_bytes()
    for a in sorted((ROOT / "tools").glob("*/agents/*.md")):
        out[f".claude/agents/{a.name}"] = a.read_bytes()
    for s in sorted((ROOT / "tools").glob("*/skills/*/SKILL.md")):
        out[f".claude/skills/{s.parent.name}/SKILL.md"] = s.read_bytes()
    return out


def scan(name, data):
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return []
    return [p for p in PRIVATE if p in text]


def build_runner(allow_no_key):
    pub = ROOT / "hub/keys/vendor.pub"
    if not pub.exists() and not allow_no_key:
        raise SystemExit("hub/keys/vendor.pub 가 없습니다. 판매자 PC에서 python -m cloud.keys new --write-pub 로 만드세요.")
    files = {}
    for rel in RUNNER_FILES:
        if not (ROOT / rel).exists():
            continue
        for f in walk(rel):
            if f in RUNNER_EXCLUDE or any(f.startswith(x + "/") for x in RUNNER_EXCLUDE):
                continue
            data = (ROOT / f).read_bytes()
            for old, new in PRODUCT_EDITS.get(f, []):
                data = data.decode("utf-8").replace(old, new).encode("utf-8")
            files[f] = data
    files["hub/config.json"] = product_config().encode("utf-8")
    files[".env.example"] = product_env().encode("utf-8")
    files["install.bat"] = install_bat().encode("utf-8")
    files["CLAUDE.md"] = (ROOT / "docs/customer/CLAUDE.product.md").read_bytes()
    files["README.md"] = (ROOT / "docs/customer/README.product.md").read_bytes()
    files.pop("docs/customer/CLAUDE.product.md", None)
    files.pop("docs/customer/README.product.md", None)
    files.update(claude_dir())
    bad = {f: hits for f, d in files.items() if (hits := scan(f, d))}
    if bad:
        for f, hits in bad.items():
            print(f"  개인 정보 글자 발견: {f}: {', '.join(hits)}")
        raise SystemExit("판매본에 개인 정보가 들어 있어 멈췄습니다. 위 파일을 고치세요.")
    return files


def build_console():
    files = {}
    for rel in ["cloud"]:
        for f in walk(rel):
            if "/data/" in f or f.endswith(".db"):
                continue
            files[f] = (ROOT / f).read_bytes()
    for f in ["hub/__init__.py", "hub/ed25519.py", "docs/cloud-deploy.md"]:
        files[f] = (ROOT / f).read_bytes()
    files["Dockerfile"] = (ROOT / "cloud/Dockerfile").read_bytes()
    return files


def write_zip(path, files, top):
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for f, data in sorted(files.items()):
            z.writestr(f"{top}/{f}", data)
    return path


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--allow-no-key", action="store_true", help="공개키 없이 만들기(시험용, 판매 금지)")
    ap.add_argument("--out", default=str(ROOT / "dist"))
    a = ap.parse_args(argv)
    out = Path(a.out)
    r = write_zip(out / f"AgentHub-Runner-{VERSION}.zip", build_runner(a.allow_no_key), f"AgentHub-{VERSION}")
    c = write_zip(out / f"AgentHub-Console-{VERSION}.zip", build_console(), f"AgentHub-Console-{VERSION}")
    for p in (r, c):
        print(f"{p.name}  {p.stat().st_size / 1024:.0f}KB  파일 {len(zipfile.ZipFile(p).namelist())}개")
    return 0


if __name__ == "__main__":
    sys.exit(main())
