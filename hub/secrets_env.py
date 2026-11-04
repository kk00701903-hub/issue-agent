"""설정 화면에서 API 키 넣기: .env 파일에 키를 쓰고, 화면에는 넣었는지와 끝 4자리만 보여 준다.

- 이름이 정해진 키만 받는다(모델 제공자 키 + 이용권 키). 다른 줄은 건드리지 않는다.
- 키 값은 화면·기록·응답 어디에도 다시 내보내지 않는다(끝 4자리만).
- 이 PC(127.0.0.1)에서 연 화면에서만 바꿀 수 있다(휴대폰 보기로는 못 바꿈) — 서버가 확인.
"""
import os
import re

from hub import models, store

ENV = store.ROOT / ".env"
EXTRA = {"ANTHROPIC_API_KEY": "Anthropic(Claude) — 에이전트 실행에 꼭 필요", "HUB_LICENSE_KEY": "옛 라이선스 키(웹 콘솔 연결을 쓰면 필요 없음)"}
_VAL = re.compile(r"^[A-Za-z0-9_\-.:/+=]{8,400}$")


def known():
    """설정 화면에 보여 줄 키 목록: 이름 → 설명."""
    out = dict(EXTRA)
    for pid, p in models.DEFAULT_PROVIDERS.items():
        k = p.get("key_env")
        if k and k not in out:
            out[k] = f"{pid} 모델(외부 무료·저가 모델, 공개 자료 작업만)"
    return out


def _read():
    try:
        return ENV.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return []


def status():
    vals = {}
    for line in _read():
        s = line.strip()
        if s and not s.startswith("#") and "=" in s:
            k, v = s.split("=", 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    res = []
    for k, desc in known().items():
        v = vals.get(k, "") or os.environ.get(k, "")
        ok = bool(v) and not v.startswith("여기에")
        res.append({"name": k, "desc": desc, "set": ok, "tail": v[-4:] if ok and len(v) >= 12 else ""})
    return res


def save(name, value):
    """키 하나를 .env 에 넣거나(값) 지운다(빈 값). 돌려주는 값: (ok, 오류)."""
    if name not in known():
        return False, "받을 수 없는 키 이름"
    value = (value or "").strip()
    if value and not _VAL.match(value):
        return False, "키 형식이 아닙니다(공백·따옴표 없이 붙여 넣으세요)"
    lines, done = _read(), False
    for i, line in enumerate(lines):
        s = line.strip()
        if not s.startswith("#") and "=" in s and s.split("=", 1)[0].strip() == name:
            lines[i] = f"{name}={value}"
            done = True
    if not done:
        lines.append(f"{name}={value}")
    tmp = ENV.with_suffix(".tmp")
    tmp.write_text("\n".join(lines).rstrip("\n") + "\n", encoding="utf-8")
    os.replace(tmp, ENV)
    if value:
        os.environ[name] = value   # 다시 켜지 않아도 바로 쓰이게
    else:
        os.environ.pop(name, None)
    store.log_work(f"설정: {name} {'저장' if value else '지움'}(값은 기록하지 않음)")
    return True, ""
