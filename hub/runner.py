"""에이전트 실행기.

실제 실행(Claude Agent SDK, API 키 필요):
  python -m hub.runner --agent reels-maker --account top.pick00 --topic "전세 계약 전 확인" --series 전세
드라이런(에이전트를 부르지 않고 화면·승인 흐름만 시험):
  python -m hub.runner --account top.pick00 --topic "데모" --dry-run ok     (또는 bad)

흐름: 실행 기록 생성 → (에이전트 실행 | 샘플 생성) → package.json 읽기 → 규칙 검수
      → 통과: 승인 대기(awaiting_approval) / 실패: 검수 실패(validation_failed)
"""
import argparse
import asyncio
import json
import os
import sys

from hub import samples, store
from hub.validators import reels_check

ALLOWED_TOOLS = ["Read", "Write", "Bash", "Glob", "Grep", "Skill", "Task", "Agent"]


def load_dotenv():
    env = store.ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def build_prompt(run, out_path):
    p = run["params"]
    skill = "reels-ojeongkkul" if p["account"] == "ojeongkkul" else "reels-main"
    return (
        f"reels-maker 서브에이전트의 역할로 릴스 패키지를 만든다.\n"
        f"- 계정: {p['account']}\n- 시리즈: {p.get('series') or '(없음)'}\n- 유형: {p.get('type', 'general')}\n"
        f"- 주제: {p['topic']}\n"
        f"- 먼저 스킬 {skill} 을 불러오고 docs/hooking-patterns.md 에서 후킹 패턴을 고른다.\n"
        f"- 결과는 {out_path} 에 docs/package-schema.md 스키마의 JSON 으로 저장한다.\n"
        f"- 저장한 뒤 `python -m hub.validators.reels_check {out_path}` 로 검수하고, 오류가 없을 때까지 고친다.\n"
        f"- 커밋·삭제·게시는 하지 않는다. 근거를 모르는 숫자는 쓰지 않고 notes 에 확인 필요로 적는다."
    )


async def run_sdk(run, out_path):
    from claude_agent_sdk import ClaudeAgentOptions, query  # 설치: pip install claude-agent-sdk

    cfg = store.config()
    kwargs = dict(
        cwd=str(store.ROOT),
        setting_sources=["project"],
        allowed_tools=ALLOWED_TOOLS,
        permission_mode="acceptEdits",
        max_turns=cfg.get("max_turns", 40),
        env={"AGENT_HUB_RUN_ID": run["id"], "AGENT_HUB_AGENT": run["agent"]},
    )
    try:
        options = ClaudeAgentOptions(**kwargs)
    except TypeError:  # SDK 버전에 없는 옵션이 있으면 하나씩 뺀다
        kwargs.pop("env", None)
        os.environ["AGENT_HUB_RUN_ID"] = run["id"]
        os.environ["AGENT_HUB_AGENT"] = run["agent"]
        options = ClaudeAgentOptions(**kwargs)

    result = None
    async for msg in query(prompt=build_prompt(run, out_path), options=options):
        if msg.__class__.__name__ == "ResultMessage":
            result = msg
    return result


def run_agent(agent, params, dry_run=None):
    load_dotenv()
    run = store.new_run(agent, params)
    out_dir = store.run_dir(run["id"])
    out_path = out_dir / "package.json"
    rel_out = out_path.relative_to(store.ROOT).as_posix()
    store.log_work(f"실행 시작 {run['id']} · {agent} · {params['account']} · {params['topic']}" + (" (드라이런)" if dry_run else ""))

    try:
        from hub import license
        if not license.allowed():
            store.set_status(run, "error", "평가 기간 종료 — 라이선스 키 필요")
            return run
        # 예산 확인
        usage = store.usage_summary()
        budget = usage.get("budget_usd")
        if not dry_run and budget and usage["total_usd"] >= budget:
            store.set_status(run, "error", f"오늘 예산({budget}달러) 소진")
            return run

        store.set_status(run, "running")
        if dry_run:
            pkg = samples.sample(params["account"], params["topic"], params.get("series", ""), params.get("type", "general"), dry_run)
            store.write_json(out_path, pkg)
        else:
            if not os.environ.get("ANTHROPIC_API_KEY"):
                store.set_status(run, "error", "ANTHROPIC_API_KEY 가 없음(.env 에 설정)")
                return run
            try:
                result = asyncio.run(run_sdk(run, rel_out))
            except ImportError:
                store.set_status(run, "error", "claude-agent-sdk 미설치: pip install claude-agent-sdk")
                return run
            if result is not None:
                run["cost_usd"] = getattr(result, "total_cost_usd", None)
                run["usage"] = getattr(result, "usage", None)
                store.save_run(run)
                if getattr(result, "is_error", False):
                    store.set_status(run, "error", "에이전트가 오류로 끝남")
                    return run

        store.set_status(run, "validating")
        pkg = store.read_json(out_path)
        if pkg is None:
            store.set_status(run, "error", "package.json 이 만들어지지 않음")
            return run
        validation = reels_check.validate(pkg)
        run["validation"] = validation
        store.save_run(run)
        if validation["passed"]:
            store.set_status(run, "awaiting_approval", f"경고 {len(validation['warnings'])}건")
        else:
            store.set_status(run, "validation_failed", f"오류 {len(validation['errors'])}건")
    except Exception as e:  # noqa: BLE001
        store.set_status(run, "error", f"{type(e).__name__}: {e}")
    finally:
        store.log_work(f"실행 종료 {run['id']} · 상태 {store.STATUS_KO.get(run['status'], run['status'])}")
    return run


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--agent", default="reels-maker")
    ap.add_argument("--account", required=True, choices=list(reels_check.ACCOUNTS))
    ap.add_argument("--topic", required=True)
    ap.add_argument("--series", default="")
    ap.add_argument("--type", default="general", choices=["general", "person"])
    ap.add_argument("--dry-run", choices=["ok", "bad"], default=None)
    a = ap.parse_args(argv)
    params = {"account": a.account, "topic": a.topic, "series": a.series, "type": a.type}
    run = run_agent(a.agent, params, a.dry_run)
    print(json.dumps({"id": run["id"], "status": run["status"], "cost_usd": run.get("cost_usd")}, ensure_ascii=False))
    return 0 if run["status"] in ("awaiting_approval", "validation_failed") else 1


if __name__ == "__main__":
    sys.exit(main())
