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

from hub import samples  # noqa: E402
from hub.validators.reels_check import validate  # noqa: E402

RULES = json.loads((ROOT / "hub" / "rules.json").read_text(encoding="utf-8"))


def rules_of(res):
    return {e["rule"] for e in res["errors"]}


class ValidatorTests(unittest.TestCase):
    def ok(self, **kw):
        return samples.sample(kw.pop("account", "top.pick00"), "시험", **kw)

    def test_ok_passes(self):
        for acct in ("top.pick00", "top.pick01", "ojeongkkul"):
            res = validate(self.ok(account=acct), RULES, {})
            self.assertTrue(res["passed"], (acct, res["errors"]))

    def test_bad_sample_fails_with_expected_rules(self):
        res = validate(samples.sample("top.pick00", "시험", scenario="bad"), RULES, {})
        self.assertFalse(res["passed"])
        self.assertTrue({"bgm_banned", "caption_link", "scene_speed", "voice_order_mark", "required"} <= rules_of(res))
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

    def test_no_max_length_limit(self):
        p = self.ok()
        p["scenes"] = copy.deepcopy(p["scenes"]) * 6  # 30초를 넘겨도 된다
        self.assertGreater(validate(p, RULES, {})["stats"]["total_seconds"], 30)
        self.assertTrue(validate(p, RULES, {})["passed"])


class FlowAndLicenseTests(unittest.TestCase):
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
        key = lic.issue("고객사A", lic.VERIFY_SECRET, days=10)
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

    def test_allows_writing_run_output(self):
        r = run_hook({"tool_name": "Write", "tool_input": {"file_path": str(ROOT / "data" / "runs" / "x" / "package.json")}})
        self.assertEqual(r.returncode, 0)


if __name__ == "__main__":
    unittest.main()
