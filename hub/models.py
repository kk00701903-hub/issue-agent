"""모델 제공자 라우팅. 기본은 Claude(Anthropic). 작업별로 다른 모델(DeepSeek·Kimi·GLM·StepFun·Qwen·MiMo·OpenRouter)을 붙일 수 있다.

설정(hub/config.json):
  "model_routes": {"flow": {"provider": "anthropic", "model": "claude-sonnet-5-5"}}
  "providers":    {"deepseek": {"base_url": "...", "key_env": "DEEPSEEK_API_KEY", "model": "deepseek-chat", "data": "public"}}

data 등급: "private" 제공자(Anthropic)만 원고·사내 자료·고객 자료를 보낼 수 있다. "public" 제공자(무료·해외 서비스)에는
공개돼도 되는 내용(뉴스 요약·흐름 설계·공개 트렌드)만 보낸다. 작업마다 필요한 등급을 TASK_DATA 에 적는다.
키는 모두 .env 의 환경 변수로만 읽는다(설정 파일·코드에 키를 적지 않는다).
"""
import json as _json
import os as _os
import urllib.request as _url

from hub import store

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"

# OpenAI 호환(chat/completions) 끝점. 주소는 각 사 문서 기준이며 바뀌면 config.json 의 providers 에서 고친다.
DEFAULT_PROVIDERS = {
    "anthropic": {"kind": "anthropic", "key_env": "ANTHROPIC_API_KEY", "model": "claude-sonnet-5-5", "data": "private",
                  "label": "Claude (기본)"},
    "deepseek": {"base_url": "https://api.deepseek.com/v1", "key_env": "DEEPSEEK_API_KEY", "model": "deepseek-chat", "data": "public",
                 "label": "DeepSeek"},
    "kimi": {"base_url": "https://api.moonshot.ai/v1", "key_env": "MOONSHOT_API_KEY", "model": "kimi-k2-0905-preview", "data": "public",
             "label": "Kimi (Moonshot) — 긴 문서·리서치"},
    "glm": {"base_url": "https://open.bigmodel.cn/api/paas/v4", "key_env": "ZHIPU_API_KEY", "model": "glm-4.5-flash", "data": "public",
            "label": "GLM (Zhipu) — 코딩·그림 이해"},
    "stepfun": {"base_url": "https://api.stepfun.com/v1", "key_env": "STEPFUN_API_KEY", "model": "step-3", "data": "public",
                "label": "StepFun — 코딩·에이전트"},
    "qwen": {"base_url": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", "key_env": "DASHSCOPE_API_KEY", "model": "qwen-plus", "data": "public",
             "label": "Qwen (Alibaba)"},
    "mimo": {"base_url": "https://api.xiaomimimo.com/v1", "key_env": "MIMO_API_KEY", "model": "mimo-v2", "data": "public",
             "label": "Xiaomi MiMo — 글·그림·소리·영상 이해"},
    "local": {"base_url": "http://127.0.0.1:8080/v1", "key_env": "", "model": "local-model", "data": "private",
              "label": "내 PC 로컬 모델(Magnitude·Ollama 등 OpenAI 호환) — 자료가 PC 밖으로 안 나감"},
    "freellmapi": {"base_url": "http://127.0.0.1:3000/v1", "key_env": "FREELLMAPI_KEY", "model": "auto", "data": "public",
                   "label": "freellmapi — 무료 AI 34곳을 주소 하나로(내 PC에 띄움, 자료는 각 무료 서비스로 감)"},
    "openrouter": {"base_url": "https://openrouter.ai/api/v1", "key_env": "OPENROUTER_API_KEY", "model": "inclusionai/ling-flash:free", "data": "public",
                   "label": "OpenRouter — Ling 등 무료 모델"},
}

# 작업별로 보낼 수 있는 자료 등급. private 작업은 public 제공자로 보낼 수 없다.
TASK_DATA = {
    "flow": "public",          # 흐름 설계: 에이전트 이름·설명만 보냄
    "trend": "public",         # 공개 뉴스·검색어 요약
    "reels_draft": "public",   # 릴스 대본 초안(공개 뉴스 기반)
    "novel": "private",        # 웹소설 원고
    "company": "private",      # 사내 개발·고객 자료
    "review": "private",       # 코드 리뷰(사내 코드)
}
DEFAULT_ROUTES = {"flow": {"provider": "anthropic"}}


def providers():
    cfg = store.config()
    out = {k: dict(v) for k, v in DEFAULT_PROVIDERS.items()}
    for k, v in (cfg.get("providers") or {}).items():
        if isinstance(v, dict):
            out.setdefault(k, {}).update(v)
    return out


def route(task):
    """작업 이름 → (제공자 이름, 제공자 설정, 모델 이름). 잘못된 조합은 Claude 로 되돌린다."""
    cfg = store.config()
    routes = {**DEFAULT_ROUTES, **(cfg.get("model_routes") or {})}
    r = routes.get(task) or routes.get("flow") or DEFAULT_ROUTES["flow"]
    provs = providers()
    name = r.get("provider", "anthropic")
    p = provs.get(name)
    if not p:
        name, p = "anthropic", provs["anthropic"]
    need = TASK_DATA.get(task, "private")
    if need == "private" and p.get("data", "public") != "private":
        # 원고·사내 자료는 외부 무료 모델로 보내지 않는다
        name, p = "anthropic", provs["anthropic"]
    model = r.get("model") or (cfg.get("flow_model") if task == "flow" and name == "anthropic" else None) or p.get("model")
    return name, p, model


def status():
    """화면 표시용: 작업별 라우팅과 키 유무."""
    rows = []
    for task in TASK_DATA:
        name, p, model = route(task)
        rows.append({"task": task, "provider": name, "label": p.get("label", name), "model": model,
                     "data": TASK_DATA[task], "key_ok": (not p.get("key_env")) or bool(_os.environ.get(p.get("key_env", ""), ""))})
    return rows


def complete(task, system, prompt, max_tokens=2000):
    """작업 이름으로 라우팅해 한 번 묻고 (본문, 사용량, 정보) 를 돌려준다.
    실패(키 없음·한도·네트워크)하면 config 의 model_fallback 순서로 다음 제공자를 시도한다.
    대체는 「공개」 작업에만, 그리고 내 PC 모델(local)·비공개 허용 제공자만 비공개 작업에 쓴다.
    같은 서비스의 계정을 바꿔 가며 한도를 넘기는 방식(계정 돌려쓰기)은 하지 않는다."""
    chain = [None] + list((store.config().get("model_fallback") or []))
    last = None
    for alt in chain:
        try:
            return _complete_once(task, system, prompt, max_tokens, alt)
        except Exception as e:  # noqa: BLE001
            last = e
    raise last if last else RuntimeError("모델 호출 실패")


def _complete_once(task, system, prompt, max_tokens, alt=None):
    name, p, model = route(task)
    if alt:
        provs = providers()
        q = provs.get(alt)
        if not q or q is p:
            raise RuntimeError(f"대체 제공자 없음: {alt}")
        if TASK_DATA.get(task, "private") == "private" and q.get("data") != "private":
            raise RuntimeError(f"{alt}: 비공개 작업은 외부 모델로 대체하지 않음")
        name, p, model = alt, q, q.get("model")
    key = _os.environ.get(p.get("key_env", ""), "") if p.get("key_env") else "local"
    if not key:
        raise RuntimeError(f"{p.get('key_env', '키')} 없음")
    if name == "local" and not str(p.get("base_url", "")).startswith(("http://127.0.0.1", "http://localhost")):
        raise RuntimeError("local 제공자는 내 PC 주소(127.0.0.1)만 쓴다")
    if p.get("kind") == "anthropic":
        body = _json.dumps({"model": model, "max_tokens": max_tokens, "system": system,
                            "messages": [{"role": "user", "content": prompt}]}).encode("utf-8")
        req = _url.Request(ANTHROPIC_URL, data=body, method="POST", headers={
            "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01"})
        with _url.urlopen(req, timeout=60) as r:
            data = _json.loads(r.read().decode("utf-8"))
        text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
        return text, data.get("usage", {}), {"provider": name, "model": model}
    base = p.get("base_url", "").rstrip("/")
    if not base:
        raise RuntimeError(f"{name}: base_url 없음")
    body = _json.dumps({"model": model, "max_tokens": max_tokens,
                        "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}]}).encode("utf-8")
    headers = {"content-type": "application/json", "authorization": f"Bearer {key}"}
    if name == "openrouter":
        headers["HTTP-Referer"] = "http://127.0.0.1:4830"; headers["X-Title"] = "Agent Hub"
    req = _url.Request(base + "/chat/completions", data=body, method="POST", headers=headers)
    with _url.urlopen(req, timeout=90) as r:
        data = _json.loads(r.read().decode("utf-8"))
    choices = data.get("choices") or []
    text = ((choices[0].get("message") or {}).get("content") or "") if choices else ""
    usage = data.get("usage", {})
    # 사용량 이름을 Anthropic 식으로 맞춘다(input_tokens / output_tokens)
    if usage and "input_tokens" not in usage:
        usage = {"input_tokens": usage.get("prompt_tokens", 0), "output_tokens": usage.get("completion_tokens", 0)}
    return text, usage, {"provider": name, "model": model}
