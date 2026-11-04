"""시험: python -m unittest discover -s tests -v  (프로젝트 폴더에서 실행)"""
import copy
import json
import subprocess
import sys
import os
import unittest

os.environ["AGENT_HUB_NO_LOG"] = "1"  # 시험이 작업 기록·이벤트를 남기지 않게
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from tools.instagram import samples  # noqa: E402
from tools.instagram.validator import validate as _validate  # noqa: E402

# 시험용 작업공간: 판매자 본인 설정과 같은 모양(음성 계정 2 + 무음 계정 1, 금지곡·시리즈 로테이션)
_BASE = {k: v for k, v in json.loads((ROOT / "tools" / "instagram" / "rules.json").read_text(encoding="utf-8")).items() if not k.startswith("_")}
RULES = {**_BASE, "banned_bgm": ["M1", "M3", "M6"], "world_series_prefix": "세계의", "world_rotation": ["M1", "M3", "M6"], "voice_name": "ko-KR-SunHiNeural"}
ACCS = {"top.pick00": {"id": "top.pick00", "label": "본계정", "profile": "voice", "person_intro": False},
        "top.pick01": {"id": "top.pick01", "label": "top.pick01", "profile": "voice", "person_intro": True},
        "ojeongkkul": {"id": "ojeongkkul", "label": "오정꿀", "profile": "silent", "person_intro": False}}


def validate(pkg, rules=None, state=None):
    return _validate(pkg, rules=rules or RULES, bgm_state=state if state is not None else {}, accounts_map=ACCS)


def rules_of(res):
    return {e["rule"] for e in res["errors"]}


class ValidatorTests(unittest.TestCase):
    def ok(self, **kw):
        acct = kw.pop("account", "top.pick00")
        return samples.sample(acct, "시험", profile=ACCS[acct], rules=RULES, **kw)

    def test_ok_passes(self):
        for acct in ("top.pick00", "top.pick01", "ojeongkkul"):
            res = validate(self.ok(account=acct), RULES, {})
            self.assertTrue(res["passed"], (acct, res["errors"]))

    def test_bad_sample_fails_with_expected_rules(self):
        res = validate(samples.sample("top.pick00", "시험", scenario="bad", profile=ACCS["top.pick00"], rules=RULES), RULES, {})
        self.assertFalse(res["passed"])
        self.assertTrue({"bgm_missing", "caption_link", "scene_speed", "voice_order_mark", "required"} <= rules_of(res))
        self.assertIn("hook_form", {w["rule"] for w in res["warnings"]})

    def test_banned_bgm_blocked_but_world_series_allowed(self):
        p = self.ok()
        p["bgm"]["id"] = "M3"
        self.assertIn("bgm_banned", rules_of(validate(p, RULES, {})))
        w = self.ok(series="세계의 지도자")
        w["bgm"]["id"] = "M1"
        self.assertTrue(validate(w, RULES, {})["passed"])

    def test_world_rotation_order(self):
        w = self.ok(series="세계의 지도자")
        w["bgm"]["id"] = "M3"
        state = {"top.pick00:world": "M1"}
        self.assertTrue(validate(w, RULES, state)["passed"])  # M1 다음은 M3
        w["bgm"]["id"] = "M6"
        self.assertIn("bgm_rotation", rules_of(validate(w, RULES, state)))  # M1 다음에 M6 은 어긋남

    def test_same_bgm_twice_rejected(self):
        p = self.ok()
        self.assertIn("bgm_repeat", rules_of(validate(p, RULES, {"top.pick00:general": "M2"})))

    def test_voice_must_be_female_edge_tts(self):
        p = self.ok()
        p["voice"]["name"] = "ko-KR-InJoonNeural"
        self.assertIn("voice_name", rules_of(validate(p, RULES, {})))

    def test_ojeongkkul_has_no_voice_and_free_music(self):
        p = self.ok(account="ojeongkkul")
        p["voice"] = {"engine": "edge-tts", "name": "ko-KR-SunHiNeural"}
        p["bgm"] = {"id": "M2", "source": "local"}
        self.assertTrue({"voice_none", "bgm_source", "bgm_local"} <= rules_of(validate(p, RULES, {})))

    def test_person_reel_needs_leader_intro(self):
        p = self.ok(account="top.pick01", ptype="person")
        del p["leader_intro"]
        self.assertIn("leader_intro", rules_of(validate(p, RULES, {})))

    def test_slow_scene_ok_fast_scene_rejected(self):
        p = self.ok()
        p["scenes"][0]["seconds"] = 1.0
        self.assertIn("scene_speed", rules_of(validate(p, RULES, {})))

    def test_hashtag_cap_warning(self):
        pkg = self.ok()
        pkg["caption"] = "전세 계약 전 꼭 보세요 " + " ".join(f"#태그{i}" for i in range(6))
        res = validate(pkg, RULES, {})
        self.assertIn("caption_hashtags", {w["rule"] for w in res["warnings"]})
        pkg["caption"] = "전세 계약 전 꼭 보세요 #전세 #보증금"
        self.assertNotIn("caption_hashtags", {w["rule"] for w in validate(pkg, RULES, {})["warnings"]})

    def test_no_max_length_limit(self):
        p = self.ok()
        p["scenes"] = copy.deepcopy(p["scenes"]) * 6  # 30초를 넘겨도 된다
        self.assertGreater(validate(p, RULES, {})["stats"]["total_seconds"], 30)
        self.assertTrue(validate(p, RULES, {})["passed"])


class FlowAndLicenseTests(unittest.TestCase):
    def test_plan_clean_keeps_only_valid_items(self):
        from hub import plans
        self.assertTrue(plans.valid("2026-11", "top.pick00"))
        self.assertFalse(plans.valid("2026-13", "top.pick00"))
        self.assertFalse(plans.valid("2026-11", "../etc"))
        body = {"level": "보통", "topics": ["전세", " "], "types": ["비교"],
                "items": [{"date": "2026-11-03", "time": "10:00", "topic": "전세", "type": "비교", "title": "t"},
                          {"date": "2026-12-01", "topic": "다른 달"}, {"date": "2026-11-02", "time": "bad"}, "x"]}
        c = plans.clean("2026-11", "top.pick00", body)
        self.assertEqual(c["per_week"], 5)
        self.assertEqual(c["topics"], ["전세"])
        self.assertEqual([i["date"] for i in c["items"]], ["2026-11-02", "2026-11-03"])
        self.assertEqual(c["items"][0]["time"], "19:00")

    def test_model_routes_and_data_guard(self):
        from hub import models, store
        from unittest import mock
        cfg = {"model_routes": {"flow": {"provider": "deepseek"}, "novel": {"provider": "deepseek"}, "trend": {"provider": "nope"}}}
        with mock.patch.object(store, "config", return_value=cfg):
            self.assertEqual(models.route("flow")[0], "deepseek")           # 공개 자료 작업은 외부 모델 허용
            self.assertEqual(models.route("novel")[0], "anthropic")         # 원고는 외부 무료 모델로 못 보냄
            self.assertEqual(models.route("trend")[0], "anthropic")         # 없는 제공자는 기본으로
            self.assertEqual(models.route("flow")[2], "deepseek-chat")
        with mock.patch.object(store, "config", return_value={"flow_model": "claude-x"}):
            self.assertEqual(models.route("flow")[2], "claude-x")           # 예전 flow_model 설정도 그대로
        # OpenAI 호환 응답을 Anthropic 식 사용량으로 맞추는지
        class R:
            def __init__(self, b): self.b = b
            def read(self): return self.b
            def __enter__(self): return self
            def __exit__(self, *a): return False
        fake = json.dumps({"choices": [{"message": {"content": "{\"nodes\":[]}"}}], "usage": {"prompt_tokens": 3, "completion_tokens": 5}}).encode()
        with mock.patch.object(store, "config", return_value={"model_routes": {"flow": {"provider": "deepseek"}}}), \
             mock.patch.dict(os.environ, {"DEEPSEEK_API_KEY": "k"}), \
             mock.patch("urllib.request.urlopen", return_value=R(fake)) as uo:
            text, usage, meta = models.complete("flow", "s", "p")
            self.assertEqual(usage, {"input_tokens": 3, "output_tokens": 5})
            self.assertEqual(meta["provider"], "deepseek")
            self.assertIn("api.deepseek.com", uo.call_args[0][0].full_url)

    def test_local_provider_and_agent_budget(self):
        from hub import models, store, runner
        from unittest import mock
        with mock.patch.object(store, "config", return_value={"model_routes": {"novel": {"provider": "local"}}}):
            self.assertEqual(models.route("novel")[0], "local")             # 내 PC 모델은 원고도 허용
        bad = {"model_routes": {"novel": {"provider": "local"}}, "providers": {"local": {"base_url": "http://evil.example/v1"}}}
        with mock.patch.object(store, "config", return_value=bad):
            with self.assertRaises(RuntimeError):
                models.complete("novel", "s", "p")                          # 바깥 주소는 local 로 못 씀
        usage = {"total_usd": 1.0, "budget_usd": 5.0, "agent_budgets_usd": {"reels-maker": 1.0},
                 "per_agent": {"reels-maker": {"runs": 3, "cost_usd": 1.2}}}
        with mock.patch.object(store, "usage_summary", return_value=usage), \
             mock.patch.object(store, "set_status") as ss, mock.patch.object(store, "save_run"), \
             mock.patch.object(store, "new_run", return_value={"id": "t", "history": [], "agent": "reels-maker", "params": {}}, create=True), \
             mock.patch("hub.license.allowed", return_value=True):
            try:
                runner.run_agent("reels-maker", {"account": "top.pick00", "topic": "t"}, None)
            except Exception:
                pass
            msgs = " ".join(str(c.args[2]) if len(c.args) > 2 else "" for c in ss.call_args_list)
            self.assertIn("한도", msgs)

    def test_model_fallback_only_for_public(self):
        from hub import models, store
        from unittest import mock
        cfg = {"model_fallback": ["deepseek"]}
        calls = []
        def fake(task, system, prompt, max_tokens, alt=None):
            calls.append(alt)
            if alt is None:
                raise RuntimeError("claude down")
            return models._complete_once.__wrapped__(task, system, prompt, max_tokens, alt) if hasattr(models._complete_once, "__wrapped__") else ("ok", {}, {"provider": alt})
        with mock.patch.object(store, "config", return_value=cfg), mock.patch.object(models, "_complete_once", side_effect=fake):
            self.assertEqual(models.complete("flow", "s", "p")[2]["provider"], "deepseek")
        with mock.patch.object(store, "config", return_value=cfg), mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(RuntimeError) as cm:
                models.complete("novel", "s", "p")   # 원고는 외부 모델로 대체 안 함
            self.assertIn("비공개", str(cm.exception))

    def test_flow_clean_and_order(self):
        from hub import flows
        raw = {"nodes": [{"id": "b", "label": "둘", "who": "x", "kind": "agent", "x": 300, "y": 10},
                         {"id": "a", "label": "하나", "who": "y", "kind": "bogus", "x": 10, "y": 10},
                         {"id": "a", "label": "중복"}],
               "edges": [{"from": "a", "to": "b"}, {"from": "a", "to": "zzz"}, {"from": "b", "to": "b"}]}
        c = flows._clean(raw)
        self.assertEqual([n["id"] for n in c["nodes"]], ["b", "a"])
        self.assertEqual(c["nodes"][1]["kind"], "agent")
        self.assertEqual(c["edges"], [{"from": "a", "to": "b"}])
        self.assertEqual([n["label"] for n in flows.ordered(c)], ["하나", "둘"])

    def test_generate_local_fallback_enforces_human_end(self):
        from hub import flows
        def no_key(*a, **k):
            raise RuntimeError("ANTHROPIC_API_KEY 없음")
        f, info = flows.generate("reels", "전세 뉴스로 주제 조사 → 릴스 패키지 제작 → 규칙 검수 → 예약 화면 채우기", call=no_key)
        self.assertEqual(info["source"], "local")
        kinds = [n["kind"] for n in flows.ordered(f)]
        self.assertIn("human", kinds)
        browser = [n for n in f["nodes"] if n["kind"] == "browser"]
        for b in browser:  # 크롬 통제 뒤에는 사람
            nxt = [e["to"] for e in f["edges"] if e["from"] == b["id"]]
            self.assertTrue(any(next(n for n in f["nodes"] if n["id"] == t)["kind"] == "human" for t in nxt))

    def test_generate_ai_path_parses_and_cleans(self):
        from hub import flows
        def fake(system, prompt, model):
            self.assertIn("reels-maker", system)
            return ('설명 없이: {"nodes":[{"id":"n1","label":"제작","who":"reels-maker","kind":"agent"},'
                    '{"id":"n2","label":"예약 채우기","who":"insta-scheduler","kind":"browser"},'
                    '{"id":"n3","label":"이상한","who":"x","kind":"weird"}],'
                    '"edges":[{"from":"n1","to":"n2"},{"from":"n2","to":"n9"}]}', {"input_tokens": 10})
        f, info = flows.generate("reels", "릴스 만들고 예약까지", call=fake)
        self.assertEqual(info["source"], "ai")
        self.assertEqual(next(n for n in f["nodes"] if n["id"] == "n3")["kind"], "agent")  # 모르는 종류 → agent
        self.assertTrue(any(n["kind"] == "human" for n in f["nodes"]))  # 사람 단계 자동 추가
        self.assertFalse(any(e["to"] == "n9" for e in f["edges"]))  # 없는 노드로 가는 선 제거

    def test_license_issue_and_parse(self):
        from hub import license as lic
        key = lic.issue("고객사A", lic.LEGACY_SECRET, days=10)  # 옛 키(판매자 본인 PC 전용)
        self.assertTrue(key.startswith("AH1-"))
        self.assertIsNotNone(lic.parse(key, "고객사A"))
        self.assertIsNone(lic.parse(key, "고객사B"))
        self.assertIsNone(lic.parse("AH1-20990101-WRONG", "고객사A"))


def run_hook(payload):
    return subprocess.run(
        [sys.executable, str(ROOT / ".claude" / "hooks" / "pre_tool_guard.py")],
        input=json.dumps(payload), capture_output=True, text=True,
        env={"CLAUDE_PROJECT_DIR": str(ROOT), "AGENT_HUB_NO_LOG": "1", "PATH": "/usr/bin:/bin"},
    )


class HookTests(unittest.TestCase):
    def test_blocks_git_commit_and_rm(self):
        for cmd in ("git commit -m x", "git push origin main", "rm -rf data", "git add -A"):
            r = run_hook({"tool_name": "Bash", "tool_input": {"command": cmd}})
            self.assertEqual(r.returncode, 2, cmd)

    def test_allows_normal_commands(self):
        r = run_hook({"tool_name": "Bash", "tool_input": {"command": "python -m hub.validators.reels_check data/x.json"}})
        self.assertEqual(r.returncode, 0)

    def test_blocks_editing_rules(self):
        r = run_hook({"tool_name": "Write", "tool_input": {"file_path": str(ROOT / "hub" / "rules.json")}})
        self.assertEqual(r.returncode, 2)
        r = run_hook({"tool_name": "Edit", "tool_input": {"file_path": str(ROOT / ".claude" / "settings.json")}})
        self.assertEqual(r.returncode, 2)

    def test_browser_final_buttons_blocked_but_exceptions_allowed(self):
        click = lambda el: run_hook({"tool_name": "mcp__playwright__browser_click", "tool_input": {"element": el, "ref": "e12"}})
        for el in ("게시 버튼", "Submit button", "삭제", "공유하기", "결제"):
            self.assertEqual(click(el).returncode, 2, el)
        for el in ("I Agree 체크박스", "Release 버튼", "임시저장", "다음 단계", "파일 선택"):
            self.assertEqual(click(el).returncode, 0, el)
        r = run_hook({"tool_name": "mcp__playwright__browser_navigate", "tool_input": {"url": "https://www.instagram.com/"}})
        self.assertEqual(r.returncode, 0)

    def test_agent_reach_channel_guard(self):
        bash = lambda c: run_hook({"tool_name": "Bash", "tool_input": {"command": c}}).returncode
        for ok in ('agent-reach web search "전세 사기"', "agent-reach youtube subtitles https://youtu.be/abc",
                   "agent-reach github readme anthropics/claude-code", "agent-reach add youtube", "agent-reach version",
                   "agent-reach web read https://www.netflix.com/kr"):
            self.assertEqual(bash(ok), 0, ok)
        for bad in ("agent-reach instagram profile top.pick00", "agent-reach twitter search 전세",
                    "agent-reach add instagram", "agent-reach web read https://www.instagram.com/p/xyz",
                    "agent-reach reddit search korea", "agent-reach configure groq-key gsk_123"):
            self.assertEqual(bash(bad), 2, bad)

    def test_craft_no_overwrite(self):
        bash = lambda c: run_hook({"tool_name": "Bash", "tool_input": {"command": c}}).returncode
        self.assertEqual(bash("photocraft-cli batch --actions a.json --in data/media/line --out data/media/out/line"), 0)
        self.assertEqual(bash("photocraft-cli run data/media/a.psd --cmd resize --params '{}' --out data/media/out/a.png"), 0)
        self.assertEqual(bash("photocraft-cli --help"), 0)
        self.assertEqual(bash("photocraft-cli batch --actions a.json --in data/media/line"), 2)
        self.assertEqual(bash("photocraft-cli batch --actions a.json --in data/media/line --out data/media/line/"), 2)
        self.assertEqual(bash("photocraft-cli run data/media/a.png --cmd resize --out data/media/a.png"), 2)

    def test_muapi_and_desktop_guard(self):
        bash = lambda c: run_hook({"tool_name": "Bash", "tool_input": {"command": c}}).returncode
        for ok in ("muapi image models", "muapi --help", "agent-desktop snapshot --app Calculator", "agent-desktop click @e12",
                   "agent-desktop type \"hello\""):
            self.assertEqual(bash(ok), 0, ok)
        for bad in ("muapi auth configure", "muapi image generate --prompt cat", "muapi video create x",
                    "muapi lipsync run --api-key sk-1", "agent-desktop snapshot --app Instagram",
                    "agent-desktop click \"게시\"", "agent-desktop click 'Send'", "agent-desktop type password=1234"):
            self.assertEqual(bash(bad), 2, bad)

    def test_allows_writing_run_output(self):
        r = run_hook({"tool_name": "Write", "tool_input": {"file_path": str(ROOT / "data" / "runs" / "x" / "package.json")}})
        self.assertEqual(r.returncode, 0)


if __name__ == "__main__":
    unittest.main()


class LiveMonitorTests(unittest.TestCase):
    """모니터 「사무실」이 실제 기록과 맞게 움직이는지: 훅 기록 → live_agents 요약."""

    def _log(self, tmp, payload, env_extra=None):
        env = {"CLAUDE_PROJECT_DIR": tmp, "PATH": "/usr/bin:/bin"}
        env.update(env_extra or {})
        subprocess.run([sys.executable, str(ROOT / ".claude" / "hooks" / "post_log.py")],
                       input=json.dumps(payload), capture_output=True, text=True, env=env, check=True)

    def test_hook_records_who_and_live_summary(self):
        import tempfile
        from hub import store
        with tempfile.TemporaryDirectory() as tmp:
            self._log(tmp, {"hook_event_name": "UserPromptSubmit", "session_id": "s1", "prompt": "비밀 내용"})
            self._log(tmp, {"hook_event_name": "PreToolUse", "session_id": "s1", "tool_name": "Agent", "tool_use_id": "t1",
                            "tool_input": {"subagent_type": "trend-scout", "description": "오늘 주제 고르기"}})
            self._log(tmp, {"hook_event_name": "PostToolUse", "session_id": "s1", "tool_name": "WebSearch",
                            "tool_input": {"query": "전세 사기"}, "agent_type": "trend-scout"})
            ev = Path(tmp) / "data" / "events.jsonl"
            text = ev.read_text(encoding="utf-8")
            self.assertNotIn("비밀 내용", text)   # 입력한 글은 남기지 않는다
            old = store.EVENTS
            try:
                store.EVENTS = ev
                live = store.live_agents()
                self.assertTrue(live["trend-scout"]["busy"])
                self.assertEqual(live["trend-scout"]["task"], "오늘 주제 고르기")
                self.assertTrue(live["claude-main"]["busy"])        # 본 세션이 답하는 중
                self._log(tmp, {"hook_event_name": "PostToolUse", "session_id": "s1", "tool_name": "Agent", "tool_use_id": "t1",
                                "tool_input": {"subagent_type": "trend-scout", "description": "오늘 주제 고르기"}})
                self._log(tmp, {"hook_event_name": "Stop", "session_id": "s1"})
                live = store.live_agents()
                self.assertFalse(live["trend-scout"]["busy"])       # 맡은 일 끝 → 쉼
                self.assertFalse(live["claude-main"]["busy"])       # 답을 마침 → 쉼
            finally:
                store.EVENTS = old

    def test_untagged_tool_goes_to_single_running_subagent(self):
        import tempfile
        from hub import store
        with tempfile.TemporaryDirectory() as tmp:
            self._log(tmp, {"hook_event_name": "UserPromptSubmit", "session_id": "s2"})
            self._log(tmp, {"hook_event_name": "PreToolUse", "session_id": "s2", "tool_name": "Task", "tool_use_id": "t9",
                            "tool_input": {"subagent_type": "reels-maker", "description": "릴스 패키지"}})
            self._log(tmp, {"hook_event_name": "PostToolUse", "session_id": "s2", "tool_name": "Write",
                            "tool_input": {"file_path": "data/runs/x/package.json"}})   # 옛 버전: agent_type 없음
            old = store.EVENTS
            try:
                store.EVENTS = Path(tmp) / "data" / "events.jsonl"
                live = store.live_agents()
                self.assertEqual(live["reels-maker"]["last_tool"], "Write")
                self.assertEqual(live["claude-main"]["last_tool"], "")   # 총괄이 쓴 것으로 잘못 세지 않음
            finally:
                store.EVENTS = old
