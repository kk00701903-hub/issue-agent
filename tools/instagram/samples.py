"""드라이런(데모)용 가짜 패키지. 실제 에이전트를 부르지 않고 화면·승인 흐름을 시험할 때 쓴다.
내용은 모두 데모 문구이며 사실 주장이 아니다."""
import math


def _pick_bgm(series, rules):
    """데모용 곡 번호: 금지곡을 피하고, 시리즈 로테이션이 있으면 그 첫 곡."""
    wp, rot = rules.get("world_series_prefix") or "", rules.get("world_rotation") or []
    if wp and rot and str(series).startswith(wp):
        return rot[0]
    banned = {b.upper() for b in rules.get("banned_bgm", [])}
    for c in ("M2", "M4", "M5", "M7", "M8", "M9"):
        if c not in banned:
            return c
    return "M10"


def _scene(text, voice=None, factor=5.0):
    sec = max(3.0, math.ceil(len(text.replace("\n", "")) / factor * 2) / 2)
    s = {"text": text, "seconds": sec}
    if voice:
        s["voice_text"] = voice
    return s


def sample(account, topic, series="", ptype="general", scenario="ok", profile=None, rules=None):
    """profile: 도구 설정의 계정 정보(profile·person_intro). rules: 도구 규칙(음성 이름·로테이션)."""
    profile = profile or {}
    rules = rules or {}
    ojg = profile.get("profile") == "silent"
    texts = [
        ("계약서에 도장 찍기 전에\n집주인 이름부터 검색하세요", "계약서에 도장 찍기 전에, 집주인 이름부터 검색하세요."),
        ("첫 번째 확인\n등기부등본의 근저당 금액", "첫 번째 확인, 등기부등본의 근저당 금액입니다."),
        ("두 번째 확인\n집주인 체납 여부", "두 번째 확인, 집주인 체납 여부입니다."),
        ("세 번째 확인\n특약에 안전장치 넣기", "세 번째 확인, 특약에 안전장치를 넣으세요."),
    ]
    scenes = [_scene(t, None if ojg else v) for t, v in texts]
    pkg = {
        "account": account,
        "series": series or ("인물" if ptype == "person" else "생활 꿀팁"),
        "type": ptype,
        "topic": topic,
        "hook": {
            "line1": "계약 전에 이름 검색 안 하면",
            "line2": "(데모) 위험한 집주인을 만날 수 있어요",
            "pattern": "13 경고형",
        },
        "cover_title": "계약 전 필수 확인 3가지",
        "scenes": scenes,
        "caption": "(데모) 계약 전에 꼭 확인할 3가지를 정리했어요. 저장해 두고 계약할 때 꺼내 보세요.",
        "intro_comment": "(데모) 이 영상은 계약 전 확인 순서를 짧게 정리한 것입니다.",
        "notes": ["데모 데이터: 실제 게시용이 아님"],
    }
    if ojg:
        pkg.update({"voice": None, "bgm": {"source": "instagram_free", "name": "(데모) 잔잔한 곡"}, "style": "B"})
    else:
        pkg.update(
            {
                "voice": {"engine": "edge-tts", "name": profile.get("voice_name") or rules.get("voice_name") or "ko-KR-SunHiNeural"},
                "bgm": {"id": _pick_bgm(series, rules), "source": "local"},
            }
        )
    if profile.get("person_intro") and ptype == "person":
        pkg["leader_intro"] = "(데모) ○○ 나라의 대통령"

    if scenario == "bad":
        pkg["bgm"] = {"id": "", "source": "local"} if not ojg else pkg["bgm"]   # 곡 번호 빠짐 → 오류
        pkg["caption"] += " 자세한 건 https://example.com 에서 확인하세요."
        pkg["scenes"][1]["seconds"] = 1.5
        if not ojg:
            pkg["scenes"][2]["voice_text"] = "세 번째 확인 (1/3) 입니다."
        pkg["intro_comment"] = ""
        pkg["hook"]["line1"] = "지금 전세 시장 뉴스"
    return pkg
