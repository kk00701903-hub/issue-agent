"""에이전트 실행기 — 도구(tools/<id>)에 연결된 에이전트를 돌린다.

실제 실행(Claude Agent SDK, API 키 필요):
  python -m hub.runner --tool instagram --account <계정 ID> --topic "주제" [--series 시리즈]
  python -m hub.runner --tool webnovel --work "작품" --topic "12화 초고"
드라이런(에이전트를 부르지 않고 화면·승인 흐름만 시험):
  python -m hub.runner --tool instagram --account <계정 ID> --topic "데모" --dry-run ok     (또는 bad)

흐름: 실행 기록 생성 → 도구 확인(켜짐·이용권·에이전트 연결) → (에이전트 실행 | 샘플 생성)
      → 결과 파일 읽기 → 도구 검수기(없으면 문서 기본 검수)
      → 통과: 승인 대기(awaiting_approval) / 실패: 검수 실패(validation_failed)
"""
import argparse
import asyncio
import json
import os
import sys

from hub import hr, store, toolkit

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
    base = toolkit.build_prompt(run.get("tool") or "instagram", run["agent"], run["params"], out_path)
    notes = "\n\n".join(x for x in (hr.prompt_notes(run["agent"]),   # 사규 위반 기록(주의·견책 이상)
                                    hr.work_notes(run["agent"], run.get("tool") or "instagram")) if x)   # 반려 이유·자주 걸리는 실수·기준 예시
    return (notes + "\n\n" + base) if notes else base


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


def _sample_output(tool, params, scenario):
    """드라이런 결과: 인스타그램은 데모 패키지, 그 밖의 도구는 데모 문서."""
    if tool == "instagram":
        from tools.instagram.samples import sample
        prof = toolkit.account(tool, params.get("account")) or {}
        return sample(params.get("account"), params.get("topic", ""), params.get("series", ""), params.get("type", "general"),
                      scenario, profile=prof, rules=toolkit.rules(tool))
    if tool == "kmong":
        from tools.kmong.samples import sample as ksample
        return ksample(params.get("topic", ""), params.get("kind", "service"), params.get("category", ""), scenario)
    m = toolkit.manifest(tool) or {}
    if scenario == "bad":
        return ""
    return (f"(데모) {m.get('name', tool)} 결과 — {params.get('topic', '')}\n\n"
            "이 문서는 드라이런으로 만든 데모입니다. 실제 에이전트를 부르지 않았고 비용이 들지 않았습니다.\n\n"
            "## 결과\n- 요청을 받아 할 일을 나눴습니다.\n- 실제 실행에서는 여기에 결과가 들어갑니다.\n\n## 확인 필요\n- 없음(데모)\n")


def run_agent(agent, params, dry_run=None, tool=None):
    load_dotenv()
    tool = tool or params.get("tool") or toolkit.tool_of_agent(agent) or "instagram"
    params = {k: v for k, v in params.items() if k != "tool"}
    spec = toolkit.run_spec(tool)
    agent = agent or spec.get("agent")
    run = store.new_run(agent, params)
    run["tool"] = tool
    store.save_run(run)
    out_name = spec.get("output", "result.md")
    out_dir = store.run_dir(run["id"])
    out_path = out_dir / out_name
    rel_out = out_path.relative_to(store.ROOT).as_posix()
    label = params.get("account") or params.get("work") or tool
    store.log_work(f"실행 시작 {run['id']} · {tool} · {agent} · {label} · {params.get('topic', '')}" + (" (드라이런)" if dry_run else ""))

    try:
        from hub import license
        if not license.allowed():
            store.set_status(run, "error", "이용권 만료 — 웹 콘솔에서 요금제를 확인하세요")
            return run
        ok, why = toolkit.check_run(tool, agent)
        if not ok:
            store.set_status(run, "error", why)
            return run
        ok, why = hr.can_work(agent)   # 인사: 근무 시프트·정직·해고
        if not ok:
            store.set_status(run, "error", why)
            return run
        if tool == "instagram" and not toolkit.account(tool, params.get("account")):
            store.set_status(run, "error", f"등록되지 않은 계정: {params.get('account')!r}(도구 → 인스타그램 → 계정)")
            return run
        # 예산 확인
        usage = store.usage_summary()
        budget = usage.get("budget_usd")
        if not dry_run and budget and usage["total_usd"] >= budget:
            store.set_status(run, "error", f"오늘 예산({budget}달러) 소진")
            return run
        # 에이전트별 하루 한도(「직원별 예산」): 한 에이전트가 전체 예산을 다 쓰지 않게
        ab = (usage.get("agent_budgets_usd") or {}).get(agent)
        if ab:
            ab = round(ab * hr.budget_factor(agent), 2)   # 감봉이면 절반
        spent = (usage.get("per_agent", {}).get(agent) or {}).get("cost_usd", 0.0)
        if not dry_run and ab and spent >= ab:
            store.set_status(run, "error", f"{agent} 오늘 한도({ab}달러) 소진")
            return run

        store.set_status(run, "running")
        if dry_run:
            out = _sample_output(tool, params, dry_run)
            if isinstance(out, dict):
                store.write_json(out_path, out)
            else:
                out_dir.mkdir(parents=True, exist_ok=True)
                out_path.write_text(out, encoding="utf-8")
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
        if out_name.endswith(".json"):
            pkg = store.read_json(out_path)
            if pkg is None:
                store.set_status(run, "error", f"{out_name} 이 만들어지지 않음")
                return run
            check = toolkit.validator(tool)
            validation = check(pkg) if check else {"passed": True, "errors": [], "warnings": [], "stats": {}}
        else:
            if not out_path.exists():
                store.set_status(run, "error", f"{out_name} 이 만들어지지 않음")
                return run
            text = out_path.read_text(encoding="utf-8")
            check = toolkit.validator(tool)
            validation = check(text) if check else toolkit.validate_document(text)
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
    ap.add_argument("--tool", default="instagram", help="도구 ID(tools/ 폴더 이름)")
    ap.add_argument("--agent", default="", help="비우면 도구의 기본 에이전트")
    ap.add_argument("--topic", required=True)
    ap.add_argument("--account", default="", help="인스타그램: 도구 설정에 등록한 계정 ID")
    ap.add_argument("--series", default="")
    ap.add_argument("--type", default="general", choices=["general", "person"])
    ap.add_argument("--work", default="", help="웹소설: 작품")
    ap.add_argument("--details", default="")
    ap.add_argument("--param", action="append", default=[], help="그 밖의 입력칸 key=value")
    ap.add_argument("--dry-run", choices=["ok", "bad"], default=None)
    a = ap.parse_args(argv)
    if not toolkit.manifest(a.tool):
        ap.error(f"없는 도구: {a.tool} (있는 도구: {', '.join(toolkit.manifests())})")
    if a.tool == "instagram":
        ids = [x["id"] for x in toolkit.accounts("instagram")]
        if a.account not in ids:
            ap.error(f"--account 는 {', '.join(ids) or '(등록된 계정 없음)'} 중 하나")
        params = {"account": a.account, "topic": a.topic, "series": a.series, "type": a.type}
    else:
        params = {"topic": a.topic, "details": a.details}
        if a.work:
            params["work"] = a.work
    for kv in a.param:
        k, _, v = kv.partition("=")
        if k:
            params[k.strip()] = v
    run = run_agent(a.agent or toolkit.run_spec(a.tool).get("agent"), params, a.dry_run, tool=a.tool)
    print(json.dumps({"id": run["id"], "tool": run.get("tool"), "status": run["status"], "cost_usd": run.get("cost_usd")}, ensure_ascii=False))
    return 0 if run["status"] in ("awaiting_approval", "validation_failed") else 1


if __name__ == "__main__":
    sys.exit(main())
