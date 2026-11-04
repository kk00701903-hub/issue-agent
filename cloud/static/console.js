// Agent Hub 웹 콘솔: 가입·로그인 → 요금제·도구 고르기 → PC 연결 코드 → 기기 목록 → 결제
"use strict";
const $ = (s) => document.querySelector(s);
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else if (k === "class") e.className = v; else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(3)) if (k != null && k !== false) e.append(k.nodeType ? k : String(k));
  return e;
}
async function api(path, body) {
  const opt = body === undefined ? { credentials: "same-origin" } : { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Hub": "1" }, body: JSON.stringify(body) };
  const r = await fetch(path, opt); let data = {}; try { data = await r.json(); } catch {}
  return { ok: r.ok, status: r.status, data };
}
let toastT = 0;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3500); }
const won = (n) => n.toLocaleString("ko-KR") + "원";
const when = (s) => (s ? s.slice(0, 16).replace("T", " ") : "-");

// ---------- 가입·로그인 ----------
function renderAuth(mode = location.hash === "#signup" ? "signup" : "login") {
  $("#who").replaceChildren();
  const email = h("input", { type: "email", id: "em", autocomplete: "email", required: true });
  const pw = h("input", { type: "password", id: "pw", autocomplete: mode === "signup" ? "new-password" : "current-password", required: true });
  const org = h("input", { type: "text", id: "org", placeholder: "예: 스튜디오 이름" });
  const agree = h("input", { type: "checkbox", id: "agree" });
  const err = h("div", { class: "err", role: "alert" });
  const go = async (e) => {
    e.preventDefault(); err.textContent = "";
    const r = mode === "signup" ? await api("/api/signup", { email: email.value, password: pw.value, org: org.value, agree: agree.checked }) : await api("/api/login", { email: email.value, password: pw.value });
    if (r.ok) load(); else err.textContent = r.data.error || "실패했습니다";
  };
  const tab = (m, l) => h("button", { class: "btn" + (mode === m ? " primary" : ""), type: "button", onclick: () => { location.hash = m === "signup" ? "signup" : ""; renderAuth(m); } }, l);
  $("#app").replaceChildren(h("div", { class: "auth card" },
    h("div", { class: "tabs" }, tab("login", "로그인"), tab("signup", "무료로 시작(14일)")),
    h("form", { onsubmit: go },
      h("div", { class: "field" }, h("label", { for: "em" }, "이메일"), email),
      h("div", { class: "field" }, h("label", { for: "pw" }, mode === "signup" ? "비밀번호(10자 이상)" : "비밀번호"), pw),
      mode === "signup" ? [h("div", { class: "field" }, h("label", { for: "org" }, "회사·채널 이름(선택)"), org),
        h("label", { class: "row", style: "font-weight:400;color:inherit;margin-bottom:12px" }, agree, h("span", {}, h("a", { href: "/static/terms.html", target: "_blank" }, "이용약관"), "과 ", h("a", { href: "/static/privacy.html", target: "_blank" }, "개인정보 처리방침"), "에 동의합니다"))] : null,
      err, h("button", { class: "btn primary", style: "width:100%", type: "submit" }, mode === "signup" ? "가입하고 14일 무료로 쓰기" : "로그인"))));
  setTimeout(() => email.focus(), 30);
}

// ---------- 대시보드 ----------
let ME = null;
async function load() {
  const r = await api("/api/me");
  if (r.status === 401) return renderAuth();
  if (!r.ok) { $("#app").replaceChildren(h("p", { class: "err" }, r.data.error || "불러오지 못했습니다")); return; }
  ME = r.data; render();
}
function render() {
  const o = ME.org;
  $("#who").replaceChildren(h("span", { class: "muted" }, ME.user.email), h("button", { class: "btn sm", onclick: async () => { await api("/api/logout", {}); renderAuth(); } }, "로그아웃"));
  const st = !o.active ? ["기간 끝남", "err"] : o.days_left <= 5 ? [`${o.days_left}일 남음`, "warn"] : [`${o.plan_until}까지`, "ok"];
  $("#app").replaceChildren(
    h("h1", {}, o.name), h("p", { class: "muted", style: "margin:0 0 20px" }, "요금제·도구·PC 연결을 여기서 관리합니다. 에이전트는 고객님 PC에서 돌고, 이 콘솔은 원고·파일을 받지 않습니다."),
    planCard(o, st), toolsCard(o), devicesCard(o), paymentsCard());
}
let PERIOD = 12;   // 결제 기간(개월): 1·6·12 — 길수록 할인
function planCard(o, st) {
  const prices = Object.fromEntries((ME.prices || []).map((r) => [r.id, r]));
  const periods = (ME.prices && ME.prices[0] ? ME.prices[0].periods : [{ months: 1, label: "월간", discount: 0 }]);
  if (!periods.some((x) => x.months === PERIOD)) PERIOD = periods[periods.length - 1].months;
  const tabs = h("div", { class: "row period" }, periods.map((x) => h("button", { class: "btn sm" + (x.months === PERIOD ? " primary" : ""), onclick: () => { PERIOD = x.months; render(); } },
    x.label, x.discount ? h("span", { class: "pill ok", style: "margin-left:6px" }, `${Math.round(x.discount * 100)}% 할인`) : null)));
  const box = h("div", { class: "grid g3" }, ME.plans.map((p) => {
    const pr = prices[p.id] && prices[p.id].periods.find((x) => x.months === PERIOD);
    return h("div", { class: "plan" + (o.plan === p.id ? " cur" : "") },
      h("div", { class: "row" }, h("b", {}, p.name), p.featured ? h("span", { class: "pill" }, "추천") : null, o.plan === p.id ? h("span", { class: "pill ok" }, "지금") : null),
      pr && PERIOD > 1 ? h("div", {}, h("div", { class: "price" }, won(pr.per_month), h("small", {}, " / 월 환산")), h("div", { class: "muted" }, `${pr.label} ${won(pr.amount)} · 정가보다 ${won(pr.saving)} 절약`))
        : h("div", { class: "price" }, won(p.price), h("small", {}, " / 월")),
      h("div", { class: "muted" }, p.desc),
      h("button", { class: "btn" + (o.plan === p.id ? "" : " primary"), onclick: (e) => checkout(e.currentTarget, p) }, o.plan === p.id ? "기간 늘리기" : "이 요금제로"));
  }));
  return h("section", { class: "card" }, h("div", { class: "row", style: "justify-content:space-between" }, h("h2", { style: "margin:0" }, "요금제"),
    h("div", { class: "row" }, h("span", { class: "pill" }, o.plan_name), h("span", { class: "pill " + st[1] }, st[0]))), tabs,
    o.plan === "trial" ? h("p", { class: "muted" }, "평가판은 모든 도구를 14일 동안 씁니다. 끝나기 전에 요금제를 고르면 이어서 씁니다.") : null, box);
}
async function checkout(btn, p) {
  btn.disabled = true; const r = await api("/api/billing/checkout", { plan: p.id, months: PERIOD }); btn.disabled = false;
  if (!r.ok) return toast(r.data.error || "실패했습니다");
  ME.lastCheckout = r.data; await load(); toast("주문을 만들었습니다 — 아래 결제 안내를 확인하세요");
}
function toolsCard(o) {
  const picked = new Set(o.tools);
  const all = o.plan === "trial" || o.plan === "team";
  const grid = h("div", { class: "tools" }, ME.tools.map((t) => {
    const on = all || picked.has(t.id);
    return h("label", { class: "tool" + (on ? " on" : "") }, h("input", { type: "checkbox", checked: on, disabled: all, onchange: (e) => { e.target.checked ? picked.add(t.id) : picked.delete(t.id); } }), t.name, t.beta ? h("span", { class: "pill off" }, "베타") : null);
  }));
  const save = async (btn) => { btn.disabled = true; const r = await api("/api/org/tools", { tools: [...picked] }); btn.disabled = false; if (r.ok) { ME.org = r.data.org; render(); toast("도구를 저장했습니다 — PC는 다음 동기화(15분 안)에 바뀝니다"); } else toast(r.data.error || "실패"); };
  return h("section", { class: "card" }, h("h2", {}, "도구"),
    h("p", { class: "muted" }, all ? "지금 요금제는 모든 도구를 씁니다." : `도구를 ${o.tools_max}개까지 고릅니다. 공용 에이전트(브라우저·웹 읽기·그림 처리)는 항상 들어 있습니다.`),
    grid, all ? null : h("div", { class: "row", style: "margin-top:12px" }, h("button", { class: "btn primary", onclick: (e) => save(e.currentTarget) }, "저장")));
}
function devicesCard(o) {
  const live = ME.devices.filter((d) => !d.revoked);
  const codeBox = h("div");
  const getCode = async (btn) => { btn.disabled = true; const r = await api("/api/devices/code", {}); btn.disabled = false;
    if (!r.ok) return toast(r.data.error || "실패");
    codeBox.replaceChildren(h("h3", {}, "PC에서 넣을 연결 코드"), h("div", { class: "code" }, r.data.code),
      h("ol", { class: "muted" }, h("li", {}, "PC에서 Agent Hub 관리 화면을 엽니다."), h("li", {}, "설정 → 웹 콘솔 연결에 이 콘솔 주소와 코드를 넣고 「연결」을 누릅니다."), h("li", {}, `코드는 ${r.data.minutes}분 동안, 한 번만 쓸 수 있습니다.`)),
      h("p", { class: "muted" }, "콘솔 주소: ", h("code", {}, location.origin))); };
  const off = h("input", { type: "text", placeholder: "dev_ 로 시작하는 기기 ID" });
  const offBox = h("div");
  const offToken = async (btn) => { btn.disabled = true; const r = await api("/api/devices/offline-token", { device: off.value.trim() }); btn.disabled = false;
    if (!r.ok) return toast(r.data.error || "실패");
    offBox.replaceChildren(h("p", { class: "muted" }, "이 토큰을 PC 관리 화면 → 설정 → 「이용권 토큰 직접 넣기」에 붙여 넣으세요(7일 유효)."), h("textarea", { readonly: true, rows: 4, style: "width:100%;font:12px ui-monospace,monospace" }, r.data.token)); };
  return h("section", { class: "card" }, h("div", { class: "row", style: "justify-content:space-between" }, h("h2", { style: "margin:0" }, `PC 연결 (${live.length} / ${o.devices_max}대)`),
    h("button", { class: "btn primary", onclick: (e) => getCode(e.currentTarget) }, "PC 연결 코드 받기")), codeBox,
    ME.devices.length ? h("table", {}, h("thead", {}, h("tr", {}, ["PC", "마지막 연결", "켜진 도구", "오늘 실행", ""].map((x) => h("th", {}, x)))),
      h("tbody", {}, ME.devices.map((d) => h("tr", {},
        h("td", {}, h("b", {}, d.name || "PC"), h("div", { class: "muted" }, h("code", {}, d.device_id)), d.revoked ? h("span", { class: "pill off" }, "연결 끊김") : null),
        h("td", {}, when(d.last_seen)), h("td", {}, (d.summary.tools_enabled || []).join(", ") || "-"),
        h("td", {}, Object.entries(d.summary.runs_today || {}).map(([k, v]) => `${k} ${v}`).join(" · ") || "-", d.summary.agents_working ? h("div", { class: "muted" }, `작업 중 ${d.summary.agents_working}`) : null),
        h("td", {}, d.revoked ? null : h("button", { class: "btn sm danger", onclick: async () => { if (!confirm("이 PC 연결을 끊을까요? PC는 다음 동기화부터 이용권을 못 받습니다.")) return; await api(`/api/devices/${d.id}/revoke`, {}); load(); } }, "연결 끊기")))))) : h("p", { class: "muted" }, "아직 연결한 PC가 없습니다."),
    h("details", { style: "margin-top:12px" }, h("summary", { class: "muted" }, "인터넷이 안 되는 PC: 오프라인 토큰 받기"),
      h("div", { class: "row", style: "margin-top:8px" }, off, h("button", { class: "btn", onclick: (e) => offToken(e.currentTarget) }, "토큰 받기")), offBox));
}
function paymentsCard() {
  const c = ME.lastCheckout;
  return h("section", { class: "card" }, h("h2", {}, "결제"),
    c ? h("div", { class: "note", style: "margin-bottom:12px" }, h("b", {}, `주문 ${c.ref} · ${won(c.amount)}`), h("div", {}, c.message)) : null,
    ME.payments.length ? h("table", {}, h("thead", {}, h("tr", {}, ["주문", "요금제", "금액", "상태", "만든 때"].map((x) => h("th", {}, x)))),
      h("tbody", {}, ME.payments.map((p) => h("tr", {}, h("td", {}, h("code", {}, p.ref)), h("td", {}, `${p.plan} · ${p.months}개월`), h("td", {}, won(p.amount)),
        h("td", {}, h("span", { class: "pill " + (p.status === "paid" ? "ok" : "warn") }, p.status === "paid" ? "결제 완료" : "입금 대기")), h("td", {}, when(p.created)))))) : h("p", { class: "muted" }, "결제 내역이 없습니다."));
}
load();
