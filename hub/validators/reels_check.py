"""릴스 패키지 규칙 검수기(코드로 하는 검사, LLM 아님).

사용: python -m hub.validators.reels_check data/runs/<ID>/package.json
종료 코드: 통과 0, 오류 있음 1
"""
import json
import re
import sys

from hub import store

ACCOUNTS = ("top.pick00", "top.pick01", "ojeongkkul")


def _text(v):
    return str(v or "").strip()


def validate(pkg, rules=None, bgm_state=None):
    r = rules or store.rules()
    state = bgm_state if bgm_state is not None else store.bgm_state()
    errors, warnings = [], []

    def E(rule, msg):
        errors.append({"rule": rule, "msg": msg})

    def W(rule, msg):
        warnings.append({"rule": rule, "msg": msg})

    acct = pkg.get("account")
    if acct not in ACCOUNTS:
        E("account", f"계정은 {', '.join(ACCOUNTS)} 중 하나여야 함(현재: {acct!r})")

    for key in ("topic", "caption", "intro_comment", "cover_title"):
        if not _text(pkg.get(key)):
            E("required", f"{key} 가 비어 있음")

    hook = pkg.get("hook") or {}
    for key in ("line1", "line2", "pattern"):
        if not _text(hook.get(key)):
            E("required", f"hook.{key} 가 비어 있음")

    # 후킹 형태(경고): 「~안 하면 / ~당해요」식 조건·결과 구조
    line1 = _text(hook.get("line1"))
    if line1 and not any(w in line1 for w in r.get("conditional_words", [])):
        W("hook_form", "첫 줄이 「내가 ○○ 안 하면」식 조건 형태가 아닐 수 있음(보는 사람과의 관련·결과·교훈 확인)")

    # 장면 속도
    scenes = pkg.get("scenes") or []
    if not scenes:
        E("required", "scenes 가 비어 있음")
    cps = float(r.get("reading_chars_per_sec", 6))
    min_sec = float(r.get("min_scene_seconds", 2.5))
    total = 0.0
    for i, s in enumerate(scenes, 1):
        text = _text(s.get("text")).replace("\n", "")
        try:
            sec = float(s.get("seconds") or 0)
        except (TypeError, ValueError):
            sec = 0.0
        total += sec
        need = max(min_sec, len(text) / cps)
        if sec + 1e-9 < need:
            E("scene_speed", f"장면 {i}: {sec:.1f}초 / 글자 {len(text)}자(공백 포함) → 최소 {need:.1f}초 필요")

    # 「나라가」「나라면」 한 화면 동시 사용
    screens = [line1 + " " + _text(hook.get("line2"))] + [_text(s.get("text")) for s in scenes]
    for idx, scr in enumerate(screens):
        if "나라가" in scr and "나라면" in scr:
            W("nara_mix", f"{'첫 화면' if idx == 0 else f'장면 {idx}'}: 「나라가」와 「나라면」이 같이 있어 헷갈릴 수 있음")

    # 캡션 링크
    if re.search(r.get("link_pattern", "https?://"), _text(pkg.get("caption")), re.IGNORECASE):
        E("caption_link", "캡션에 링크가 있음(클릭이 안 되므로 넣지 않음. 링크는 프로필 대표 링크로)")

    series = _text(pkg.get("series"))
    is_world = series.startswith(r.get("world_series_prefix", "세계의"))
    bgm = pkg.get("bgm") or {}
    bid = _text(bgm.get("id")).upper()
    voice = pkg.get("voice")

    if acct == "ojeongkkul":
        if bgm.get("source") != "instagram_free":
            E("bgm_source", "오정꿀은 인스타 무료 음원만 사용(bgm.source = instagram_free)")
        if bid:
            E("bgm_local", "오정꿀에는 본계정 wav 곡 번호를 쓰지 않음")
        if voice:
            E("voice_none", "오정꿀은 음성 없음(voice 는 null)")
        if any(_text(s.get("voice_text")) for s in scenes):
            E("voice_none", "오정꿀 장면에 voice_text 가 있음(음성 없음)")
        if pkg.get("style") not in ("A", "B"):
            W("style", "오정꿀 형식(style)이 A 또는 B 가 아님")
    elif acct in ("top.pick00", "top.pick01"):
        banned = [b.upper() for b in r.get("banned_bgm", [])]
        key = store.bgm_key(acct, is_world)
        last = _text(state.get(key)).upper()
        if not bid:
            E("bgm_missing", "bgm.id 가 비어 있음")
        else:
            if is_world:
                rot = [b.upper() for b in r.get("world_rotation", [])]
                if bid not in rot:
                    E("bgm_world", f"「세계의 ○○」 시리즈는 {'→'.join(rot)} 로테이션 곡만 사용")
                elif last in rot and bid != rot[(rot.index(last) + 1) % len(rot)]:
                    E("bgm_rotation", f"로테이션 순서 어긋남: 지난번 {last} 다음은 {rot[(rot.index(last) + 1) % len(rot)]}")
            else:
                if bid in banned:
                    E("bgm_banned", f"{bid} 는 사용 금지 곡({', '.join(banned)}). 「세계의 ○○」 시리즈만 예외")
                elif last and bid == last:
                    E("bgm_repeat", f"지난번과 같은 곡({bid}). 순서대로 한 곡씩 로테이션")
        # 음성
        if not isinstance(voice, dict) or voice.get("name") != r.get("female_voice"):
            E("voice_name", f"음성은 여자 목소리 {r.get('female_voice')} 로 지정")
        for i, s in enumerate(scenes, 1):
            vt = _text(s.get("voice_text"))
            if not vt:
                E("voice_text_missing", f"장면 {i}: 읽을 대본(voice_text)이 없음")
            elif re.search(r.get("order_mark_pattern", r"\d+\s*/\s*\d+"), vt):
                E("voice_order_mark", f"장면 {i}: 대본에 「1/3」 같은 순서 표시가 있음(「첫 번째」처럼 풀어 쓰기)")
        if acct == "top.pick01" and pkg.get("type") == "person" and not _text(pkg.get("leader_intro")):
            E("leader_intro", "인물 릴스는 어느 나라 대통령(지도자)인지 leader_intro 에 소개해야 함")

    return {
        "passed": not errors,
        "errors": errors,
        "warnings": warnings,
        "stats": {"scenes": len(scenes), "total_seconds": round(total, 1)},
    }


def main(argv):
    if len(argv) != 2:
        print("사용: python -m hub.validators.reels_check <package.json>")
        return 2
    try:
        with open(argv[1], "r", encoding="utf-8") as f:
            pkg = json.load(f)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"passed": False, "errors": [{"rule": "file", "msg": str(e)}], "warnings": []}, ensure_ascii=False))
        return 1
    result = validate(pkg)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
