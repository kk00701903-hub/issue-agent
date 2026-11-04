/* Agent Hub 관리 화면 — Jira 스타일(상단 내비 + 프로젝트 사이드바 + 보드·목록·이슈 화면) */
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ---------- 공통 도구 ----------
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat(3)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
// 화면을 다시 그릴 때 빈 칸(null·false)이 「null」 글자로 찍히지 않게 걸러 낸다
{ const rc = Element.prototype.replaceChildren; Element.prototype.replaceChildren = function (...kids) { return rc.apply(this, kids.flat(3).filter((x) => x != null && x !== false)); }; }
async function api(path, body) {
  const opt = body ? { method: "POST", headers: { "Content-Type": "application/json", "X-Hub": "1" }, body: JSON.stringify(body) } : {};
  const r = await fetch(path, opt);
  let data = {}; try { data = await r.json(); } catch {}
  return { ok: r.ok, status: r.status, data };
}
const usd = (n) => (n == null ? "-" : "$" + Number(n).toFixed(2));
const ts = (iso) => (iso || "").replace("T", " ").slice(0, 16);
const short = (iso) => (iso || "").replace("T", " ").slice(5, 16);
function ago(iso) {
  if (!iso) return "";
  const d = new Date(iso.length <= 19 ? iso : iso); const s = (Date.now() - d.getTime()) / 1000;
  if (isNaN(s)) return short(iso);
  if (s < 60) return "방금";
  if (s < 3600) return Math.floor(s / 60) + "분 전";
  if (s < 86400) return Math.floor(s / 3600) + "시간 전";
  if (s < 86400 * 7) return Math.floor(s / 86400) + "일 전";
  return short(iso);
}
const store = {
  get(k, d) { try { const v = localStorage.getItem("ah." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("ah." + k, JSON.stringify(v)); } catch {} },
};

// ---------- 테마(시스템·밝게·어둡게) ----------
function applyTheme(th) { if (th === "light" || th === "dark") document.documentElement.dataset.theme = th; else delete document.documentElement.dataset.theme; }
applyTheme(store.get("theme", "system"));
function setTheme(th) { store.set("theme", th); applyTheme(th); }
function themePicker() {
  const cur = store.get("theme", "system");
  return h("div", { class: "btn-group", role: "radiogroup", "aria-label": "테마" }, [["system", "시스템 따름"], ["light", "밝게"], ["dark", "어둡게"]].map(([v, l]) =>
    h("button", { class: "btn" + (cur === v ? " sel" : " subtle"), role: "radio", "aria-checked": cur === v ? "true" : "false", onclick: (e) => { setTheme(v); const g = e.currentTarget.parentElement; g.replaceWith(themePicker()); } }, l)));
}

// ---------- 아이콘 ----------
const ICON = {
  summary: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  board: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  automation: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  agents: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 12 0v1"/><path d="M16 4a4 4 0 0 1 0 8M22 21v-1a6 6 0 0 0-4-5.6"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  warn: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  err: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
  ok: '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
  apps: '<path d="M5 5h.01M12 5h.01M19 5h.01M5 12h.01M12 12h.01M19 12h.01M5 19h.01M12 19h.01M19 19h.01" stroke-width="3.2"/>',
  play: '<path d="m7 4 13 8-13 8z"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M5 21h14"/>',
  dollar: '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14 9l2 2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4M6 13l3-3 3 2 5-5"/>',
  keyboard: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M8 16h8"/>',
};
function ic(name, size = 16, sw = 2) {
  return h("span", { class: "ico", style: `display:inline-flex;width:${size}px;height:${size}px`, "aria-hidden": "true",
    html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ICON[name] || ""}</svg>` });
}

// ---------- 도메인 표시 ----------
const STATUS = { queued: "대기", running: "작업 중", validating: "검수 중", awaiting_approval: "승인 대기", validation_failed: "검수 실패", approved: "승인됨", rejected: "반려됨", error: "오류" };
const STATUS_LZ = { queued: "", running: "blue", validating: "blue", awaiting_approval: "yellow", validation_failed: "red", approved: "green", rejected: "", error: "red" };
const STATUS_COLOR = { queued: "#8590A2", running: "#1D7AFC", validating: "#8F7EE7", awaiting_approval: "#F5CD47", validation_failed: "#F87168", approved: "#4BCE97", rejected: "#626F86", error: "#AE2E24" };
const OPEN = ["awaiting_approval", "validation_failed"];
const COLUMNS = [
  { id: "todo", title: "대기·작업 중", st: ["queued", "running"] },
  { id: "review", title: "검수", st: ["validating", "validation_failed"] },
  { id: "approve", title: "승인 대기", st: ["awaiting_approval"] },
  { id: "done", title: "완료", st: ["approved"], done: true },
  { id: "rej", title: "반려·오류", st: ["rejected", "error"] },
];
const ACCOUNTS = {};      // 인스타그램 도구 설정의 계정(id → 이름). 상태를 받을 때마다 채운다(syncTools).
const PLAN_DEFAULTS = {};  // 계정별 캘린더 기본 주제
const TOOL = {};           // 도구 ID → 도구 정보(S.tools)
function syncTools() {
  for (const o of [ACCOUNTS, PLAN_DEFAULTS, TOOL]) for (const k of Object.keys(o)) delete o[k];
  for (const a of S.accounts || []) { ACCOUNTS[a.id] = a.label || a.id; PLAN_DEFAULTS[a.id] = { main: a.main || "", topics: a.topics || [] }; }
  for (const t of S.tools || []) TOOL[t.id] = t;
  if (ui.cal && !ACCOUNTS[ui.cal.account]) ui.cal.account = Object.keys(ACCOUNTS)[0] || "";
}
const toolName = (id) => (TOOL[id || "instagram"] || {}).name || id || "인스타그램";
const runTools = () => (S.tools || []).filter((t) => t.enabled && t.run && t.run.agent);
const AGENT_STATE = { active: ["사용 중", "green"], optional: ["선택", "blue"], planned: ["예정", ""] };
const lz = (status) => h("span", { class: "lz " + (STATUS_LZ[status] || "") }, STATUS[status] || status);
const PALETTE = ["#1D7AFC", "#1F845A", "#8F7EE7", "#E2B203", "#F38A3F", "#C9372C", "#2898BD", "#943D73", "#5B7F24", "#AE4787"];
function hashColor(s) { let x = 0; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[x % PALETTE.length]; }
function initials(name) {
  if (!name) return "?";
  if (name === "사람") return "나";
  if (/[가-힣]/.test(name)) return name.slice(0, 1);
  const p = String(name).split(/[-_.\s]+/).filter(Boolean);
  return ((p[0] || "")[0] + ((p[1] || "")[0] || (p[0] || "")[1] || "")).toUpperCase();
}
const avatar = (name, cls = "", title) => h("span", { class: "avatar " + cls, style: `--av:${hashColor(name)}`, title: title || name }, initials(name));
const typeIcon = (title = "릴스 패키지") => h("span", { class: "issue-type", style: "background:#8F7EE7", title }, ic("play", 10, 3));

// ---------- 상태 ----------
let S = null;               // /api/state
let sig = "";               // 변경 감지
let route = { page: "summary", id: null };
let lastPage = "board";
let query = "";
let installEvt = null;
const ui = {
  boardAccount: store.get("boardAccount", ""), boardAgent: "", boardOnlyErr: false, boardGroup: store.get("boardGroup", ""), closedLanes: [],
  listSort: store.get("listSort", { key: "created", dir: -1 }),
  inboxTab: "open", inboxSel: null,
  actTab: "all", showPlanned: store.get("showPlanned", false), closedGroups: store.get("closedGroups", []),
};
const agentTitle = {};      // name → 한국어 이름
function indexAgents() { for (const g of monGroups()) for (const a of g.agents) agentTitle[a.name] = a.title; }
function keyOf(run) {
  const all = [...S.runs].sort((a, b) => (a.created < b.created ? -1 : 1));
  const n = all.findIndex((r) => r.id === run.id) + 1;
  return ((S.branding && S.branding.logo_text) || "AH").toUpperCase() + "-" + (n || "?");
}
function filtered(runs) {
  const q = query.trim().toLowerCase();
  return runs.filter((r) => !q || [r.topic, r.agent, r.account, keyOf(r), STATUS[r.status], agentTitle[r.agent]].some((x) => String(x || "").toLowerCase().includes(q)));
}

// ---------- 껍데기(상단·사이드바) ----------
const NAV = [
  { page: "summary", label: "오늘 할 일", icon: "summary" },
  { sec: "작업 순서" },
  { page: "make", label: "1. 만들기", icon: "plus" },
  { page: "board", label: "2. 진행 확인", icon: "board" },
  { page: "inbox", label: "3. 승인하기", icon: "inbox", count: true },
  { page: "publish", label: "4. 게시하기", icon: "download", pcount: true },
  { sec: "보기" },
  { page: "list", label: "목록", icon: "list" },
  { page: "calendar", label: "캘린더", icon: "calendar" },
  { sec: "운영" },
  { page: "tools", label: "도구", icon: "tool" },
  { page: "automation", label: "자동화", icon: "automation" },
  { page: "agents", label: "에이전트", icon: "agents" },
  { page: "hr", label: "인사", icon: "shield" },
  { page: "monitor", label: "모니터", icon: "monitor" },
  { page: "activity", label: "활동", icon: "activity" },
];
const TITLES = { tools: "도구", make: "1. 만들기", publish: "4. 게시하기", summary: "오늘 할 일", board: "보드", list: "목록", calendar: "캘린더", inbox: "승인함", automation: "자동화", agents: "에이전트", hr: "인사", monitor: "모니터", activity: "활동", settings: "설정" };

const STEPS = [
  { page: "make", label: "만들기", desc: "도구를 고르고 에이전트에게 일을 맡깁니다." },
  { page: "board", label: "진행 확인", desc: "에이전트가 만들고 규칙 검수기가 확인하는 중입니다. 검수 실패는 다시 만듭니다." },
  { page: "inbox", label: "승인하기", desc: "결과물을 보고 승인(게시 준비 완료) 또는 반려합니다." },
  { page: "publish", label: "게시하기", desc: "캡션·소개 댓글을 복사해 인스타 「콘텐츠 예약」으로 직접 올립니다. 자동 게시는 없습니다." },
];
function postedIds() { return new Set(store.get("posted", [])); }
function nowStep() {
  if (S.runs.some((r) => r.status === "awaiting_approval")) return 2;
  if (S.runs.some((r) => r.status === "approved" && !postedIds().has(r.id))) return 3;
  if (S.runs.some((r) => ["queued", "running", "validating"].includes(r.status))) return 1;
  return 0;
}
function stepGuide(i) {
  const s = STEPS[i], nx = STEPS[i + 1], cur = nowStep();
  return h("div", { class: "step-guide" + (cur === i ? " now" : "") },
    h("span", { class: "sg-n" }, i + 1), h("div", { class: "grow" }, h("b", {}, `${i + 1}단계 · ${s.label}`), h("div", { class: "small" }, s.desc)),
    cur !== i ? h("a", { class: "btn sm", href: "#" + STEPS[cur].page }, `지금 할 단계: ${cur + 1}. ${STEPS[cur].label}`) : h("span", { class: "lz blue" }, "지금 할 단계"),
    nx ? h("a", { class: "btn sm subtle", href: "#" + nx.page }, `다음: ${i + 2}. ${nx.label} →`) : null);
}

function buildShell() {
  const app = $("#app"); app.replaceChildren();
  const search = h("input", { id: "q", type: "search", placeholder: "검색", "aria-label": "검색", autocomplete: "off",
    oninput: (e) => { query = e.target.value; if (!["board", "list", "inbox"].includes(route.page)) { quickSearch(); return; } renderPage(true); },
    onfocus: () => { if (query && !["board", "list", "inbox"].includes(route.page)) quickSearch(); },
    onblur: () => setTimeout(closePop, 150),
    onkeydown: (e) => { if (e.key === "Enter" && !["board", "list"].includes(route.page)) { closePop(); go("list"); } if (e.key === "Escape") { e.target.value = ""; query = ""; e.target.blur(); renderPage(true); } } });
  const top = h("header", { class: "topbar" },
    h("button", { class: "tb-icon", title: "사이드바 접기·펴기", "aria-label": "사이드바 접기·펴기", onclick: toggleSidebar }, ic("apps", 20)),
    h("a", { class: "tb-brand", href: "#summary" }, h("span", { class: "logo", id: "logo" }, "AH"), h("span", { id: "product" }, "Agent Hub")),
    h("nav", { class: "tb-nav tb-steps", "aria-label": "작업 순서" },
      STEPS.map((s, i) => [i ? h("span", { class: "tb-arrow", "aria-hidden": "true" }, "→") : null, h("a", { href: "#" + s.page, "data-p": s.page }, h("b", {}, i + 1), s.label)])),
    h("button", { class: "btn primary tb-create", onclick: () => go("make"), title: "만들기 (C)" }, ic("plus", 16), "만들기"),
    h("span", { class: "tb-spacer" }),
    h("span", { class: "tb-usage", id: "usage" }),
    h("label", { class: "tb-search pop-anchor" }, ic("search", 16), search, h("kbd", {}, "/")),
    h("button", { class: "btn hide", id: "install", title: "이 PC에 앱으로 설치", onclick: installApp }, ic("download", 16), "앱으로 설치"),
    h("span", { class: "pop-anchor" }, h("button", { class: "tb-icon", id: "bell", title: "알림", "aria-label": "알림", onclick: (e) => { e.stopPropagation(); toggleBell(); } }, ic("bell", 20), h("b", { class: "bell-n hide", id: "bell-n" }, ""))),
    h("button", { class: "tb-icon", title: "단축키 (?)", "aria-label": "단축키", onclick: openShortcuts }, ic("help", 20)),
    h("a", { class: "tb-icon", href: "#settings", title: "설정", "aria-label": "설정" }, ic("settings", 20)),
    h("span", { class: "pop-anchor", style: "margin-left:4px" }, h("button", { class: "tb-icon", id: "me", "aria-label": "내 메뉴", title: "내 메뉴", onclick: (e) => { e.stopPropagation(); toggleMe(); } }, avatar("사람", "", "나(승인 담당)"))));
  const side = h("aside", { class: "sidebar", "aria-label": "프로젝트 메뉴" },
    h("div", { class: "sb-project" }, h("span", { class: "avatar sq", id: "proj-av", style: "--av:#0C66E4" }, "AH"),
      h("div", {}, h("b", { id: "proj-name" }, "Agent Hub"), h("small", { id: "proj-sub" }, "에이전트 운영 프로젝트"))),
    h("div", { class: "sb-scroll" }, NAV.map((n) => n.sec ? h("div", { class: "sb-sec" }, n.sec)
      : h("a", { class: "sb-item", href: "#" + n.page, "data-p": n.page, title: n.label }, ic(n.icon, 20), h("span", {}, n.label), n.count ? h("b", { class: "sb-count hot hide", id: "badge" }, "0") : null, n.pcount ? h("b", { class: "sb-count hide", id: "pbadge" }, "0") : null))),
    h("div", { class: "sb-foot" }, h("a", { class: "sb-item", href: "#settings", "data-p": "settings", title: "설정" }, ic("settings", 20), h("span", {}, "프로젝트 설정"))));
  const collapse = h("button", { class: "sb-collapse", title: "사이드바 접기·펴기", "aria-label": "사이드바 접기·펴기", onclick: toggleSidebar }, ic("chevL", 14, 2.5));
  const main = h("main", { class: "main" }, h("div", { id: "banner", class: "banner hide" }), h("div", { id: "page" }));
  // 모바일: 아래 탭 막대(자주 보는 5곳) + 「더보기」를 누르면 옆 메뉴가 서랍처럼 열린다
  const mob = h("nav", { class: "mobnav", "aria-label": "주요 메뉴" },
    [["summary", "오늘", "summary"], ["board", "진행", "board"], ["inbox", "승인", "inbox"], ["monitor", "모니터", "monitor"]].map(([pg, label, icon]) =>
      h("a", { href: "#" + pg, "data-p": pg }, ic(icon, 22), h("span", {}, label), pg === "inbox" ? h("b", { class: "mb-badge hide" }, "0") : null)),
    h("button", { type: "button", "aria-label": "전체 메뉴", onclick: () => document.body.classList.toggle("mob-menu") }, ic("apps", 22), h("span", {}, "더보기")));
  const scrim = h("div", { class: "mob-scrim", onclick: () => document.body.classList.remove("mob-menu") });
  app.append(top, side, collapse, main, mob, scrim, h("div", { id: "modal-root" }), h("div", { class: "flags", id: "flags", "aria-live": "polite" }));
  if (store.get("sbMini", false)) document.body.classList.add("sb-mini");
  if (installEvt) $("#install").classList.remove("hide");
}
function toggleSidebar() { document.body.classList.toggle("sb-mini"); store.set("sbMini", document.body.classList.contains("sb-mini")); }

function applyBranding(b, version) {
  if (!b) return;
  const name = b.product_name || "Agent Hub", logo = (b.logo_text || "AH").slice(0, 3);
  document.title = name + (route.page ? " · " + (TITLES[route.page] || "") : "");
  for (const el of $$("#logo, #proj-av, .login-card .logo")) el.textContent = logo;
  if ($("#product")) $("#product").textContent = name;
  if ($("#proj-name")) $("#proj-name").textContent = b.customer_name || name;
  if ($("#proj-sub")) $("#proj-sub").textContent = name + (version ? " v" + version : "");
  if (b.accent) {
    document.documentElement.style.setProperty("--logo", b.accent);
    for (const el of $$("#logo, #proj-av, .login-card .logo")) el.style.background = b.accent;
    const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.content = b.accent;
  }
}

function updateChrome() {
  const lic = S.license || {}, banner = $("#banner");
  if (lic.mode === "expired") { banner.className = "banner bad"; banner.replaceChildren(ic("warn", 16), "평가 기간이 끝났습니다. ", h("a", { href: "#settings" }, "설정에서 라이선스 키를 입력"), "하면 다시 실행할 수 있습니다."); }
  else if (lic.mode === "trial") { banner.className = "banner"; banner.replaceChildren(ic("clock", 16), `평가판 — ${lic.days_left}일 남음 (${lic.expires}까지). `, h("a", { href: "#settings" }, "라이선스 키 입력")); }
  else banner.className = "banner hide";
  const waiting = S.runs.filter((r) => OPEN.includes(r.status)).length;
  const b = $("#badge"); if (b) { b.textContent = waiting; b.classList.toggle("hide", !waiting); }
  for (const mb of $$(".mb-badge")) { mb.textContent = waiting > 99 ? "99+" : waiting; mb.classList.toggle("hide", !waiting); }
  const toPost = S.runs.filter((r) => r.status === "approved" && !postedIds().has(r.id)).length;
  const pb = $("#pbadge"); if (pb) { pb.textContent = toPost; pb.classList.toggle("hide", !toPost); }
  const u = S.usage;
  $("#usage").textContent = `오늘 ${usd(u.total_usd)} / ${usd(u.budget_usd)}`;
  $("#usage").title = "오늘 API 비용 / 하루 한도 · 갱신 " + new Date().toTimeString().slice(0, 8);
  const seen = store.get("bellSeen", "");
  const fresh = S.events.filter((e) => (e.kind === "blocked" || e.kind === "status") && (e.ts || "") > seen).length;
  const bn = $("#bell-n"); if (bn) { bn.textContent = fresh > 9 ? "9+" : fresh; bn.classList.toggle("hide", !fresh); }
  const navPage = route.page === "issue" ? lastPage : route.page;
  for (const a of $$(".sb-item, .tb-nav a, .mobnav a")) a.classList.toggle("on", a.dataset.p === navPage);
}

// ---------- 라우팅 ----------
const ALIAS = { home: "summary", flow: "automation", log: "activity", "": "summary" };
function parseHash() {
  const raw = decodeURIComponent(location.hash.slice(1));
  if (raw.startsWith("issue/")) return { page: "issue", id: raw.slice(6) };
  const p = ALIAS[raw] != null ? ALIAS[raw] : raw;
  return { page: TITLES[p] ? p : "summary", id: null };
}
function go(page) { location.hash = page; }
let flowMounted = false;
function onRoute() {
  const prev = route.page;
  route = parseHash();
  if (route.page !== "issue") { closeModal(true); if (route.page !== prev || !$("#page").childElementCount) { if (route.page !== "automation") flowMounted = false; renderPage(); window.scrollTo(0, 0); } lastPage = route.page; }
  else { if (!$("#page").childElementCount || prev === "issue" && !$(".blanket")) { renderPage(); } openIssueModal(route.id); }
  if (S) { updateChrome(); applyBranding(S.branding, S.version); }
}

// ---------- 데이터 갱신 ----------
async function refresh(force) {
  let r;
  try { r = await api("/api/state"); } catch { return; }
  if (r.status === 401) { const s = (await api("/api/session")).data; showLogin(s); return; }
  if (!r.ok) return;
  const first = !S;
  S = r.data; indexAgents(); syncTools();
  if (first || !$(".topbar")) { buildShell(); route = parseHash(); }
  applyBranding(S.branding, S.version);
  updateChrome();
  notifyNew();
  const nsig = JSON.stringify([S.runs, S.events.length, S.events.slice(-1), S.live, S.license, S.usage.total_usd, S.groups.map((g) => g.flow_order), Object.entries((S.hr || {}).agents || {}).map(([k, v]) => k + v.status + v.on_shift)]);   // 인사 변화(출퇴근·징계)도 화면에 바로
  const changed = nsig !== sig; sig = nsig;
  if (first) { onRoute(); return; }
  if (changed || force) renderPage(true);
}

function busyTyping() {
  const a = document.activeElement;
  return a && ["INPUT", "TEXTAREA", "SELECT"].includes(a.tagName) && a.id !== "q";
}

// ---------- 데스크톱 알림(자리를 떠나 있어도 승인·차단을 바로 알기) ----------
let notifySeen = null;
function notifyOn() { return store.get("notify", false) && "Notification" in window && Notification.permission === "granted"; }
function notifyNew() {
  const keys = new Set([...S.runs.filter((r) => r.status === "awaiting_approval").map((r) => "a:" + r.id),
    ...S.events.filter((e) => e.kind === "blocked").map((e) => "b:" + e.ts + (e.tool || ""))]);
  if (notifySeen === null) { notifySeen = keys; return; }  // 처음 열 때는 알리지 않는다
  const fresh = [...keys].filter((k) => !notifySeen.has(k)); notifySeen = keys;
  if (!fresh.length || !notifyOn()) return;
  for (const k of fresh.slice(0, 3)) {
    try {
      if (k.startsWith("a:")) { const r = S.runs.find((x) => "a:" + x.id === k); const n = new Notification("승인 기다림 — " + keyOf(r), { body: r.topic || "", tag: k, icon: "/icons/icon-192.png" }); n.onclick = () => { window.focus(); location.hash = "issue/" + r.id; n.close(); }; }
      else { const e = S.events.find((x) => "b:" + x.ts + (x.tool || "") === k); const n = new Notification("훅이 막음 — " + (agentTitle[e.agent] || e.agent || "에이전트"), { body: [e.tool, e.reason].filter(Boolean).join(" · "), tag: k, icon: "/icons/icon-192.png" }); n.onclick = () => { window.focus(); location.hash = "monitor"; n.close(); }; }
    } catch {}
  }
}
async function toggleNotify(btn) {
  if (store.get("notify", false)) { store.set("notify", false); flag("info", "데스크톱 알림을 껐습니다", ""); }
  else if (!("Notification" in window)) { flag("err", "이 브라우저는 알림을 지원하지 않습니다", ""); }
  else { const p = await Notification.requestPermission(); if (p === "granted") { store.set("notify", true); flag("ok", "데스크톱 알림을 켰습니다", "승인 기다림·훅 차단이 새로 생기면 알려 드립니다."); } else flag("err", "알림이 허용되지 않았습니다", "브라우저 주소창 왼쪽 자물쇠에서 알림을 허용하세요."); }
  if (btn) btn.replaceWith(notifyButton());
}
function notifyButton() { const on = store.get("notify", false); return h("button", { class: "btn" + (on ? " sel" : ""), onclick: (e) => toggleNotify(e.currentTarget) }, ic("bell", 16), on ? "데스크톱 알림 켜짐" : "데스크톱 알림 켜기"); }

// ---------- 페이지 그리기 ----------
function pageHead(title, crumbs, actions) {
  return [h("nav", { class: "crumbs", "aria-label": "위치" }, h("a", { href: "#summary" }, "프로젝트"), h("span", { class: "sep" }, "/"),
      h("a", { href: "#summary" }, (S.branding && (S.branding.customer_name || S.branding.product_name)) || "Agent Hub"), ...(crumbs || []).flatMap((c) => [h("span", { class: "sep" }, "/"), c])),
    h("div", { class: "page-head" }, h("h1", {}, title), actions ? h("div", { class: "actions" }, actions) : null)];
}
function renderPage(isUpdate) {
  if (!S) return;
  const page = route.page === "issue" ? lastPage : route.page;
  if (isUpdate && (busyTyping() || dragRun || pressing || $(".popover"))) return;  // 입력·끌기·팝오버 중에는 다시 그리지 않는다
  if (page === "automation") { if (isUpdate && flowMounted) return; return renderAutomation(); }
  const root = $("#page");
  const y = window.scrollY;
  const fn = { tools: renderTools, make: renderMake, publish: renderPublish, summary: renderSummary, board: renderBoard, list: renderList, calendar: renderCalendar, inbox: renderInbox, agents: renderAgents, hr: renderHr, monitor: renderMonitor, activity: renderActivity, settings: renderSettings }[page] || renderSummary;
  fn(root, isUpdate);
  if (isUpdate) window.scrollTo(0, y);
  if (route.page === "issue" && isUpdate) refreshIssueModal();
}

// ---------- 요약 ----------
function renderSummary(root) {
  const runs = S.runs, u = S.usage;
  const count = (st) => runs.filter((r) => st.includes(r.status)).length;
  const today = new Date().toISOString().slice(0, 10);
  const pct = u.budget_usd ? Math.min(100, (u.total_usd / u.budget_usd) * 100) : 0;
  const stat = (icon, color, n, label, href) => h("a", { class: "card stat", href, style: "color:inherit;text-decoration:none" },
    h("span", { class: "ic", style: `background:${color}22;color:${color}` }, ic(icon, 20)), h("div", {}, h("b", {}, n), h("span", {}, label)));
  const stats = h("div", { class: "grid g4" },
    stat("inbox", "#E2B203", count(["awaiting_approval"]), "승인 대기", "#inbox"),
    stat("err", "#C9372C", count(["validation_failed", "error"]), "검수 실패·오류", "#board"),
    stat("ok", "#1F845A", runs.filter((r) => r.status === "approved" && (r.created || "").startsWith(today)).length + " / " + count(["approved"]), "오늘 완료 / 전체 완료", "#list"),
    stat("dollar", "#1D7AFC", usd(u.total_usd), `오늘 비용 · 한도 ${usd(u.budget_usd)}`, "#settings"));

  // 상태 개요(도넛)
  const byStatus = Object.keys(STATUS).map((k) => [k, count([k])]).filter(([, n]) => n);
  const total = runs.length;
  const R = 52, C = 2 * Math.PI * R; let off = 0;
  const arcs = byStatus.map(([k, n]) => { const len = (n / total) * C; const s = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${STATUS_COLOR[k]}" stroke-width="18" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"><title>${STATUS[k]} ${n}</title></circle>`; off += len; return s; }).join("");
  const donut = h("div", { class: "card" }, h("div", { class: "card-h" }, h("h3", {}, "상태 개요"), h("span", { class: "small" }, "최근 100건")),
    total ? h("div", { class: "donut-wrap" },
      h("div", { html: `<svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="상태별 건수"><circle r="${R}" cx="70" cy="70" fill="none" stroke="var(--neutral)" stroke-width="18"/>${arcs}<text x="70" y="66" text-anchor="middle" font-size="24" font-weight="600" fill="currentColor">${total}</text><text x="70" y="86" text-anchor="middle" font-size="12" fill="var(--text-subtle)">전체 건수</text></svg>` }),
      h("div", { class: "legend" }, byStatus.map(([k, n]) => h("div", {}, h("span", { class: "dot", style: `background:${STATUS_COLOR[k]}` }), `${STATUS[k]} `, h("b", {}, n)))))
      : emptyState("아직 실행이 없습니다", "아래 「시험 실행」으로 예시를 만들어 보세요."));

  // 에이전트별 작업량
  const per = {};
  for (const r of runs) per[r.agent] = (per[r.agent] || 0) + 1;
  const max = Math.max(1, ...Object.values(per));
  const load = h("div", { class: "card" }, h("div", { class: "card-h" }, h("h3", {}, "에이전트별 작업량"), h("span", { class: "small" }, "건수 · 오늘 비용")),
    Object.keys(per).length ? Object.entries(per).sort((a, b) => b[1] - a[1]).map(([name, n]) => h("div", { class: "wl-row" },
      h("div", { class: "who" }, avatar(name), h("span", {}, agentTitle[name] || name)),
      h("div", { class: "bar", title: `${n}건` }, h("i", { style: `width:${(n / max) * 100}%;background:${hashColor(name)}` })),
      h("b", { class: "small", style: "text-align:right" }, n))) : h("div", { class: "small" }, "실행 기록이 없습니다."),
    h("div", { style: "margin-top:12px" }, h("div", { class: "row small", style: "justify-content:space-between;margin-bottom:6px" }, h("span", {}, "오늘 API 한도"), h("span", {}, `${usd(u.total_usd)} / ${usd(u.budget_usd)}`)),
      h("div", { class: "progress" + (pct > 90 ? " bad" : pct > 70 ? " warn" : "") }, h("i", { style: `width:${pct}%` }))));

  // 최근 활동
  const feed = h("div", { class: "card" }, h("div", { class: "card-h" }, h("h3", {}, "최근 활동"), h("a", { class: "small", href: "#activity" }, "모두 보기")),
    activityList([...S.events].reverse().slice(0, 7)));

  // 그룹 개요
  const groups = h("div", { class: "grid g3" }, S.groups.map((g) => {
    const active = g.agents.filter((a) => a.state === "active").length;
    return h("a", { class: "card group-card", href: "#agents", style: "color:inherit;text-decoration:none" },
      h("div", { class: "row" }, avatar(g.lead, "sq", "리드 " + g.lead), h("b", { class: "grow" }, g.title), h("span", { class: "lz " + (active ? "green" : "") }, `사용 중 ${active}/${g.agents.length}`)),
      g.purpose ? h("div", { class: "small", style: "margin-top:8px" }, g.purpose) : null,
      h("div", { class: "agents" }, g.agents.slice(0, 9).map((a) => h("span", { style: a.state === "planned" ? "opacity:.45" : "" }, avatar(a.name, "", `${a.title} (${(AGENT_STATE[a.state] || [a.state])[0]})`)))));
  }));

  const cur = nowStep();
  const cnt = [S.runs.filter((r) => ["queued", "running", "validating"].includes(r.status)).length, count(["validation_failed", "error"]),
    count(["awaiting_approval"]), S.runs.filter((r) => r.status === "approved" && !postedIds().has(r.id)).length];
  const errs = runs.filter((r) => r.status === "error").slice(0, 3);
  const stepCards = h("div", { class: "grid g4 step-cards" }, STEPS.map((s, i) => h("a", { class: "card step-card" + (i === cur ? " now" : ""), href: "#" + s.page },
    h("div", { class: "row" }, h("span", { class: "sg-n" }, i + 1), h("b", {}, s.label), i === cur ? h("span", { class: "lz blue", style: "margin-left:auto" }, "지금") : null),
    h("div", { class: "small", style: "margin:8px 0" }, s.desc),
    h("div", { class: "sc-n" }, [i === 0 ? `작업 중 ${cnt[0]}` : i === 1 ? `다시 만들 것 ${cnt[1]}` : i === 2 ? `승인 기다림 ${cnt[2]}` : `게시할 것 ${cnt[3]}`]))));
  const nowCard = h("div", { class: "card now-card" }, h("div", { class: "small" }, "지금 할 단계"),
    h("h2", { style: "margin:4px 0 6px;font-size:22px" }, `${cur + 1}. ${STEPS[cur].label}`), h("div", { class: "muted" }, STEPS[cur].desc),
    h("a", { class: "btn primary", style: "margin-top:12px", href: "#" + STEPS[cur].page }, `${STEPS[cur].label} 하러 가기 →`));
  const errBox = errs.length ? h("div", { class: "msg err", style: "margin-top:16px" }, ic("err", 20), h("div", { class: "grow" }, h("h4", {}, `실행 오류 ${count(["error"])}건 — 에이전트가 끝까지 못 만들었어요`),
    h("ul", {}, errs.map((r) => h("li", {}, h("a", { href: "#issue/" + r.id }, keyOf(r)), " ", r.topic || "")) ), h("div", { class: "small" }, "눌러서 오류 내용을 보고 「같은 주제로 다시 만들기」를 누르세요."))) : null;
  const more = h("details", { class: "more-stats", open: store.get("moreStats", false) }, h("summary", {}, "현황 자세히 보기(건수·그래프·활동)"),
    stats, h("div", { class: "grid g2", style: "margin-top:16px" }, donut, load), h("div", { class: "grid g2", style: "margin-top:16px" }, feed, recentCard()),
    h("h2", { class: "sec" }, "에이전트 그룹"), groups);
  more.addEventListener("toggle", () => store.set("moreStats", more.open));
  root.replaceChildren(...pageHead("오늘 할 일", [], [h("button", { class: "btn", onclick: () => refresh(true) }, ic("refresh", 16), "새로고침")]),
    startCard(root), nowCard, errBox, h("h2", { class: "sec" }, "작업 순서"), stepCards, more);
  root.className = "page";
}
// 처음 쓰는 사람을 위한 「시작하기」 — 확인할 수 있는 건 자동으로, 나머지는 「했어요」로 표시
function startCard(root) {
  if (store.get("startHidden", false)) return null;
  const manual = store.get("startDone", {});
  const standalone = window.matchMedia && matchMedia("(display-mode: standalone), (display-mode: window-controls-overlay)").matches;
  const steps = [
    { id: "demo", t: "시험 실행으로 승인 흐름 보기", d: "비용 없이 가짜 결과물로 보드·승인함을 확인합니다.", done: S.runs.length > 0, act: ["시험 실행", openCreate] },
    { id: "key", t: "Anthropic API 키 넣기", d: "설정 → 「API 키」에 키를 붙여 넣고 저장합니다. 키 하나로 모든 에이전트 비용이 집계됩니다.", done: (S.keys || []).some((k) => k.name === "ANTHROPIC_API_KEY" && k.set), act: ["설정 열기", () => go("settings")] },
    { id: "real", t: "첫 실제 실행", d: "「만들기」 창에서 명령을 복사해 PC 터미널에서 실행합니다(비용 발생).", done: S.runs.some((r) => (r.cost_usd || 0) > 0), act: ["명령 만들기", openCreate] },
    { id: "app", t: "앱으로 설치", d: "주소창 없는 창으로 열리고 작업 표시줄에 고정할 수 있습니다.", done: standalone || store.get("installed", false), act: installEvt ? ["설치", installApp] : ["방법 보기", () => go("settings")] },
    { id: "auto", t: "PC 켤 때 자동 실행", d: "autostart-on.bat 을 한 번 실행하면 서버가 창 없이 켜집니다.", manual: true },
  ];
  for (const s of steps) if (s.manual) s.done = !!manual[s.id];
  const n = steps.filter((s) => s.done).length;
  if (n === steps.length) return null;
  const mark = (id) => { const m = store.get("startDone", {}); m[id] = !m[id]; store.set("startDone", m); renderSummary(root); };
  return h("div", { class: "card start-card", style: "margin-bottom:16px" },
    h("div", { class: "card-h" }, h("h3", {}, "시작하기"), h("span", { class: "small", style: "margin-left:8px" }, `${n} / ${steps.length} 완료`),
      h("button", { class: "btn subtle sm", style: "margin-left:auto", onclick: () => { store.set("startHidden", true); renderSummary(root); } }, "숨기기")),
    h("div", { class: "progress", style: "margin-bottom:12px" }, h("i", { style: `width:${(n / steps.length) * 100}%;background:var(--success-bold)` })),
    h("ol", { class: "start-steps" }, steps.map((s) => h("li", { class: s.done ? "done" : "" },
      h("span", { class: "chk" }, s.done ? ic("check", 14, 3) : null),
      h("div", { class: "grow" }, h("b", {}, s.t), h("div", { class: "small" }, s.d)),
      s.done ? (s.manual ? h("button", { class: "btn subtle sm", onclick: () => mark(s.id) }, "되돌리기") : h("span", { class: "lz green" }, "완료"))
        : s.manual ? h("button", { class: "btn sm", onclick: () => mark(s.id) }, "했어요") : s.act ? h("button", { class: "btn sm", onclick: s.act[1] }, s.act[0]) : null))));
}
function recentCard() {
  const runs = S.runs.slice(0, 6);
  return h("div", { class: "card" }, h("div", { class: "card-h" }, h("h3", {}, "최근 작업"), h("a", { class: "small", href: "#list" }, "목록에서 보기")),
    runs.length ? h("div", {}, runs.map((r) => h("a", { class: "row", href: "#issue/" + r.id, style: "padding:8px 4px;border-bottom:1px solid var(--border);color:inherit;text-decoration:none;flex-wrap:nowrap" },
      typeIcon(), h("span", { class: "key" }, keyOf(r)), h("span", { class: "grow", style: "white-space:nowrap;overflow:hidden;text-overflow:ellipsis" }, r.topic || "(주제 없음)"), lz(r.status), avatar(r.agent))))
      : emptyState("작업이 없습니다", ""));
}
function emptyState(title, text, action) {
  return h("div", { class: "empty" }, h("div", { html: '<svg width="96" height="72" viewBox="0 0 96 72" fill="none"><rect x="10" y="14" width="76" height="50" rx="6" fill="var(--neutral)"/><rect x="20" y="24" width="30" height="6" rx="3" fill="var(--border)"/><rect x="20" y="36" width="56" height="6" rx="3" fill="var(--border)"/><rect x="20" y="48" width="42" height="6" rx="3" fill="var(--border)"/><circle cx="76" cy="16" r="10" fill="var(--selected-bg)"/><path d="M72 16h8M76 12v8" stroke="var(--brand)" stroke-width="2" stroke-linecap="round"/></svg>' }),
    h("b", {}, title), text ? h("div", {}, text) : null, action ? h("div", { style: "margin-top:16px" }, action) : null);
}
function dayLabel(iso) {
  const d = (iso || "").slice(0, 10), now = new Date();
  const fmt = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  return d === fmt(now) ? "오늘" : d === fmt(y) ? "어제" : d;
}
function activityList(events, grouped) {
  if (!events.length) return h("div", { class: "small" }, "기록이 없습니다.");
  if (grouped) {
    const out = []; let last = null;
    for (const e of events) { const l = dayLabel(e.ts); if (l !== last) { out.push([l, []]); last = l; } out[out.length - 1][1].push(e); }
    return h("div", {}, out.map(([l, evs]) => [h("div", { class: "sb-sec", style: "padding:12px 0 0" }, l), activityList(evs)]));
  }
  const KIND = { tool: ["tool", "도구", "#626F86"], blocked: ["shield", "차단", "#C9372C"], status: ["refresh", "상태", "#1D7AFC"] };
  return h("ul", { class: "feed" }, events.map((e) => {
    const [icon, label, color] = KIND[e.kind] || ["info", e.kind, "#626F86"];
    const detail = e.kind === "status" ? String(e.detail || "") : [e.tool, e.reason, e.detail].filter(Boolean).join(" · ");
    const run = e.run && S.runs.find((r) => r.id === e.run);
    return h("li", {}, h("span", { class: "avatar", style: `--av:${color}`, title: label }, ic(icon, 13, 2.4)),
      h("div", { class: "txt" }, h("div", {}, h("b", {}, agentTitle[e.agent] || e.agent || "시스템"), " · ", h("span", { class: "lz " + (e.kind === "blocked" ? "red" : e.kind === "status" ? "blue" : "") }, label), run ? [" ", h("a", { href: "#issue/" + run.id }, keyOf(run))] : null),
        h("div", { class: "muted", style: "overflow-wrap:anywhere" }, detail)),
      h("span", { class: "when", title: ts(e.ts) }, ago(e.ts)));
  }));
}

// ---------- 보드 ----------
function boardToolbar(onChange) {
  const accBtn = (v, label) => h("button", { class: "btn" + (ui.boardAccount === v ? " sel" : " subtle"), onclick: () => { ui.boardAccount = v; store.set("boardAccount", v); onChange(); } }, label);
  const agents = [...new Set(S.runs.map((r) => r.agent))];
  const sinput = h("input", { class: "input", type: "search", placeholder: "이 보드 검색", value: query, "aria-label": "이 보드 검색",
    oninput: (e) => { query = e.target.value; const q = $("#q"); if (q) q.value = query; onChange(); } });
  return h("div", { class: "toolbar" },
    h("label", { class: "search" }, ic("search", 16), sinput),
    agents.length ? h("div", { class: "av-filter", title: "담당 에이전트로 거르기" }, agents.map((a) => h("button", { class: ui.boardAgent === a ? "on" : "", title: agentTitle[a] || a, onclick: () => { ui.boardAgent = ui.boardAgent === a ? "" : a; onChange(); } }, avatar(a)))) : null,
    h("span", { class: "fl-sep" }),
    accBtn("", "전체 계정"), ...Object.entries(ACCOUNTS).map(([k, v]) => accBtn(k, v)),
    h("button", { class: "btn" + (ui.boardOnlyErr ? " sel" : " subtle"), onclick: () => { ui.boardOnlyErr = !ui.boardOnlyErr; onChange(); } }, ic("warn", 14), "오류 있는 것만"),
    h("span", { class: "tb-spacer" }),
    h("label", { class: "row small", style: "flex-wrap:nowrap" }, "묶기",
      h("select", { class: "input", style: "min-height:32px;height:32px;padding:0 8px;width:auto", "aria-label": "묶기", onchange: (e) => { ui.boardGroup = e.target.value; store.set("boardGroup", ui.boardGroup); onChange(); } },
        [["", "없음"], ["account", "계정"], ["agent", "담당"]].map(([v, l]) => h("option", { value: v, selected: ui.boardGroup === v }, l)))));
}
function boardRuns() {
  return filtered(S.runs).filter((r) => (!ui.boardAccount || r.account === ui.boardAccount) && (!ui.boardAgent || r.agent === ui.boardAgent) && (!ui.boardOnlyErr || r.errors));
}
function renderBoard(root, isUpdate) {
  let body = $("#board-body", root);
  if (!isUpdate || !body) {
    body = h("div", { id: "board-body" });
    const tb = h("div", { id: "board-tb" });
    root.replaceChildren(...pageHead("2. 진행 확인", [h("span", {}, "작업 보드")], [h("a", { class: "btn", href: "#make" }, ic("plus", 16), "만들기"), h("a", { class: "btn subtle", href: "#automation" }, ic("automation", 16), "자동화")]), stepGuide(1), tb, body);
    root.className = "page";
  }
  const redraw = () => { $("#board-tb", root).replaceChildren(boardToolbar(redraw)); drawBoard(body); };
  redraw();
}
// 끌어놓기로 바꿀 수 있는 상태: 승인 대기 → 완료(승인) · 승인 대기/검수 실패 → 반려
function dropAction(status, colId) {
  if (colId === "done" && status === "awaiting_approval") return "approve";
  if (colId === "rej" && OPEN.includes(status)) return "reject";
  return null;
}
let dragRun = null, pressing = false;
document.addEventListener("pointerdown", (e) => { pressing = !!(e.target.closest && e.target.closest(".icard, .fl-node")); }, true);
for (const ev of ["pointerup", "pointercancel", "dragend", "blur"]) (ev === "blur" ? window : document).addEventListener(ev, () => { pressing = false; }, true);  // 끌기 중에는 pointerup 대신 pointercancel 이 온다
function drawBoard(body) {
  const runs = boardRuns();
  const laneKey = ui.boardGroup === "account" ? (r) => r.account || "-" : ui.boardGroup === "agent" ? (r) => r.agent : null;
  const laneLabel = (k) => ui.boardGroup === "account" ? [h("span", { class: "tag" }, ACCOUNTS[k] || k)] : [avatar(k), agentTitle[k] || k];
  const lanes = laneKey ? [...new Set(runs.map(laneKey))] : [null];
  const head = h("div", { class: "board board-head" }, COLUMNS.map((c) => {
    const n = runs.filter((r) => c.st.includes(r.status)).length;
    return h("div", { class: "col-h col-top" }, h("span", {}, c.title), h("span", { class: "n" }, n), c.done ? h("span", { class: "done", title: "완료 열" }, ic("check", 14, 3)) : null);
  }));
  const laneEls = lanes.map((lane) => {
    const lr = lane == null ? runs : runs.filter((r) => laneKey(r) === lane);
    const closed = lane != null && ui.closedLanes.includes(lane);
    const grid = h("div", { class: "board board-lane" }, COLUMNS.map((c) => {
      const items = lr.filter((r) => c.st.includes(r.status));
      const col = h("section", { class: "col", "aria-label": c.title + (lane ? " · " + lane : ""), "data-col": c.id,
        ondragover: (ev) => { if (dragRun && dropAction(dragRun.status, c.id)) { ev.preventDefault(); col.classList.add("drop-ok"); } },
        ondragleave: () => col.classList.remove("drop-ok"),
        ondrop: (ev) => { ev.preventDefault(); col.classList.remove("drop-ok"); const r = dragRun; dragRun = null; if (r) { const a = dropAction(r.status, c.id); if (a) confirmDecision(r, a); } } },
        h("div", { class: "col-body" }, items.map(issueCard), !items.length ? h("div", { class: "col-empty" }, "") : null));
      return col;
    }));
    if (lane == null) return grid;
    return h("div", { class: "lane" + (closed ? " closed" : "") },
      h("button", { class: "lane-h", "aria-expanded": closed ? "false" : "true", onclick: () => { ui.closedLanes = closed ? ui.closedLanes.filter((x) => x !== lane) : [...ui.closedLanes, lane]; drawBoard(body); } },
        h("span", { class: "chev" }, ic("chevD", 14, 2.5)), ...laneLabel(lane), h("span", { class: "small" }, `${lr.length}건`)),
      closed ? null : grid);
  });
  body.replaceChildren(h("div", { class: "board-scroll" + (dragRun ? " dragging" : "") }, head, laneEls));
  if (!S.runs.length) body.append(emptyState("보드가 비어 있습니다", "에이전트가 작업을 만들면 여기에 카드로 쌓입니다.", h("button", { class: "btn primary", onclick: openCreate }, "시험 실행 만들기")));
  else if (!runs.length) body.append(emptyState("조건에 맞는 카드가 없습니다", "검색어나 필터를 바꿔 보세요."));
}
function confirmDecision(r, action) {
  const note = h("textarea", { class: "input", rows: "3", placeholder: action === "approve" ? "메모(선택)" : "반려 사유", autofocus: true, "aria-label": "메모" });
  const go = async (btn) => {
    btn.disabled = true;
    const res = await api(`/api/runs/${encodeURIComponent(r.id)}/decision`, { decision: action, note: note.value });
    closeModal(true);
    if (res.ok) flag("ok", action === "approve" ? "승인했습니다" : "반려했습니다", `${keyOf(r)} · ${r.topic || ""}`);
    else flag("err", "처리하지 못했습니다", res.data.error || "실패");
    refresh(true);
  };
  openModal([h("div", { class: "modal-h" }, ic(action === "approve" ? "ok" : "warn", 24), h("h2", {}, `${keyOf(r)} ${action === "approve" ? "승인" : "반려"}할까요?`)),
    h("div", { class: "modal-b" }, h("p", { style: "margin-top:0" }, h("b", {}, r.topic || ""), h("br"),
      action === "approve" ? "「게시 준비 완료」로 표시합니다. 게시·예약은 인스타 콘텐츠 예약에서 직접 합니다." : "반려하면 승인함에서 빠집니다. 다시 만들려면 에이전트를 다시 실행하세요."), note),
    h("div", { class: "modal-f" }, h("button", { class: "btn subtle", onclick: () => closeModal() }, "취소"),
      h("button", { class: "btn " + (action === "approve" ? "primary" : "danger"), id: "confirm-go", onclick: (e) => go(e.currentTarget) }, action === "approve" ? "승인" : "반려"))],
  { size: "sm", label: action === "approve" ? "승인 확인" : "반려 확인" });
}
function issueCard(r) {
  return h("article", { class: "icard" + (r.errors ? " has-err" : ""), tabindex: "0", role: "button", "aria-label": `${keyOf(r)} ${r.topic}`,
    draggable: OPEN.includes(r.status) ? "true" : "false",
    ondragstart: (e) => { dragRun = r; e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", r.id); } catch {} e.currentTarget.classList.add("drag"); document.querySelector(".board-scroll")?.classList.add("dragging"); },
    ondragend: (e) => { e.currentTarget.classList.remove("drag"); document.querySelector(".board-scroll")?.classList.remove("dragging"); setTimeout(() => { dragRun = null; }, 0); },
    onclick: () => openIssue(r.id), onkeydown: (e) => { if (e.key === "Enter") openIssue(r.id); } },
    h("div", { class: "title" }, r.topic || "(주제 없음)"),
    h("div", { class: "meta" }, h("span", { class: "tag" }, (r.account ? ACCOUNTS[r.account] || r.account : toolName(r.tool))),
      r.errors ? h("span", { class: "lz red", title: "검수 오류" }, `오류 ${r.errors}`) : null,
      r.warnings ? h("span", { class: "lz yellow", title: "검수 경고" }, `경고 ${r.warnings}`) : null),
    h("div", { class: "foot" }, typeIcon(), h("span", { class: "key" }, keyOf(r)), r.status === "running" ? h("span", { class: "lz blue" }, "작업 중") : null,
      h("span", { class: "small", title: ts(r.created) }, ago(r.created)), avatar(r.agent, "", "담당: " + (agentTitle[r.agent] || r.agent))));
}
function openIssue(id) { lastPage = route.page === "issue" ? lastPage : route.page; location.hash = "issue/" + id; }

// ---------- 캘린더(한 달 콘텐츠 계획표) ----------
// 벤치마킹: 난이도(주 몇 회) → 요일·시간 → 메인·하위 주제 → 콘텐츠 유형 → 한 달 달력
const PLAN_TYPES = ["흔한 실수", "비교", "할 것·피할 것", "튜토리얼", "비포·애프터", "전문가 의견", "뉴스 해설"];
const LEVEL_DAYS = { "쉬움": [0, 2, 4], "보통": [0, 1, 2, 3, 4], "어려움": [0, 1, 2, 3, 4, 5, 6] };
const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const thisMonth = () => ymd(new Date()).slice(0, 7);
ui.cal = { month: thisMonth(), account: store.get("calAcc", ""), plan: null, key: "" };
const TYPE_LZ = (type) => ["blue", "purple", "green", "yellow", "red", ""][[...String(type)].reduce((a, c) => a + c.charCodeAt(0), 0) % 6];

async function loadPlan(force) {
  const key = ui.cal.month + "/" + ui.cal.account;
  if (!force && ui.cal.plan && ui.cal.key === key) return ui.cal.plan;
  const r = await api(`/api/plans/${key}`);
  ui.cal.plan = r.ok ? r.data : { month: ui.cal.month, account: ui.cal.account, items: [] };
  ui.cal.key = key;
  return ui.cal.plan;
}
async function savePlan(plan, msg) {
  const r = await api(`/api/plans/${plan.month}/${plan.account}`, plan);
  if (r.ok) { ui.cal.plan = r.data.plan; if (msg) flag("ok", msg, `${plan.month} · ${ACCOUNTS[plan.account]}`); }
  else flag("err", "저장하지 못했습니다", r.data.error || "실패");
  renderCalendar($("#page"));
  return r.ok;
}
function shiftMonth(d) {
  const [y, m] = ui.cal.month.split("-").map(Number);
  const nd = new Date(y, m - 1 + d, 1); ui.cal.month = ymd(nd).slice(0, 7); renderCalendar($("#page"));
}
async function renderCalendar(root, isUpdate) {
  root.className = "page";
  if (!isUpdate || !$("#cal-body", root)) {
    const acc = (k, v) => h("button", { class: "btn" + (ui.cal.account === k ? " sel" : " subtle"), onclick: () => { ui.cal.account = k; store.set("calAcc", k); renderCalendar(root); } }, v);
    root.replaceChildren(...pageHead("캘린더", [h("span", {}, "콘텐츠 계획")], [
      h("button", { class: "btn", onclick: () => openPlanMaker() }, ic("automation", 16), "한 달 계획 만들기")]),
      h("div", { class: "toolbar" },
        h("div", { class: "btn-group" }, Object.entries(ACCOUNTS).map(([k, v]) => acc(k, v))),
        h("span", { class: "fl-sep" }),
        h("button", { class: "tb-icon", "aria-label": "이전 달", title: "이전 달", onclick: () => shiftMonth(-1) }, ic("chevL", 18)),
        h("b", { id: "cal-title", style: "min-width:96px;text-align:center;font-size:16px" }, ""),
        h("button", { class: "tb-icon", "aria-label": "다음 달", title: "다음 달", onclick: () => shiftMonth(1) }, h("span", { style: "display:inline-flex;transform:rotate(180deg)" }, ic("chevL", 18))),
        h("button", { class: "btn subtle sm", onclick: () => { ui.cal.month = thisMonth(); renderCalendar(root); } }, "이번 달"),
        h("span", { class: "tb-spacer" }), h("span", { class: "small", id: "cal-sum" })),
      h("div", { id: "cal-body" }, h("div", { class: "small", style: "padding:24px" }, "불러오는 중…")));
  }
  const plan = await loadPlan(false);
  const [y, m] = ui.cal.month.split("-").map(Number);
  $("#cal-title").textContent = `${y}년 ${m}월`;
  const items = plan.items || [];
  $("#cal-sum").textContent = items.length ? `${plan.level || "-"} · 주 ${plan.per_week || "-"}회 · ${items.length}칸${plan.main_topic ? " · 메인 " + plan.main_topic : ""}` : "아직 계획이 없습니다";
  const first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate();
  const lead = (first.getDay() + 6) % 7, today = ymd(new Date());
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(h("div", { class: "cal-cell out" }));
  for (let d = 1; d <= days; d++) {
    const date = `${ui.cal.month}-${pad2(d)}`, wd = (lead + d - 1) % 7;
    const its = items.map((it, idx) => [it, idx]).filter(([it]) => it.date === date);
    const runs = S.runs.filter((r) => (r.created || "").startsWith(date) && r.account === ui.cal.account);
    cells.push(h("div", { class: "cal-cell" + (date === today ? " today" : "") + (wd >= 5 ? " weekend" : ""), "data-date": date,
      ondblclick: (e) => { if (e.target === e.currentTarget) editPlanItem(null, date); } },
      h("div", { class: "cal-d" }, h("span", { class: "n" }, d), its.length ? null : h("button", { class: "cal-add", title: "이 날 계획 추가", "aria-label": `${d}일 계획 추가`, onclick: () => editPlanItem(null, date) }, ic("plus", 14))),
      its.map(([it, idx]) => h("button", { class: "cal-item", onclick: () => editPlanItem(idx) },
        h("div", { class: "row", style: "gap:4px;flex-wrap:nowrap" }, h("span", { class: "lz " + TYPE_LZ(it.type) }, it.type || "유형"), h("span", { class: "small ellipsis" }, it.topic)),
        h("div", { class: "cal-t" + (it.title ? "" : " untitled") }, it.title || "제목 미정"),
        h("div", { class: "small" }, it.time))),
      runs.map((r) => h("a", { class: "cal-run", href: "#issue/" + r.id, title: r.topic }, typeIcon(), h("span", { class: "key" }, keyOf(r)), lz(r.status)))));
  }
  while (cells.length % 7) cells.push(h("div", { class: "cal-cell out" }));
  $("#cal-body").replaceChildren(...[
    h("div", { class: "cal" }, ["월", "화", "수", "목", "금", "토", "일"].map((w, i) => h("div", { class: "cal-h" + (i >= 5 ? " weekend" : "") }, w)), cells),
    !items.length ? h("div", { class: "msg disc", style: "margin-top:16px" }, ic("automation", 20), h("div", { class: "grow" }, h("h4", {}, "30분 걸리던 한 달 계획을 한 번에"),
      h("div", {}, "난이도(주 몇 회) → 요일·시간 → 주제 → 콘텐츠 유형을 고르면 달력이 채워집니다. 칸을 눌러 제목을 적고, 「이 주제로 만들기」로 바로 작업을 만듭니다."),
      h("button", { class: "btn primary", style: "margin-top:12px", onclick: () => openPlanMaker() }, "한 달 계획 만들기"))) : null].filter(Boolean));
}
function openPlanMaker() {
  const plan = ui.cal.plan || { items: [] };
  const def = PLAN_DEFAULTS[ui.cal.account] || { main: "", topics: [] };
  let level = plan.level || "보통";
  const lv = h("div", { class: "btn-group", role: "radiogroup" });
  const drawLv = () => lv.replaceChildren(...Object.entries({ "쉬움": "주 3회(월·수·금)", "보통": "주 5회(평일)", "어려움": "주 7회(매일)" }).map(([k, d]) =>
    h("button", { class: "btn" + (level === k ? " sel" : " subtle"), role: "radio", "aria-checked": level === k ? "true" : "false", onclick: () => { level = k; drawLv(); } }, `${k} · ${d}`)));
  drawLv();
  const time = h("select", { class: "input", id: "pm-time" }, ["10:00", "12:00", "19:00", "21:00"].map((x) => h("option", { value: x, selected: x === "19:00" }, x)));
  const main = h("input", { class: "input", id: "pm-main", value: plan.main_topic || def.main, placeholder: "예) 생활 꿀팁" });
  const topics = h("textarea", { class: "input", id: "pm-topics", rows: "4", placeholder: "한 줄에 하나씩. 예) 전세" }, (plan.topics && plan.topics.length ? plan.topics : def.topics).join("\n"));
  const chosen = new Set(plan.types && plan.types.length ? plan.types : PLAN_TYPES.slice(0, 5));
  const types = h("div", { class: "row" }, PLAN_TYPES.map((x) => h("label", { class: "tag", style: "cursor:pointer;gap:4px;height:28px" },
    h("input", { type: "checkbox", checked: chosen.has(x), onchange: (e) => { e.target.checked ? chosen.add(x) : chosen.delete(x); } }), x)));
  const make = async (btn) => {
    const tps = topics.value.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
    const tys = PLAN_TYPES.filter((x) => chosen.has(x));
    if (!tps.length || !tys.length) { flag("err", "주제와 유형을 하나 이상 고르세요", ""); return; }
    if ((plan.items || []).length && !confirm(`이미 있는 ${plan.items.length}칸을 새 계획으로 바꿉니다. 계속할까요?`)) return;
    btn.disabled = true;
    const [y, m] = ui.cal.month.split("-").map(Number), days = new Date(y, m, 0).getDate(), items = [];
    let i = 0;
    for (let d = 1; d <= days; d++) {
      const wd = (new Date(y, m - 1, d).getDay() + 6) % 7;
      if (!LEVEL_DAYS[level].includes(wd)) continue;
      items.push({ date: `${ui.cal.month}-${pad2(d)}`, time: time.value, topic: tps[i % tps.length], type: tys[(i + Math.floor(i / tps.length)) % tys.length], title: "" });
      i++;
    }
    closeModal(true);
    await savePlan({ month: ui.cal.month, account: ui.cal.account, level, main_topic: main.value.trim(), topics: tps, types: tys, items }, `계획 ${items.length}칸을 만들었습니다`);
  };
  openModal([h("div", { class: "modal-h" }, h("h2", {}, `${ui.cal.month.replace("-", "년 ")}월 콘텐츠 계획`), h("button", { class: "tb-icon x", "aria-label": "닫기", onclick: () => closeModal() }, ic("x", 20))),
    h("div", { class: "modal-b" },
      h("div", { class: "small", style: "margin-bottom:12px" }, `계정: ${ACCOUNTS[ui.cal.account]} (${ui.cal.account})`),
      h("div", { class: "field" }, h("div", { class: "lbl" }, "1. 난이도 — 한 주에 몇 번 올릴지"), lv),
      h("div", { class: "field" }, h("label", { for: "pm-time" }, "2. 올리는 시간"), time),
      h("div", { class: "field" }, h("label", { for: "pm-main" }, "3. 메인 주제"), main),
      h("div", { class: "field" }, h("label", { for: "pm-topics" }, "   하위 주제(돌아가며 배치)"), topics),
      h("div", { class: "field" }, h("div", { class: "lbl" }, "4. 콘텐츠 유형(주제와 엇갈려 배치)"), types),
      h("div", { class: "help" }, "5. 「만들기」를 누르면 한 달 달력이 채워집니다. 제목은 칸을 눌러 적거나, trend-scout·reels-maker 가 그날 주제로 채웁니다.")),
    h("div", { class: "modal-f" }, h("button", { class: "btn subtle", onclick: () => closeModal() }, "취소"), h("button", { class: "btn primary", id: "pm-go", onclick: (e) => make(e.currentTarget) }, "만들기"))],
  { size: "sm", label: "한 달 계획 만들기" });
}
function editPlanItem(idx, date) {
  const plan = ui.cal.plan || { month: ui.cal.month, account: ui.cal.account, items: [] };
  const it = idx == null ? { date, time: "19:00", topic: (plan.topics || [])[0] || "", type: (plan.types || PLAN_TYPES)[0], title: "" } : { ...plan.items[idx] };
  const f = (id, label, el) => h("div", { class: "field" }, h("label", { for: id }, label), el);
  const dateI = h("input", { class: "input", id: "pi-date", type: "date", value: it.date, min: `${plan.month || ui.cal.month}-01`, max: `${plan.month || ui.cal.month}-31` });
  const timeI = h("input", { class: "input", id: "pi-time", type: "time", value: it.time });
  const topicI = h("input", { class: "input", id: "pi-topic", value: it.topic, list: "pi-topics" });
  const typeI = h("select", { class: "input", id: "pi-type" }, [...new Set([...(plan.types || []), ...PLAN_TYPES, it.type].filter(Boolean))].map((x) => h("option", { value: x, selected: x === it.type }, x)));
  const titleI = h("input", { class: "input", id: "pi-title", value: it.title, placeholder: "예) 전세 계약 전에 이름 검색 안 하면", autofocus: true });
  const collect = () => ({ ...it, date: dateI.value, time: timeI.value || "19:00", topic: topicI.value.trim(), type: typeI.value, title: titleI.value.trim() });
  const save = async () => { const items = [...(plan.items || [])]; if (idx == null) items.push(collect()); else items[idx] = collect(); closeModal(true); await savePlan({ ...plan, month: plan.month || ui.cal.month, account: plan.account || ui.cal.account, items }, "계획을 저장했습니다"); };
  const del = async () => { const items = plan.items.filter((_, k) => k !== idx); closeModal(true); await savePlan({ ...plan, items }, "계획에서 뺐습니다"); };
  openModal([h("div", { class: "modal-h" }, h("h2", {}, idx == null ? "계획 추가" : "계획 고치기"), h("button", { class: "tb-icon x", "aria-label": "닫기", onclick: () => closeModal() }, ic("x", 20))),
    h("div", { class: "modal-b" },
      h("div", { class: "grid g2", style: "gap:0 16px" }, f("pi-date", "날짜", dateI), f("pi-time", "시간", timeI)),
      h("div", { class: "grid g2", style: "gap:0 16px" }, f("pi-topic", "주제", topicI), f("pi-type", "유형", typeI)),
      h("datalist", { id: "pi-topics" }, (plan.topics || []).map((x) => h("option", { value: x }))),
      f("pi-title", "제목(첫 화면 후킹)", titleI),
      h("div", { class: "help" }, "후킹은 「내가 ○○ 안 하면 / ○○ 당해요」처럼 보는 사람과의 관련·결과가 보이게 씁니다.")),
    h("div", { class: "modal-f" },
      idx == null ? null : h("button", { class: "btn subtle", style: "margin-right:auto;color:var(--danger-text)", onclick: del }, "빼기"),
      h("button", { class: "btn", onclick: () => { const c = collect(); closeModal(true); openCreate({ account: plan.account || ui.cal.account, series: c.topic, topic: c.title || `${c.topic} ${c.type}` }); } }, ic("plus", 16), "이 주제로 만들기"),
      h("button", { class: "btn primary", id: "pi-save", onclick: save }, "저장"))],
  { size: "sm", label: "계획 칸" });
}

// ---------- 모니터(에이전트가 일하는 모습을 한눈에) ----------
// 벤치마킹: 작업자 카드 벽(픽셀 캐릭터·진행 막대·전체 처리율) + 별자리 연결도(에이전트 노드·흐름 선·움직이는 점)
const MON_STATE = {
  working: ["작업 중", "#22A06B", "blue"], waiting: ["승인 기다림", "#E2B203", "yellow"], blocked: ["훅 차단", "#E34935", "red"],
  error: ["오류", "#C9372C", "red"], idle: ["대기", "#579DFF", ""], planned: ["예정", "#626F86", ""],
  off: ["퇴근·휴무", "#A5ADBA", ""], fired: ["해고", "#44546F", "red"],
};
const MON_ORDER = ["working", "blocked", "error", "waiting", "idle", "planned", "off", "fired"];
ui.mon = { showPlanned: store.get("monPlanned", false), sel: null, view: store.get("monView2", "office") };
function evTime(e) { const t = Date.parse(e.ts || ""); return isNaN(t) ? 0 : t; }
// 모니터용 그룹: 본 세션(총괄)과, agents.json 에 없는데 실제로 불려 나온 서브에이전트(Explore 등)를 「공통」 방에 넣는다
const MAIN_AGENT = { name: "claude-main", title: "총괄 (Claude Code)", role: "PC에서 직접 대화하는 Claude Code 본 세션. 일을 나눠 서브에이전트에게 맡긴다.", state: "active" };
function monGroups() {
  const live = S.live || {}, known = new Set(S.groups.flatMap((g) => g.agents.map((a) => a.name)));
  const extra = Object.keys(live).filter((n) => n !== MAIN_AGENT.name && !known.has(n))
    .map((n) => ({ name: n, title: "도우미 · " + n, role: "agents.json 에 없는 기본 서브에이전트(" + n + "). 실제로 불려 나와 일한 기록이 있어 보여 준다.", state: "active", temp: true }));
  return S.groups.map((g) => g.id === "shared" ? { ...g, agents: [MAIN_AGENT, ...g.agents, ...extra] } : g);
}
function liveText(L) {
  if (!L) return "";
  if (L.task) return L.task;
  if (L.last_tool) return L.last_tool + (L.last_detail ? " · " + String(L.last_detail).split(/[\\/]/).pop().slice(0, 40) : "");
  return "";
}
function agentStates() {
  const now = Date.now(), today = ymd(new Date()), out = {}, live = S.live || {};
  for (const g of monGroups()) for (const a of g.agents) {
    const runs = S.runs.filter((r) => r.agent === a.name);
    const evs = S.events.filter((e) => e.agent === a.name);
    const last = evs.length ? evs[evs.length - 1] : null;
    const work = runs.find((r) => ["running", "queued"].includes(r.status));
    const L = live[a.name];
    let st = a.state === "planned" && !runs.length && !L ? "planned" : "idle";   // 예정 에이전트도 실제로 한 번이라도 일했으면(실행·훅 기록) 자리에 앉는다
    if (runs.some((r) => r.status === "awaiting_approval")) st = "waiting";
    if (runs.length && runs[0].status === "error") st = "error";
    if (evs.some((e) => e.kind === "blocked" && now - evTime(e) < 30 * 60e3)) st = "blocked";
    if (work || (L && L.busy)) st = "working";   // 실제로 일하는 중(러너 실행 또는 훅 기록: 맡은 일 진행·최근 도구 사용)
    if (a.name === "reels-validator" && S.runs.some((r) => r.status === "validating")) st = "working";
    const hr = ((S.hr || {}).agents || {})[a.name];   // 인사: 해고·정직·근무 시간 밖이면 사무실에 없다(실제로 일하는 중이면 그대로)
    if (hr && hr.status === "dismissed") st = "fired";
    else if (hr && st !== "working" && st !== "waiting" && (hr.status === "suspended" || !hr.on_shift)) st = "off";
    const todayRuns = runs.filter((r) => (r.created || "").startsWith(today));
    const done = runs.filter((r) => ["approved", "rejected"].includes(r.status)).length;
    out[a.name] = { a, g, st, hr: hr || null, live: L || null, liveText: liveText(L), work: work || (a.name === "reels-validator" ? S.runs.find((r) => r.status === "validating") : null),
      runs, today: todayRuns.length, done, last, cost: ((S.usage.per_agent || {})[a.name] || {}).cost_usd || 0 };
  }
  return out;
}
function pixelAvatar(name, size = 36, working = false) {
  const rows = ["..HHHH..", ".HHHHHH.", ".HSSSSH.", ".SESSES.", ".SSSSSS.", "..SMMS..", ".BBBBBB.", "BBBBBBBB"];
  const hair = ["#3B2A1A", "#6B4423", "#1D1D1D", "#B5651D", "#5E4DB2", "#943D73"][[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % 6];
  const col = { H: hair, S: "#F1C27D", E: "#172B4D", M: "#C9372C", B: hashColor(name) };
  let r = "";
  rows.forEach((row, y) => [...row].forEach((c, x) => { if (col[c]) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${col[c]}"/>`; }));
  return h("span", { class: "pxav" + (working ? " work" : ""), style: `width:${size}px;height:${size}px`, "aria-hidden": "true",
    html: `<svg viewBox="0 0 8 8" width="${size}" height="${size}" shape-rendering="crispEdges">${r}</svg>` });
}
function monKpis(states) {
  const today = ymd(new Date());
  const tRuns = S.runs.filter((r) => (r.created || "").startsWith(today));
  const finished = tRuns.filter((r) => !["queued", "running", "validating"].includes(r.status)).length;
  const pct = tRuns.length ? (finished / tRuns.length) * 100 : 100;
  const n = (st) => Object.values(states).filter((x) => x.st === st).length;
  const blockedToday = S.events.filter((e) => e.kind === "blocked" && (e.ts || "").startsWith(today)).length;
  const k = (label, v, color) => h("div", { class: "mon-k" }, h("b", { style: color ? `color:${color}` : "" }, v), h("span", {}, label));
  return h("div", { class: "mon-top" },
    h("div", { class: "mon-pct" }, h("b", {}, pct.toFixed(1) + "%"), h("span", {}, `오늘 ${finished} / ${tRuns.length}건 끝남`)),
    h("div", { class: "mon-bar" }, h("i", { style: `width:${pct}%` })),
    h("div", { class: "mon-ks" },
      k("역할 배정", `${Object.values(states).filter((x) => x.st !== "planned").length} / ${Object.keys(states).length}`),
      k("사람 확인(오늘)", S.events.filter((e) => e.kind === "status" && (e.ts || "").startsWith(today) && /승인됨|반려됨/.test(e.detail || "")).length),
      (() => { const first = S.events.filter((e) => (e.ts || "").startsWith(today)).map(evTime).filter(Boolean).sort((p, q) => p - q)[0];
        return h("div", { class: "mon-k" }, h("b", { class: "mon-timer", "data-since": first || "" }, first ? fmtDur(Date.now() - first) : "-"), h("span", {}, "오늘 가동 시간")); })(),
      k("작업 중", n("working"), "#22A06B"), k("승인 기다림", n("waiting"), "#E2B203"), k("훅 차단(30분)", n("blocked"), "#E34935"),
      k("오늘 실행", tRuns.length), k("오늘 차단", blockedToday), k("오늘 비용", usd(S.usage.total_usd))));
}
function monPipeline() {
  const g = S.groups.find((x) => x.id === "reels"); if (!g || !g.flow_order) return null;
  const whoFor = { queued: "reels-maker", running: "reels-maker", error: "reels-maker", validating: "reels-validator", validation_failed: "reels-validator", awaiting_approval: "사람" };
  const cnt = g.flow_order.map(() => 0);  // 건마다 처음 맞는 단계 한 곳에만 센다(사람 단계가 둘이어도 겹치지 않게)
  for (const r of S.runs) { const i = g.flow_order.findIndex((s) => s.who === whoFor[r.status]); if (i >= 0) cnt[i]++; }
  return h("div", { class: "card mon-pipe" }, h("div", { class: "card-h" }, h("h3", {}, "릴스 흐름 — 지금 어느 단계에 몇 건"), h("a", { class: "small", href: "#automation" }, "흐름 편집")),
    h("div", { class: "pipe" }, g.flow_order.map((s, i) => [i ? h("i", { class: "pipe-line" + (cnt[i - 1] || cnt[i] ? " hot" : "") }) : null,
      h("div", { class: "pipe-step" + (cnt[i] ? " on" : "") + (s.kind === "human" ? " human" : ""), title: `${s.step} · ${s.who}` },
        h("span", { class: "dot" }, cnt[i] || ""), h("small", {}, s.step))])));
}
function fmtDur(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, "0")}m ${String(s % 60).padStart(2, "0")}s`; }
setInterval(() => { for (const el of $$(".mon-timer")) { const s = Number(el.dataset.since); if (s) el.textContent = fmtDur(Date.now() - s); } }, 1000);
function monGuard() {
  const all = S.events.filter((e) => e.kind === "blocked"), bl = [...all].reverse().slice(0, 5);
  return h("div", { class: "card mon-guard" }, h("div", { class: "card-h" }, ic("shield", 18), h("h3", {}, "리스크 가드 — 훅이 막은 것"), h("span", { class: "small" }, `최근 ${all.length}건`)),
    bl.length ? h("ul", { class: "feed" }, bl.map((e) => h("li", {}, h("span", { class: "lz bold red" }, "막음"),
      h("div", { class: "txt" }, h("b", {}, agentTitle[e.agent] || e.agent || "에이전트"), h("div", { class: "muted ellipsis2" }, [e.tool, e.reason].filter(Boolean).join(" · "))), h("span", { class: "when" }, ago(e.ts)))))
      : h("div", { class: "small" }, "막은 기록이 없습니다. 커밋·삭제·게시 버튼·규칙 파일 수정은 훅이 항상 막습니다."));
}
function monSpark() {
  const now = Date.now(), B = 24, span = 6 * 3600e3, w = span / B, bins = new Array(B).fill(0), bl = new Array(B).fill(0);
  for (const e of S.events) { const t = evTime(e); if (!t || now - t > span) continue; const i = Math.min(B - 1, Math.floor((t - (now - span)) / w)); bins[i]++; if (e.kind === "blocked") bl[i]++; }
  const max = Math.max(1, ...bins), W = 300, H = 70;
  const pts = bins.map((v, i) => `${(i / (B - 1)) * W},${H - (v / max) * (H - 6) - 2}`).join(" ");
  const bars = bl.map((v, i) => v ? `<rect x="${(i / (B - 1)) * W - 3}" y="${H - (v / max) * (H - 6) - 2}" width="6" height="${(v / max) * (H - 6)}" fill="#E34935" opacity=".8"/>` : "").join("");
  return h("div", { class: "card" }, h("div", { class: "card-h" }, h("h3", {}, "최근 6시간 활동"), h("span", { class: "small" }, `${bins.reduce((a, b) => a + b, 0)}건 · 빨강=차단`)),
    h("div", { html: `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" role="img" aria-label="최근 6시간 활동량"><polyline points="0,${H} ${pts} ${W},${H}" fill="rgba(34,160,107,.18)" stroke="none"/><polyline points="${pts}" fill="none" stroke="#22A06B" stroke-width="2" vector-effect="non-scaling-stroke"/>${bars}</svg>` }),
    h("div", { class: "row small", style: "justify-content:space-between" }, h("span", {}, "6시간 전"), h("span", {}, "지금")));
}
function monCard(x) {
  const [label, color, lzc] = MON_STATE[x.st];
  const pct = x.runs.length ? (x.done / x.runs.length) * 100 : 0;
  const lastTxt = x.last ? (x.last.kind === "blocked" ? "차단: " + [x.last.tool, x.last.reason].filter(Boolean).join(" · ") : x.last.kind === "status" ? x.last.detail : [x.last.tool, x.last.detail].filter(Boolean).join(" · ")) : "";
  return h("button", { class: "mon-card st-" + x.st + (ui.mon.sel === x.a.name ? " sel" : ""), style: `--st:${color}`, onclick: () => { ui.mon.sel = ui.mon.sel === x.a.name ? null : x.a.name; drawMonitor(); } },
    h("div", { class: "mc-h" }, h("b", { class: "mc-n" }, x.today), h("span", { class: "small" }, "오늘"), h("span", { class: "lz " + lzc, style: "margin-left:auto" }, label)),
    h("div", { class: "mc-av" }, pixelAvatar(x.a.name, 40, x.st === "working"), x.st === "working" ? h("span", { class: "mc-desk" }) : null),
    h("div", { class: "mc-t" }, x.a.title), h("div", { class: "mc-s" }, x.a.name),
    h("div", { class: "mc-bar" + (x.st === "working" ? " run" : "") }, h("i", { style: `width:${x.st === "working" ? 100 : pct}%` })),
    h("div", { class: "mc-l" }, x.work ? "▶ " + (x.work.topic || "") : x.st === "working" && x.liveText ? "▶ " + x.liveText : lastTxt || (x.st === "planned" ? "아직 연결 안 됨" : "기록 없음")),
    (() => { const lim = (S.usage.agent_budgets_usd || {})[x.a.name]; if (!lim) return null; const p = Math.min(100, (x.cost / lim) * 100);
      return h("div", { class: "mc-budget", title: `오늘 한도 ${usd(lim)} 중 ${usd(x.cost)} 사용` }, h("span", {}, `한도 ${usd(x.cost)} / ${usd(lim)}`), h("div", { class: "progress" + (p > 90 ? " bad" : p > 70 ? " warn" : "") }, h("i", { style: `width:${p}%` }))); })(),
    h("div", { class: "mc-f" }, h("span", {}, `누적 ${x.runs.length}`), h("span", {}, x.last ? ago(x.last.ts) : ""), h("span", {}, x.cost ? usd(x.cost) : "")));
}
function renderMonitor(root, isUpdate) {
  root.className = "page mon-page"; root.style.maxWidth = "none";
  if (!isUpdate || !$("#mon-body", root)) {
    const views = [["office", "사무실"], ["office3d", "3D 블록"], ["both", "모두"], ["cards", "카드 벽"], ["map", "연결도"]];
    root.replaceChildren(...pageHead("모니터", [h("span", {}, "에이전트 작업 현황")], [
      h("label", { class: "row small", style: "cursor:pointer" }, h("input", { type: "checkbox", checked: ui.mon.showPlanned, onchange: (e) => { ui.mon.showPlanned = e.target.checked; store.set("monPlanned", ui.mon.showPlanned); drawMonitor(); } }), "예정 에이전트도"),
      h("div", { class: "btn-group" }, views.map(([v, l]) => h("button", { class: "btn" + (ui.mon.view === v ? " sel" : " subtle"), onclick: () => { ui.mon.view = v; store.set("monView2", v); renderMonitor(root); } }, l))),
      notifyButton(),
      h("button", { class: "btn", title: "전체 화면(벽 모니터용)", onclick: () => { const el = $("#mon-body"); (el.requestFullscreen ? el.requestFullscreen() : Promise.reject()).catch(() => {}); } }, ic("summary", 16), "전체 화면")]),
      h("div", { id: "mon-body" }));
  }
  drawMonitor();
}
function drawMonitor() {
  const body = $("#mon-body"); if (!body) return;
  const states = agentStates();
  const list = Object.values(states).filter((x) => ui.mon.showPlanned || x.st !== "planned").sort((a, b) => MON_ORDER.indexOf(a.st) - MON_ORDER.indexOf(b.st) || b.today - a.today);
  const v = ui.mon.view;
  let map = $("#mon-map", body);
  const mapWrap = map ? map.parentElement : null;
  const sel = ui.mon.sel && states[ui.mon.sel];
  const side = sel ? h("div", { class: "mon-side card" },
      h("div", { class: "row", style: "flex-wrap:nowrap" }, pixelAvatar(sel.a.name, 44, sel.st === "working"), h("div", { class: "grow" }, h("b", {}, sel.a.title), h("div", { class: "small" }, sel.g.title)),
        h("button", { class: "tb-icon", "aria-label": "닫기", onclick: () => { ui.mon.sel = null; drawMonitor(); } }, ic("x", 16))),
      h("div", { class: "think" }, h("div", { class: "think-h" }, "💭 지금 생각"), thoughtOf(sel).map((t) => h("p", {}, t))),
      h("p", { class: "small", style: "margin:8px 0" }, sel.a.role),
      h("div", { class: "small" }, "최근 작업"),
      sel.runs.slice(0, 6).map((r) => h("a", { class: "row", href: "#issue/" + r.id, style: "padding:6px 0;border-bottom:1px solid var(--border);color:inherit;text-decoration:none;flex-wrap:nowrap" }, h("span", { class: "key" }, keyOf(r)), h("span", { class: "grow ellipsis" }, r.topic || ""), lz(r.status))),
      !sel.runs.length ? h("div", { class: "small" }, "실행 기록이 없습니다.") : null,
      h("div", { class: "small", style: "margin-top:8px" }, "최근 활동"),
      activityList(S.events.filter((e) => e.agent === sel.a.name).slice(-4).reverse())) : null;
  const parts = [monKpis(states)];
  if (v === "office" || v === "office3d") {
    let off = $("#mon-office", body);
    if (off && off.dataset.kind !== v) off = null;
    if (!off) off = h("div", { id: "mon-office", class: "mon-office" + (v === "office" ? " is-o2" : ""), "data-kind": v }, h("div", { class: "small", style: "padding:24px;color:#fff" }, "사무실을 불러오는 중…"));
    parts.push(h("div", { class: "mon-mapwrap office-wrap" }, off,
      h("div", { class: "office-help" }, v === "office" ? "부서 이름: 그 부서만 보기 · 사람·이름표 누르기: 선택 · 결재함: 승인함" : "끌기: 돌리기 · 휠: 확대 · 누르기: 선택 · 두 번 누르기: 다가가기 · 「나」 책상: 승인함"),
      h("div", { class: "mon-legend" }, MON_ORDER.map((k) => h("span", {}, h("i", { style: `background:${MON_STATE[k][1]}` }), MON_STATE[k][0]))), side));
    parts.push(h("div", { class: "grid mon-row" }, monPipeline(), monGuard()));
    body.replaceChildren(...parts.filter(Boolean));
    mountOffice(off, states, list, v);
    return;
  }
  if (v !== "cards") {
    if (!map) { map = h("canvas", { id: "mon-map", "aria-label": "에이전트 연결도" }); }
    parts.push(h("div", { class: "mon-mapwrap" }, mapWrap ? map : map, h("div", { class: "mon-legend" }, MON_ORDER.map((k) => h("span", {}, h("i", { style: `background:${MON_STATE[k][1]}` }), MON_STATE[k][0]))), side));
  }
  if (v !== "map") parts.push(h("div", { class: "grid mon-row" }, monPipeline(), monSpark()), h("div", { class: "mon-grid" }, list.map(monCard)), h("div", { style: "margin-top:16px" }, monGuard()));
  else if (side) { /* 연결도만 볼 때도 옆 창 */ }
  body.replaceChildren(...parts.filter(Boolean));
  if (v !== "cards") Constellation.mount(map, states);
}
// ---------- 3D 사무실(WebGL) ----------
let officeMod = null, officeMod2 = null;
function officeData(states, list) {
  const k = (() => { const today = ymd(new Date()), tr = S.runs.filter((r) => (r.created || "").startsWith(today));
    const fin = tr.filter((r) => !["queued", "running", "validating"].includes(r.status)).length;
    const n = (st) => Object.values(states).filter((x) => x.st === st).length;
    return { pct: tr.length ? fin / tr.length * 100 : 100, finished: fin, total: tr.length, working: n("working"), waiting: n("waiting"), blocked: n("blocked"), cost: usd(S.usage.total_usd) }; })();
  return {
    agents: list.map((x) => ({ name: x.a.name, title: x.a.title, group: x.g.id, st: x.st, today: x.today, topic: x.work ? x.work.topic : x.liveText,
      lead: x.a.name === MAIN_AGENT.name, by: x.live && x.live.busy ? x.live.by : "", thought: thoughtOf(x).join(" "), tool: x.live && x.live.busy ? x.live.last_tool || "" : "" })),
    groups: monGroups().map((g) => ({ id: g.id, title: g.title, lead: g.lead, members: g.agents.map((a) => a.name) })),
    runs: S.runs.map((r) => ({ id: r.id, status: r.status, agent: r.agent })),
    pending: S.runs.filter((r) => r.status === "awaiting_approval").length, kpi: k,
  };
}
async function mountOffice(el, states, list, kind = "office") {
  let mod;
  try { mod = kind === "office" ? (officeMod2 = officeMod2 || await import("/static/office2.js")) : (officeMod = officeMod || await import("/static/office.js")); }
  catch (e) { el.replaceChildren(h("div", { class: "small", style: "padding:24px;color:#fff" }, "사무실 화면을 불러오지 못했습니다: " + e.message)); return; }
  if (!mod.supported()) { el.replaceChildren(h("div", { class: "small", style: "padding:24px;color:#fff" }, "이 PC의 브라우저가 WebGL(3D)을 지원하지 않습니다. 「카드 벽」이나 「연결도」로 보세요.")); return; }
  if (!el.isConnected) return;
  const other = kind === "office" ? officeMod : officeMod2; if (other) other.dispose();
  const first = !el.querySelector("canvas");
  if (first) el.replaceChildren();
  mod.mount(el, officeData(states, list), { onSelect: (n) => { ui.mon.sel = n; drawMonitor(); }, onMe: () => go("inbox") });
  mod.select(ui.mon.sel);
}
const Constellation = (() => {
  let cv, ctx, raf = 0, st = {}, nodes = [], edges = [], stars = [], parts = [], W = 0, H = 0, hover = null, t0 = performance.now();
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function layout() {
    const ag = Object.values(st).filter((x) => ui.mon.showPlanned || x.st !== "planned");
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.38;
    nodes = [{ id: "hub", x: cx, y: cy, r: 22, color: "#E774BB", label: (S.branding && S.branding.product_name) || "Agent Hub", hub: true }];
    ag.forEach((x, i) => { const ang = -Math.PI / 2 + (i / ag.length) * Math.PI * 2;
      nodes.push({ id: x.a.name, x: cx + Math.cos(ang) * R, y: cy + Math.sin(ang) * R, r: x.st === "working" ? 11 : x.st === "planned" ? 5 : 8,
        color: MON_STATE[x.st][1], label: x.a.title, s: x }); });
    const ids = new Set(nodes.map((n) => n.id)); edges = [];
    for (const g of S.groups) {
      if (ids.has(g.lead)) edges.push({ a: "hub", b: g.lead, w: 1.4 });
      const seq = (g.flow_order || []).map((f) => f.who).filter((w) => ids.has(w));
      for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) edges.push({ a: seq[i - 1], b: seq[i], w: 1, flow: true });
      for (const a of g.agents) if (ids.has(a.name) && a.name !== g.lead && ids.has(g.lead)) edges.push({ a: g.lead, b: a.name, w: 0.5 });
    }
    if (!stars.length) stars = Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.3 + 0.2, p: Math.random() * 6 }));
  }
  const byId = (id) => nodes.find((n) => n.id === id);
  function size() { const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1; W = r.width; H = r.height; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0); layout(); }
  function frame(now) {
    if (!cv || !cv.isConnected) { cancelAnimationFrame(raf); raf = 0; return; }
    const t = (now - t0) / 1000;
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, "#1B2A4A"); g.addColorStop(0.6, "#0E1426"); g.addColorStop(1, "#05070F");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (const s of stars) { ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 1.3 + s.p); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    const selId = ui.mon.sel;
    for (const e of edges) { const a = byId(e.a), b = byId(e.b); if (!a || !b) continue;
      const hot = (a.s && a.s.st === "working") || (b.s && b.s.st === "working");
      const on = selId && (e.a === selId || e.b === selId);
      ctx.strokeStyle = on ? "rgba(255,255,255,.75)" : hot ? "rgba(87,157,255,.75)" : `rgba(87,157,255,${e.flow ? 0.32 : 0.16})`;
      ctx.lineWidth = (on ? 1.8 : e.w) * (hot ? 1.6 : 1); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      if (hot && !reduce && Math.random() < 0.08) parts.push({ a, b, p: 0, v: 0.008 + Math.random() * 0.01 });
    }
    parts = parts.filter((q) => (q.p += reduce ? 0 : q.v) < 1);
    for (const q of parts) { const x = q.a.x + (q.b.x - q.a.x) * q.p, y = q.a.y + (q.b.y - q.a.y) * q.p;
      ctx.fillStyle = "#B3DF72"; ctx.shadowColor = "#B3DF72"; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 7); ctx.fill(); ctx.shadowBlur = 0; }
    for (const n of nodes) {
      const pulse = n.s && ["working", "blocked"].includes(n.s.st) && !reduce ? 1 + 0.25 * Math.sin(t * 4) : 1;
      const r = n.r * pulse * (hover === n || selId === n.id ? 1.3 : 1);
      const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 3.2); glow.addColorStop(0, n.color + "AA"); glow.addColorStop(1, n.color + "00");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(n.x, n.y, r * 3.2, 0, 7); ctx.fill();
      ctx.fillStyle = n.color; ctx.globalAlpha = n.s && n.s.st === "planned" ? 0.55 : 1; ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      if (selId === n.id && n.s) { n.s.runs.slice(0, 12).forEach((run, i, arr) => { const ang = t * 0.4 + (i / arr.length) * Math.PI * 2, rr = r + 26;
        ctx.fillStyle = STATUS_COLOR[run.status] || "#ccc"; ctx.beginPath(); ctx.arc(n.x + Math.cos(ang) * rr, n.y + Math.sin(ang) * rr, 4, 0, 7); ctx.fill(); }); }
      ctx.font = `${n.hub ? 700 : 500} ${n.hub ? 13 : 11}px ${getComputedStyle(document.body).fontFamily}`; ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,.88)"; ctx.fillText(n.label, n.x, n.y + r + 14);
      if (n.s && n.s.today) { ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.font = `10px ${getComputedStyle(document.body).fontFamily}`; ctx.fillText(`오늘 ${n.s.today}`, n.x, n.y + r + 26); }
    }
    raf = requestAnimationFrame(frame);
  }
  function pick(ev) { const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    return nodes.find((n) => Math.hypot(n.x - x, n.y - y) < Math.max(14, n.r + 6)) || null; }
  function mount(canvas, states) {
    st = states;
    if (cv !== canvas) {
      cv = canvas; ctx = cv.getContext("2d");
      cv.addEventListener("mousemove", (e) => { hover = pick(e); cv.style.cursor = hover && !hover.hub ? "pointer" : "default"; cv.title = hover && hover.s ? `${hover.label} · ${MON_STATE[hover.s.st][0]} · 오늘 ${hover.s.today}건` : ""; });
      cv.addEventListener("click", (e) => { const n = pick(e); if (n && n.s) { ui.mon.sel = ui.mon.sel === n.id ? null : n.id; drawMonitor(); } });
      new ResizeObserver(() => size()).observe(cv);
    }
    size();
    if (!raf) raf = requestAnimationFrame(frame);
  }
  return { mount };
})();

// ---------- 목록 ----------
const LIST_COLS = [
  { key: "type", label: "", sort: false },
  { key: "key", label: "키", get: (r) => r.created },
  { key: "topic", label: "요약" },
  { key: "status", label: "상태", get: (r) => Object.keys(STATUS).indexOf(r.status) },
  { key: "agent", label: "담당" },
  { key: "account", label: "계정" },
  { key: "errors", label: "검수", get: (r) => r.errors * 100 + r.warnings },
  { key: "cost_usd", label: "비용", get: (r) => r.cost_usd || 0 },
  { key: "created", label: "만든 시각" },
];
function renderList(root, isUpdate) {
  let body = $("#list-body", root);
  if (!isUpdate || !body) {
    body = h("div", { id: "list-body" });
    const sinput = h("input", { class: "input", type: "search", placeholder: "목록 검색", value: query, "aria-label": "목록 검색",
      oninput: (e) => { query = e.target.value; const q = $("#q"); if (q) q.value = query; drawList(body); } });
    root.replaceChildren(...pageHead("목록", [], [h("button", { class: "btn", onclick: exportCsv, title: "보이는 목록을 CSV(엑셀)로 저장" }, ic("download", 16), "내보내기"), h("button", { class: "btn", onclick: openCreate }, ic("plus", 16), "시험 실행")]),
      h("div", { class: "toolbar" }, h("label", { class: "search" }, ic("search", 16), sinput), h("span", { class: "small", id: "list-count" })), body);
    root.className = "page";
  }
  drawList(body);
}
function exportCsv() {
  const runs = filtered(S.runs);
  const esc = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const rows = [["키", "요약", "상태", "담당", "계정", "오류", "경고", "비용(USD)", "만든 시각", "실행 ID"]]
    .concat(runs.map((r) => [keyOf(r), r.topic, STATUS[r.status] || r.status, agentTitle[r.agent] || r.agent, r.account, r.errors, r.warnings, r.cost_usd == null ? "" : r.cost_usd, ts(r.created), r.id]));
  const blob = new Blob(["\ufeff" + rows.map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = h("a", { href: URL.createObjectURL(blob), download: `agent-hub-작업-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  flag("ok", "CSV로 내보냈습니다", `${runs.length}건`);
}
function drawList(body) {
  const { key, dir } = ui.listSort;
  const col = LIST_COLS.find((c) => c.key === key) || LIST_COLS[8];
  const get = col.get || ((r) => String(r[col.key] || ""));
  const runs = filtered(S.runs).sort((a, b) => (get(a) > get(b) ? 1 : get(a) < get(b) ? -1 : 0) * dir);
  const cnt = $("#list-count"); if (cnt) cnt.textContent = `${runs.length}건`;
  if (!runs.length) { body.replaceChildren(emptyState(query ? "검색 결과가 없습니다" : "작업이 없습니다", query ? `「${query}」와 맞는 작업이 없습니다.` : "")); return; }
  const th = (c) => h("th", { class: c.sort === false ? "" : "sortable", "aria-sort": c.key === key ? (dir > 0 ? "ascending" : "descending") : null,
    onclick: c.sort === false ? null : () => { ui.listSort = { key: c.key, dir: c.key === key ? -dir : 1 }; store.set("listSort", ui.listSort); drawList(body); } },
    c.label, c.key === key ? (dir > 0 ? " ↑" : " ↓") : "");
  body.replaceChildren(h("div", { class: "table-wrap" }, h("table", { class: "t" }, h("thead", {}, h("tr", {}, LIST_COLS.map(th))),
    h("tbody", {}, runs.map((r) => h("tr", { class: "click", onclick: () => openIssue(r.id) },
      h("td", { style: "width:28px" }, typeIcon()),
      h("td", { class: "nowrap" }, h("a", { href: "#issue/" + r.id, class: "key", onclick: (e) => e.stopPropagation() }, keyOf(r))),
      h("td", { class: "summary" }, h("a", { href: "#issue/" + r.id, onclick: (e) => e.stopPropagation() }, r.topic || "(주제 없음)")),
      h("td", { class: "nowrap" }, lz(r.status)),
      h("td", { class: "nowrap" }, h("span", { class: "row", style: "flex-wrap:nowrap" }, avatar(r.agent), agentTitle[r.agent] || r.agent)),
      h("td", { class: "nowrap" }, (r.account ? ACCOUNTS[r.account] || r.account : toolName(r.tool))),
      h("td", { class: "nowrap" }, r.errors ? h("span", { class: "lz red" }, `오류 ${r.errors}`) : h("span", { class: "lz green" }, "통과"), r.warnings ? [" ", h("span", { class: "lz yellow" }, `경고 ${r.warnings}`)] : null),
      h("td", { class: "nowrap" }, usd(r.cost_usd)),
      h("td", { class: "nowrap small", title: ts(r.created) }, short(r.created))))))));
}

// ---------- 승인함 ----------
function renderInbox(root, isUpdate) {
  const done = ["approved", "rejected"];
  const all = filtered(S.runs);
  const list = all.filter((r) => (ui.inboxTab === "open" ? OPEN : done).includes(r.status));
  if (!list.find((r) => r.id === ui.inboxSel)) ui.inboxSel = list.length ? list[0].id : null;
  const tab = (k, label, n) => h("button", { class: ui.inboxTab === k ? "on" : "", role: "tab", "aria-selected": ui.inboxTab === k ? "true" : "false", onclick: () => { ui.inboxTab = k; ui.inboxSel = null; renderInbox(root); } }, label, h("span", { class: "n" }, n));
  const qlist = h("div", { class: "qlist", role: "listbox", "aria-label": "결과물 목록" }, list.map((r) => h("div", { class: "qitem" + (r.id === ui.inboxSel ? " on" : ""), role: "option", tabindex: "0", "aria-selected": r.id === ui.inboxSel ? "true" : "false",
    onclick: () => { ui.inboxSel = r.id; renderInbox(root); if (window.innerWidth < 640) { const d = $(".issue", root); if (d) d.scrollIntoView({ behavior: "smooth", block: "start" }); } }, onkeydown: (e) => { if (e.key === "Enter") { ui.inboxSel = r.id; renderInbox(root); } } },
    h("div", { class: "top" }, typeIcon(), h("span", { class: "key" }, keyOf(r)), lz(r.status), h("span", { class: "small", title: ts(r.created) }, ago(r.created))),
    h("div", { class: "title" }, r.topic || "(주제 없음)"),
    h("div", { class: "small" }, `${r.account ? ACCOUNTS[r.account] || r.account : toolName(r.tool)} · 오류 ${r.errors} · 경고 ${r.warnings}`))));
  const detail = h("div", { id: "inbox-detail" });
  const prevSel = root.dataset.sel, prevStatus = root.dataset.st;
  const selRun = S.runs.find((r) => r.id === ui.inboxSel);
  // 같은 건이 그대로면 오른쪽(입력 중인 메모 포함)은 다시 그리지 않는다
  const keep = isUpdate && prevSel === ui.inboxSel && selRun && prevStatus === selRun.status && $("#inbox-detail", root);
  const right = keep ? $("#inbox-detail", root) : detail;
  root.replaceChildren(...pageHead("3. 승인하기", [h("span", {}, "승인함")], [h("span", { class: "small" }, "승인은 게시가 아니라 「게시 준비 완료」 표시입니다.")]), stepGuide(2),
    h("div", { class: "tabs", role: "tablist" }, tab("open", "처리할 것", all.filter((r) => OPEN.includes(r.status)).length), tab("done", "처리됨", all.filter((r) => done.includes(r.status)).length)),
    list.length ? h("div", { class: "queue" }, qlist, right) : emptyState(ui.inboxTab === "open" ? "처리할 결과물이 없습니다" : "처리된 기록이 없습니다", ui.inboxTab === "open" ? "에이전트가 만든 결과물이 검수를 마치면 여기에 모입니다." : ""));
  root.className = "page";
  root.dataset.sel = ui.inboxSel || ""; root.dataset.st = selRun ? selRun.status : "";
  if (ui.inboxSel && !keep) issueView(ui.inboxSel, detail, { compact: true });
}

// ---------- 이슈 화면(모달·승인함 공용) ----------
async function issueView(id, box, opt = {}) {
  box.replaceChildren(h("div", { class: "small", style: "padding:24px" }, "불러오는 중…"));
  const r = await api("/api/runs/" + encodeURIComponent(id));
  if (!r.ok) { box.replaceChildren(emptyState("작업을 찾을 수 없습니다", r.data.error || "")); return; }
  const run = r.data.run, pkg = r.data.package || {}, v = run.validation || { errors: [], warnings: [] };
  const sum = S.runs.find((x) => x.id === id) || { id, created: run.created };
  const hook = pkg.hook || {};
  box.dataset.st = run.status;
  const scenes = pkg.scenes || [];
  const total = scenes.reduce((a, s) => a + (Number(s.seconds) || 0), 0);

  // 왼쪽
  const left = h("div", {});
  const canDecide = OPEN.includes(run.status);
  const note = h("textarea", { class: "input", rows: "2", placeholder: "메모(반려 사유 등)", "aria-label": "메모" });
  const act = async (d, btn) => {
    btn.disabled = true;
    const res = await api(`/api/runs/${encodeURIComponent(id)}/decision`, { decision: d, note: note.value });
    if (res.ok) flag("ok", d === "approve" ? "승인했습니다" : "반려했습니다", `${keyOf(sum)} · ${d === "approve" ? "게시·예약은 인스타 콘텐츠 예약에서 직접 하세요." : (note.value || "사유 없음")}`);
    else { flag("err", "처리하지 못했습니다", res.data.error || "실패"); btn.disabled = false; }
    await refresh(true);
    if (res.ok) issueView(id, box, opt);
  };
  left.append(...[
    h("div", { class: "crumbs" }, typeIcon(), h("span", { class: "key" }, keyOf(sum)), h("span", { class: "sep" }, "·"), h("span", {}, agentTitle[run.agent] || run.agent)),
    h("h1", { class: "it" }, pkg.topic || (run.params || {}).topic || "(주제 없음)"),
    h("div", { class: "i-actions" },
      canDecide ? h("button", { class: "btn primary", disabled: run.status !== "awaiting_approval", title: run.status !== "awaiting_approval" ? "검수 오류가 있어 승인할 수 없습니다" : "게시 준비 완료로 표시", onclick: (e) => act("approve", e.currentTarget) }, ic("check", 16, 2.5), "승인") : null,
      canDecide ? h("button", { class: "btn", onclick: (e) => act("reject", e.currentTarget) }, ic("x", 16), "반려") : null,
      h("button", { class: "btn subtle", title: "실행 ID 복사", onclick: () => { navigator.clipboard && navigator.clipboard.writeText(run.id).then(() => flag("ok", "복사했습니다", run.id), () => {}); } }, ic("link", 16), "ID 복사")),
    canDecide ? h("div", { class: "field" }, h("label", {}, "결정 메모"), note,
      h("div", { class: "help" }, run.status === "awaiting_approval" ? ((run.tool || "instagram") === "instagram" ? "승인은 「게시 준비 완료」 표시입니다. 게시·예약은 인스타 콘텐츠 예약에서 직접 합니다." : run.tool === "kmong" ? "승인은 「등록 자료 확인 완료」 표시입니다. 크몽 「검수 요청」은 직접 누릅니다." : "승인은 「결과 확인 완료」 표시입니다. 제출·게시·결제는 사람이 직접 합니다.") : "검수 오류가 있어 승인은 막혀 있습니다. 반려하거나 에이전트로 다시 만드세요.")) : null,
    run.status === "error" ? h("div", { class: "msg err" }, ic("err", 20), h("div", {}, h("h4", {}, "실행 오류 — 결과물을 끝까지 만들지 못했습니다"),
      h("div", {}, ((run.history || []).filter((x) => x.status === "error").slice(-1)[0] || {}).note || "오류 내용이 기록되지 않았습니다."))) : validationPanel(v, pkg),
    ["validation_failed", "error", "rejected"].includes(run.status) ? h("div", { class: "row", style: "margin:8px 0 4px" },
      h("button", { class: "btn", onclick: () => { closeModal(true); remake = { ...(run.params || {}), tool: run.tool || "instagram", account: pkg.account || (run.params || {}).account, series: pkg.series || (run.params || {}).series, topic: pkg.topic || (run.params || {}).topic, type: (run.params || {}).type }; go("make"); } }, ic("refresh", 16), "같은 주제로 다시 만들기"),
      h("span", { class: "small" }, "1단계 화면에 주제가 채워집니다. 검수 오류 내용을 메모해 두고 다시 실행하세요.")) : null,
    ...(pkg.document != null ? [h("h4", {}, "결과 문서"), h("pre", { class: "doc-pre" }, pkg.document)] : run.tool === "kmong" ? kmongView(pkg) : [
    h("h4", {}, "후킹(첫 화면)"),
    h("div", { class: "hook-box" }, h("div", {}, hook.line1 || "—"), h("div", { class: "l2" }, hook.line2 || "")),
    h("div", { class: "small", style: "margin-top:6px" }, `후킹 패턴: ${hook.pattern || "-"} · 표지 제목: ${pkg.cover_title || "-"}`),
    pkg.leader_intro ? h("div", { class: "small" }, "지도자 소개: " + pkg.leader_intro) : null,
    h("h4", {}, "미리보기"),
    h("div", { class: "row", style: "align-items:flex-start;gap:20px;flex-wrap:wrap" },
      h("div", { class: "phone" }, h("div", { class: "acc" }, pkg.account || ""), h("div", {}, hook.line1 || ""), h("div", { class: "l2" }, hook.line2 || "")),
      pkg.video_path ? h("video", { src: pkg.video_path, controls: true, style: "max-width:220px;border-radius:12px" }) : null,
      h("div", { class: "small", style: "max-width:320px;line-height:20px" },
        h("div", {}, `전체 ${total.toFixed(1)}초 · 장면 ${scenes.length}개`),
        h("div", {}, pkg.video_path ? "영상 파일: " + pkg.video_path : "영상 없음 — 승인 후 영상 제작 단계(reels-renderer)에서 만들어집니다."),
        h("div", {}, "왼쪽은 첫 화면(후킹)을 글자로 그린 것입니다."))),
    h("h4", {}, `장면 ${scenes.length}개`),
    scenes.length ? h("div", { class: "table-wrap" }, h("table", { class: "t" }, h("thead", {}, h("tr", {}, h("th", {}, "#"), h("th", {}, "화면 글자"), h("th", {}, "초"), h("th", {}, "읽을 대본"))),
      h("tbody", {}, scenes.map((s, i) => h("tr", {}, h("td", { class: "small" }, i + 1), h("td", { style: "white-space:pre-line" }, s.text), h("td", { class: "nowrap" }, s.seconds), h("td", { class: "muted" }, s.voice_text || "")))))) : h("div", { class: "small" }, "장면이 없습니다."),
    h("h4", {}, "캡션"), h("div", { class: "desc", style: "white-space:pre-line" }, pkg.caption || "(없음)"),
    h("h4", {}, "소개 댓글"), h("div", { class: "desc", style: "white-space:pre-line" }, pkg.intro_comment || "(없음)"),
    (pkg.notes || []).length ? [h("h4", {}, "에이전트 메모"), h("ul", {}, pkg.notes.map((n) => h("li", {}, n)))] : null]),
    h("h4", {}, "기록"), historyList(run)].flat(3).filter((x) => x != null && x !== false));

  // 오른쪽
  const field = (k, ...vv) => [h("dt", {}, k), h("dd", {}, ...vv)];
  const grp = S.groups.find((g) => g.agents.some((a) => a.name === run.agent));
  const right = h("div", {},
    h("div", { style: "margin-bottom:16px" }, h("span", { class: "lz bold " + ({ approved: "green", validation_failed: "red", error: "red", awaiting_approval: "yellow", running: "blue", validating: "blue" }[run.status] || ""), style: "height:24px;padding:0 8px;font-size:12px" }, STATUS[run.status] || run.status)),
    h("div", { class: "details" }, h("div", { class: "dh" }, "세부 정보"),
      h("dl", {},
        field("도구", h("span", { class: "tag" }, toolName(run.tool))),
        field("담당", avatar(run.agent), agentTitle[run.agent] || run.agent),
        field("승인", avatar("사람"), "나"),
        ...((pkg.document != null || run.tool === "kmong") ? [] : [
        field("계정", h("span", { class: "tag" }, ACCOUNTS[pkg.account || sum.account] || pkg.account || sum.account || "-")),
        field("시리즈", pkg.series || "-"),
        field("유형", pkg.type || (run.params || {}).type || "-"),
        field("BGM", (pkg.bgm && (pkg.bgm.id || pkg.bgm.name)) ? [pkg.bgm.id, pkg.bgm.name].filter(Boolean).join(" · ") : "-"),
        field("음성", pkg.voice ? pkg.voice.name : "없음")]),
        field("검수", v.errors.length ? h("span", { class: "lz red" }, `오류 ${v.errors.length}`) : h("span", { class: "lz green" }, "통과"), v.warnings.length ? h("span", { class: "lz yellow" }, `경고 ${v.warnings.length}`) : null),
        field("비용", usd(run.cost_usd)),
        field("만든 시각", ts(run.created)),
        field("실행 ID", h("code", { class: "small" }, run.id)))),
    grp && grp.flow_order && grp.flow_order.length ? h("div", { class: "details", style: "margin-top:16px" }, h("div", { class: "dh" }, "진행 단계", h("a", { class: "small", href: "#automation", style: "margin-left:auto;font-weight:400" }, "흐름 편집")), stepper(grp.flow_order, run.status)) : null);

  box.replaceChildren(h("div", { class: "issue" + (opt.compact ? " compact" : "") }, left, right));
}
function validationPanel(v, pkg) {
  if (!v.errors.length && !v.warnings.length) return h("div", { class: "msg ok" }, ic("ok", 20), h("div", {}, h("h4", {}, "규칙 검수 통과"), h("div", {}, "코드 검수기가 찾은 문제가 없습니다.")));
  return [v.errors.length ? h("div", { class: "msg err", style: "margin-bottom:8px" }, ic("err", 20), h("div", {}, h("h4", {}, `오류 ${v.errors.length}건 — 승인 불가`), h("ul", {}, v.errors.map((e) => h("li", {}, h("b", {}, `[${e.rule}] `), e.msg))))) : null,
    v.warnings.length ? h("div", { class: "msg warn" }, ic("warn", 20), h("div", {}, h("h4", {}, `경고 ${v.warnings.length}건 — 확인 필요`), h("ul", {}, v.warnings.map((e) => h("li", {}, h("b", {}, `[${e.rule}] `), e.msg))))) : null];
}
function stepper(flow, status) {
  const whoFor = { queued: "reels-maker", running: "reels-maker", error: "reels-maker", validating: "reels-validator", validation_failed: "reels-validator", awaiting_approval: "사람", rejected: "사람" };
  let idx = flow.findIndex((s) => s.who === whoFor[status]);
  if (status === "approved") idx = flow.findIndex((s) => s.kind === "human") + 1;
  return h("ol", { class: "steps" }, flow.map((s, i) => h("li", { class: idx < 0 ? "" : i < idx ? "done" : i === idx ? "now" : "" }, s.step, h("small", {}, s.who))));
}
function historyList(run) {
  const hist = [...(run.history || [])].reverse();
  if (!hist.length) return h("div", { class: "small" }, "기록이 없습니다.");
  return h("ul", { class: "activity" }, hist.map((x) => h("li", {}, avatar(["approved", "rejected"].includes(x.status) ? "사람" : run.agent),
    h("div", { class: "grow" }, h("div", {}, h("b", {}, ["approved", "rejected"].includes(x.status) ? "나" : (agentTitle[run.agent] || run.agent)), " 상태를 ", lz(x.status), " (으)로 바꿈"), x.note ? h("div", { class: "muted" }, x.note) : null),
    h("span", { class: "when", title: ts(x.ts) }, ago(x.ts)))));
}

// ---------- 팝오버(빠른 검색·알림) ----------
function closePop() { for (const p of $$(".popover")) p.remove(); }
function showPop(anchor, content, cls = "") { closePop(); const p = h("div", { class: "popover " + cls, role: "dialog" }, content); anchor.append(p); return p; }
function quickSearch() {
  const anchor = $(".tb-search"); if (!anchor) return;
  if (!query.trim()) { closePop(); return; }
  const res = filtered(S.runs).slice(0, 6);
  showPop(anchor, [h("div", { class: "pop-h" }, "작업"),
    res.length ? res.map((r) => h("a", { class: "pop-item", href: "#issue/" + r.id, onmousedown: (e) => e.preventDefault(), onclick: () => { closePop(); openIssue(r.id); } },
      typeIcon(), h("div", { class: "grow", style: "min-width:0" }, h("div", { class: "ellipsis" }, r.topic || "(주제 없음)"), h("div", { class: "small" }, `${keyOf(r)} · ${ACCOUNTS[r.account] || r.account || ""}`)), lz(r.status)))
      : h("div", { class: "pop-item small" }, "맞는 작업이 없습니다."),
    h("a", { class: "pop-foot", href: "#list", onmousedown: (e) => e.preventDefault(), onclick: closePop }, ic("search", 14), `「${query}」 목록에서 모두 보기`)], "wide");
}
function toggleBell() {
  const anchor = $("#bell").parentElement;
  if ($(".popover.bell")) { closePop(); return; }
  const seen = store.get("bellSeen", "");
  const evs = [...S.events].reverse().filter((e) => e.kind === "blocked" || e.kind === "status").slice(0, 8);
  const p = showPop(anchor, [h("div", { class: "pop-h row" }, h("span", { class: "grow" }, "알림"), h("a", { href: "#activity", class: "small", onclick: closePop }, "활동 전체")),
    evs.length ? evs.map((e) => { const run = e.run && S.runs.find((r) => r.id === e.run);
      return h("a", { class: "pop-item" + ((e.ts || "") > seen ? " unread" : ""), href: run ? "#issue/" + run.id : "#activity", onclick: closePop },
        h("span", { class: "avatar", style: `--av:${e.kind === "blocked" ? "#C9372C" : "#1D7AFC"}` }, ic(e.kind === "blocked" ? "shield" : "refresh", 13, 2.4)),
        h("div", { class: "grow", style: "min-width:0" }, h("div", {}, h("b", {}, e.kind === "blocked" ? "훅이 막음" : (run ? keyOf(run) : "상태")), " · ", agentTitle[e.agent] || e.agent || ""),
          h("div", { class: "small ellipsis2" }, e.kind === "blocked" ? [e.tool, e.reason].filter(Boolean).join(" · ") : e.detail)),
        h("span", { class: "small", style: "white-space:nowrap" }, ago(e.ts))); })
      : h("div", { class: "pop-item small" }, "새 알림이 없습니다.")], "bell");
  p.addEventListener("click", (e) => e.stopPropagation());
  const last = S.events.length ? S.events[S.events.length - 1].ts : ""; store.set("bellSeen", last); updateChrome();
}
function toggleMe() {
  if ($(".popover.me")) { closePop(); return; }
  const p = showPop($("#me").parentElement, [h("div", { class: "pop-h row" }, avatar("사람", "lg"), h("div", {}, h("div", {}, "나"), h("div", { class: "small" }, "승인 담당 · " + ((S.branding && S.branding.customer_name) || "")))),
    h("div", { class: "pop-h" }, "테마"), h("div", { style: "padding:0 16px 8px" }, themePicker()),
    h("a", { class: "pop-item", href: "#settings", onclick: closePop }, ic("settings", 16), "프로젝트 설정"),
    h("a", { class: "pop-item", href: "#", onclick: (e) => { e.preventDefault(); closePop(); openShortcuts(); } }, ic("keyboard", 16), "단축키")], "me");
  p.style.width = "300px";
  p.addEventListener("click", (e) => e.stopPropagation());
}
document.addEventListener("click", (e) => { if (!e.target.closest(".popover") && !e.target.closest("#bell") && !e.target.closest("#me")) { for (const b of $$(".popover.bell, .popover.me")) b.remove(); } });

// ---------- 모달 ----------
function openModal(content, { size = "", onClose, label = "대화 상자", side = false } = {}) {
  closeModal(true);
  const modal = h("div", { class: "modal " + size + (side ? " drawer" : ""), role: "dialog", "aria-modal": "true", "aria-label": label }, content);
  const blanket = h("div", { class: "blanket" + (side ? " side" : ""), onmousedown: (e) => { if (e.target === blanket) (onClose || closeModal)(); } }, modal);
  blanket._onClose = onClose;
  $("#modal-root").append(blanket);
  modal.tabIndex = -1;
  setTimeout(() => { const f = modal.querySelector("[autofocus]"); (f || modal).focus({ preventScroll: true }); }, 30);
  return modal;
}
function closeModal(silent) { const b = $(".blanket"); if (!b) return; b.remove(); if (!silent && b._onClose) b._onClose(); }
function openIssueModal(id) {
  const existing = $(".blanket[data-issue]");
  if (existing && existing.dataset.issue === id) return;
  const body = h("div", { class: "modal-b", id: "issue-body" });
  const run = S.runs.find((r) => r.id === id);
  const back = () => { closeModal(true); location.hash = lastPage || "board"; };
  const m = openModal([h("div", { class: "modal-h", style: "padding-bottom:0" },
    h("span", { class: "btn-group" }, h("button", { class: "tb-icon", title: "이전 작업 (K)", "aria-label": "이전 작업", onclick: () => stepIssue(-1) }, h("span", { style: "display:inline-flex;transform:rotate(180deg)" }, ic("chevD", 18))),
      h("button", { class: "tb-icon", title: "다음 작업 (J)", "aria-label": "다음 작업", onclick: () => stepIssue(1) }, ic("chevD", 18))),
    h("span", { class: "small", id: "issue-pos" }, issuePos(id)),
    h("button", { class: "tb-icon x", title: "닫기 (Esc)", "aria-label": "닫기", onclick: back }, ic("x", 20))), body], { onClose: back, label: "작업 상세" });
  m.parentElement.dataset.issue = id;
  issueView(id, body);
}
function issueOrder() { return filtered(S.runs); }
function issuePos(id) { const l = issueOrder(); const i = l.findIndex((r) => r.id === id); return i < 0 ? "" : `${i + 1} / ${l.length}`; }
function stepIssue(d) {
  const b = $(".blanket[data-issue]"); if (!b) return;
  const l = issueOrder(); const i = l.findIndex((r) => r.id === b.dataset.issue);
  const nx = l[i + d]; if (!nx) return;
  b.dataset.issue = nx.id; history.replaceState(null, "", "#issue/" + nx.id); route = { page: "issue", id: nx.id };
  const pos = $("#issue-pos"); if (pos) pos.textContent = issuePos(nx.id);
  issueView(nx.id, $("#issue-body"));
}
function refreshIssueModal() {
  const b = $(".blanket[data-issue]"); if (!b) return;
  const run = S.runs.find((r) => r.id === b.dataset.issue);
  const body = $("#issue-body");
  if (run && body && body.dataset.st !== run.status && !busyTyping()) issueView(run.id, body);
}

let remake = null;
ui.makeTool = store.get("makeTool", "instagram");
function makeTabs() {
  const tools = runTools(); if (tools.length < 2) return null;
  return h("div", { class: "btn-group make-tabs", role: "tablist", "aria-label": "도구 고르기" }, tools.map((t) => h("button", { class: "btn" + (ui.makeTool === t.id ? " sel" : " subtle"), role: "tab", "aria-selected": String(ui.makeTool === t.id),
    onclick: () => { ui.makeTool = t.id; store.set("makeTool", t.id); renderMake($("#page")); } }, (t.icon ? t.icon + " " : "") + t.name)));
}
function renderMake(root) {
  const tools = runTools();
  if (!tools.length) {
    root.replaceChildren(...pageHead("1. 만들기"), h("div", { class: "msg disc" }, ic("info", 20), h("div", { class: "grow" }, h("h4", {}, "켜진 도구가 없습니다"), h("div", {}, "「도구」에서 쓸 도구를 켜고 에이전트를 연결하세요."),
      h("button", { class: "btn primary sm", style: "margin-top:8px", onclick: () => go("tools") }, "도구로 가기"))));
    root.className = "page"; return;
  }
  if (remake && remake.tool && tools.some((t) => t.id === remake.tool)) ui.makeTool = remake.tool;
  if (!tools.some((t) => t.id === ui.makeTool)) ui.makeTool = tools[0].id;
  if (ui.makeTool !== "instagram") return renderMakeGeneric(root, TOOL[ui.makeTool]);
  if (!Object.keys(ACCOUNTS).length) {
    root.replaceChildren(...pageHead("1. 만들기"), stepGuide(0), makeTabs(), h("div", { class: "msg disc" }, ic("info", 20), h("div", { class: "grow" }, h("h4", {}, "인스타그램 계정을 먼저 등록하세요"),
      h("div", {}, "「도구 → 인스타그램」에서 계정 ID·이름·음성 여부를 넣으면 여기서 고를 수 있습니다."), h("button", { class: "btn primary sm", style: "margin-top:8px", onclick: () => go("tools") }, "도구로 가기"))));
    root.className = "page"; return;
  }
  return renderMakeInsta(root);
}
function renderMakeGeneric(root, t) {
  const pre = remake || {}; remake = null;
  const run = t.run || {}, inputs = {};
  const fields = (run.form || []).map((f) => {
    const id = "g-" + f.key;
    const el = f.type === "select" ? h("select", { class: "input", id }, (f.options || []).map(([v, l]) => h("option", { value: v, selected: pre[f.key] === v }, l)))
      : f.type === "textarea" ? h("textarea", { class: "input", id, rows: 4, placeholder: f.placeholder || "" }, pre[f.key] || "")
      : h("input", { class: "input", id, placeholder: f.placeholder || "", value: pre[f.key] || "" });
    inputs[f.key] = el;
    return h("div", { class: "field" }, h("label", { for: id }, f.label + (f.required ? " *" : "")), el);
  });
  const q = (v) => `"${String(v).replace(/"/g, "'")}"`;
  const cmd = h("code", { class: "cmd" });
  const upd = () => {
    const parts = [`python -m hub.runner --tool ${t.id}`];
    for (const [k, el] of Object.entries(inputs)) { const v = el.value.trim(); if (!v) continue;
      parts.push(["topic", "work", "details"].includes(k) ? `--${k} ${q(v)}` : `--param ${k}=${q(v)}`); }
    if (!inputs.topic || !inputs.topic.value.trim()) parts.push('--topic "요청"');
    cmd.textContent = parts.join(" ");
  };
  for (const el of Object.values(inputs)) el.addEventListener("input", upd);
  upd();
  const agentOk = (t.agents || []).includes(run.agent);
  const demo = async (btn, scen) => { btn.disabled = true; const r = await api("/api/demo", { scenario: scen, tool: t.id, topic: inputs.topic ? inputs.topic.value : "" });
    if (r.ok) { flag("ok", "시험 실행을 시작했습니다", "2단계 「진행 확인」에서 볼 수 있어요."); setTimeout(() => { refresh(true); go("board"); }, 800); } else { flag("err", "시작하지 못했습니다", r.data.error || "실패"); btn.disabled = false; } };
  root.replaceChildren(...pageHead("1. 만들기", [h("span", {}, t.name)]), stepGuide(0), makeTabs(),
    h("div", { class: "grid g2 make-grid" },
      h("div", { class: "card" }, h("h3", { class: "sub" }, "① 무엇을 맡길까"), ...fields,
        h("div", { class: "small" }, `맡을 에이전트: ${agentTitle[run.agent] || run.agent}`, agentOk ? null : h("span", { class: "lz red", style: "margin-left:6px" }, "연결 안 됨 — 「도구」에서 연결"))),
      h("div", { class: "card" }, h("h3", { class: "sub" }, "② 실제로 맡기기(비용 발생)"),
        h("ol", { class: "how" },
          h("li", {}, "파일 탐색기에서 Agent Hub 설치 폴더를 엽니다."),
          h("li", {}, "위쪽 주소창을 눌러 cmd 라고 치고 Enter — 그 폴더에서 검은 창이 열립니다."),
          h("li", {}, "아래 명령을 복사해 붙여 넣고 Enter. 끝나면 2단계에 나타납니다.")),
        cmd, h("div", { class: "row", style: "margin-top:8px" }, h("button", { class: "btn primary", onclick: () => navigator.clipboard && navigator.clipboard.writeText(cmd.textContent).then(() => flag("ok", "명령을 복사했습니다", "cmd 창에 붙여 넣으세요."), () => {}) }, ic("copy", 16), "명령 복사")),
        h("div", { class: "help" }, `결과는 문서(${run.output || "result.md"})로 나오고, 3단계에서 승인합니다. 제출·게시·결제는 사람이 합니다.`),
        h("h3", { class: "sub", style: "margin-top:20px" }, "③ 먼저 시험해 보기(비용 없음)"),
        h("div", { class: "row" }, h("button", { class: "btn", onclick: (e) => demo(e.currentTarget, "ok") }, "통과 예시로 시험"), h("button", { class: "btn subtle", onclick: (e) => demo(e.currentTarget, "bad") }, "검수 실패 예시로 시험")))));
  root.className = "page";
}
function renderMakeInsta(root) {
  const pre = remake || {}; remake = null;
  const acc = h("select", { class: "input", id: "m-acc" }, Object.entries(ACCOUNTS).map(([k, v]) => h("option", { value: k, selected: pre.account === k }, `${v} (${k})`)));
  const type = h("select", { class: "input", id: "m-type" }, h("option", { value: "general", selected: pre.type !== "person" }, "일반"), h("option", { value: "person", selected: pre.type === "person" }, "인물"));
  const series = h("input", { class: "input", id: "m-series", placeholder: "예) 생활 꿀팁", value: pre.series || "" });
  const topic = h("input", { class: "input", id: "m-topic", placeholder: "예) 전세 계약 전 확인 3가지", value: pre.topic || "" });
  const cmd = h("code", { class: "cmd" });
  const upd = () => { cmd.textContent = `python -m hub.runner --tool instagram --account ${acc.value}${series.value ? ` --series "${series.value}"` : ""}${type.value === "person" ? " --type person" : ""} --topic "${topic.value || "주제"}"`; };
  for (const el of [acc, series, type, topic]) el.addEventListener("input", upd);
  upd();
  const plan = h("div", { id: "m-plan" });
  (async () => { try { const r = await api(`/api/plans/${ymd(new Date()).slice(0, 7)}/${acc.value}`); const it = (r.data.items || []).find((x) => x.date === ymd(new Date()));
    if (it) plan.replaceChildren(h("div", { class: "msg disc" }, ic("calendar", 20), h("div", { class: "grow" }, h("h4", {}, "오늘 캘린더 계획"), h("div", {}, `${it.topic} · ${it.type}${it.title ? " · " + it.title : ""}`),
      h("button", { class: "btn sm", style: "margin-top:8px", onclick: () => { series.value = it.topic; topic.value = it.title || `${it.topic} ${it.type}`; upd(); } }, "이 계획으로 채우기")))); } catch {} })();
  const demo = async (btn, scen) => { btn.disabled = true; const r = await api("/api/demo", { scenario: scen, account: acc.value, series: series.value, type: type.value });
    if (r.ok) { flag("ok", "시험 실행을 시작했습니다", "2단계 「진행 확인」에서 볼 수 있어요."); setTimeout(() => { refresh(true); go("board"); }, 800); } else { flag("err", "시작하지 못했습니다", r.data.error || "실패"); btn.disabled = false; } };
  root.replaceChildren(...pageHead("1. 만들기", [h("span", {}, "인스타그램 릴스")]), stepGuide(0), makeTabs(),
    h("div", { class: "grid g2 make-grid" },
      h("div", { class: "card" }, h("h3", { class: "sub" }, "① 무엇을 만들까"),
        h("div", { class: "grid g2", style: "gap:0 16px" }, h("div", { class: "field" }, h("label", { for: "m-acc" }, "계정"), acc), h("div", { class: "field" }, h("label", { for: "m-type" }, "유형"), type)),
        h("div", { class: "field" }, h("label", { for: "m-series" }, "시리즈"), series),
        h("div", { class: "field" }, h("label", { for: "m-topic" }, "주제"), topic, h("div", { class: "help" }, "오늘 급상승 뉴스나 캘린더 계획에서 고릅니다. 첫 화면 후킹은 「내가 ○○ 안 하면 / ○○ 당해요」 형식으로 에이전트가 만듭니다.")),
        plan),
      h("div", { class: "card" }, h("h3", { class: "sub" }, "② 실제로 만들기(비용 발생)"),
        h("ol", { class: "how" },
          h("li", {}, "파일 탐색기에서 Agent Hub 설치 폴더를 엽니다."),
          h("li", {}, "위쪽 주소창을 눌러 cmd 라고 치고 Enter — 그 폴더에서 검은 창이 열립니다."),
          h("li", {}, "아래 명령을 복사해 붙여 넣고 Enter. 몇 분 뒤 2단계에 나타납니다.")),
        cmd, h("div", { class: "row", style: "margin-top:8px" }, h("button", { class: "btn primary", onclick: () => navigator.clipboard && navigator.clipboard.writeText(cmd.textContent).then(() => flag("ok", "명령을 복사했습니다", "cmd 창에 붙여 넣으세요(오른쪽 클릭 또는 Ctrl+V)."), () => {}) }, ic("copy", 16), "명령 복사")),
        h("div", { class: "help" }, ".env 에 API 키가 있어야 합니다. 하루 한도를 넘으면 실행이 멈춥니다."),
        h("h3", { class: "sub", style: "margin-top:20px" }, "③ 먼저 시험해 보기(비용 없음)"),
        h("div", { class: "small", style: "margin-bottom:8px" }, "에이전트를 부르지 않고 가짜 결과물로 2~4단계 흐름을 확인합니다."),
        h("div", { class: "row" }, h("button", { class: "btn", onclick: (e) => demo(e.currentTarget, "ok") }, "통과 예시로 시험"), h("button", { class: "btn subtle", onclick: (e) => demo(e.currentTarget, "bad") }, "검수 실패 예시로 시험")))));
  root.className = "page";
}


// 크몽 서비스 자료 보기
function kmongView(pkg) {
  const won = (n) => (Number(n) || 0).toLocaleString("ko-KR") + "원";
  return [h("h4", {}, "서비스 제목"), h("div", { class: "hook-box" }, h("div", {}, pkg.title || "—")),
    h("div", { class: "small", style: "margin-top:6px" }, `${{ service: "용역", ebook: "전자책", knowhow: "노하우·자료" }[pkg.kind] || pkg.kind || ""} · ${pkg.category || "-"}`),
    h("h4", {}, "요약"), h("div", { class: "desc" }, pkg.summary || "(없음)"),
    h("h4", {}, "패키지"),
    h("div", { class: "table-wrap" }, h("table", { class: "t" }, h("thead", {}, h("tr", {}, ["", "이름", "가격", "작업일", "수정", "제공 내용"].map((x) => h("th", {}, x)))),
      h("tbody", {}, (pkg.packages || []).map((x) => h("tr", {}, h("td", { class: "small" }, x.name || ""), h("td", {}, x.title || ""), h("td", { class: "nowrap" }, won(x.price)),
        h("td", { class: "nowrap" }, (x.days || "-") + "일"), h("td", {}, x.revisions ?? "-"), h("td", { class: "muted" }, (x.includes || []).join(", "))))))),
    h("h4", {}, "상세 설명"), h("pre", { class: "doc-pre" }, pkg.description || "(없음)"),
    (pkg.faq || []).length ? [h("h4", {}, "자주 묻는 질문"), h("ul", {}, pkg.faq.map((f) => h("li", {}, h("b", {}, f.q), h("div", { class: "small" }, f.a))))] : null,
    (pkg.keywords || []).length ? h("div", { class: "small", style: "margin-top:8px" }, "검색 키워드: " + pkg.keywords.join(", ")) : null,
    (pkg.notes || []).length ? [h("h4", {}, "에이전트 메모"), h("ul", {}, pkg.notes.map((n) => h("li", {}, n)))] : null,
    h("div", { class: "msg disc", style: "margin-top:12px" }, ic("info", 20), h("div", {}, "승인하면 「크몽 등록 화면 채우기」 에이전트가 임시저장까지 합니다(연결돼 있을 때). 「검수 요청」은 크몽에서 직접 누르세요."))];
}

// ---------- 도구(판매 단위): 켜기·끄기, 에이전트 연결, 도구 설정 ----------
ui.tools = { open: store.get("toolOpen", "instagram") };
function renderTools(root, isUpdate) {
  if (isUpdate && root.dataset.dirty === "1") return;   // 고치는 중이면 다시 그리지 않음
  root.dataset.dirty = "";
  const lic = S.license || {};
  const allAgents = {}; for (const g of S.groups) for (const a of g.agents) allAgents[a.name] = a;
  const shared = (S.groups.find((g) => g.id === "shared") || { agents: [] }).agents.map((a) => a.name);
  const post = async (url, body, okMsg) => { const r = await api(url, body); if (r.ok) { if (okMsg) flag("ok", okMsg, ""); root.dataset.dirty = ""; refresh(true); } else flag("err", "저장하지 못했습니다", r.data.error || "실패"); return r; };
  const card = (t) => {
    const open = ui.tools.open === t.id;
    const st = t.core ? ["기본 포함", "blue"] : !t.entitled ? ["요금제에 없음", ""] : t.enabled ? ["켜짐", "green"] : ["꺼짐", ""];
    const head = h("button", { class: "tool-h", "aria-expanded": String(open), onclick: () => { ui.tools.open = open ? "" : t.id; store.set("toolOpen", ui.tools.open); renderTools(root); } },
      h("span", { class: "tool-ic", "aria-hidden": "true" }, t.icon || "🧩"),
      h("span", { class: "grow", style: "min-width:0;text-align:left" }, h("b", {}, t.name), t.beta ? h("span", { class: "lz purple", style: "margin-left:6px" }, "베타") : null,
        h("div", { class: "small ellipsis" }, t.summary)),
      h("span", { class: "lz " + st[1] }, st[0]), h("span", { class: "small nowrap", style: "margin-left:8px" }, `에이전트 ${t.agents.length}`));
    if (!open) return h("section", { class: "card flat tool-card" }, head);
    const runAgent = (t.run || {}).agent;
    const cands = [...new Set([...t.team_agents, ...t.agents, ...shared])].filter((n) => allAgents[n]);
    const chip = (n) => { const on = t.agents.includes(n), a = allAgents[n];
      return h("button", { class: "agent-chip" + (on ? " on" : ""), "aria-pressed": String(on), title: a.role || "",
        onclick: (e) => { e.currentTarget.disabled = true; post(`/api/tools/${t.id}/agents`, { agent: n, on: !on }); } },
        on ? ic("check", 14) : ic("plus", 14), a.title || n, n === runAgent ? h("span", { class: "small" }, " · 기본 실행") : null); };
    const body = [
      h("div", { class: "row", style: "gap:6px;flex-wrap:wrap;margin:4px 0 12px" }, (t.highlights || []).map((x) => h("span", { class: "tag" }, x))),
      t.core ? null : h("div", { class: "row", style: "margin-bottom:16px" },
        !t.entitled ? h("div", { class: "msg disc grow" }, ic("info", 20), h("div", {}, "지금 요금제에 이 도구가 없습니다. 웹 콘솔에서 요금제를 올리면 켤 수 있습니다."))
          : h("button", { class: "btn " + (t.enabled ? "" : "primary"), onclick: (e) => { e.currentTarget.disabled = true; post(`/api/tools/${t.id}`, { enabled: !t.enabled }, t.enabled ? "도구를 껐습니다" : "도구를 켰습니다"); } }, t.enabled ? "끄기" : "켜기"),
        h("span", { class: "small" }, `버전 ${t.version || "-"}`)),
      h("h4", {}, "연결한 에이전트"),
      h("div", { class: "small", style: "margin-bottom:8px" }, "눌러서 연결·해제합니다. 연결한 에이전트만 이 도구의 일을 맡을 수 있습니다(실행기가 확인)."),
      h("div", { class: "agent-chips" }, cands.map(chip)),
      runAgent && !t.agents.includes(runAgent) ? h("div", { class: "msg err", style: "margin-top:8px" }, ic("err", 20), h("div", {}, `기본 실행 에이전트(${allAgents[runAgent] ? allAgents[runAgent].title : runAgent})가 연결되어 있지 않아 「만들기」가 막힙니다.`)) : null,
      t.id === "instagram" ? instaSettings(t, root, post) : null,
      (t.external || []).length ? [h("h4", {}, "따로 설치해서 쓰는 외부 도구"), h("ul", { class: "small" }, t.external.map((x) => h("li", {}, `${x.name} (${x.license}) — ${x.how}`)))] : null,
      (t.safety || []).length ? [h("h4", {}, "안전 장치"), h("ul", { class: "small" }, t.safety.map((x) => h("li", {}, x)))] : null,
    ];
    return h("section", { class: "card flat tool-card open" }, head, h("div", { class: "tool-b" }, ...body.flat().filter(Boolean)));
  };
  const planLine = lic.plan ? `요금제: ${{ trial: "평가판", starter: "스타터", pro: "프로", team: "팀", legacy: "판매자용" }[lic.plan] || lic.plan}` : "";
  root.replaceChildren(...pageHead("도구", [h("span", {}, "도구를 켜고, 일할 에이전트를 연결합니다")], [h("span", { class: "small" }, planLine)]),
    h("div", { class: "msg disc", style: "margin-bottom:16px" }, ic("info", 20), h("div", {}, "도구 = 인스타그램·웹소설 같은 일의 묶음(규칙·검수기·스킬 포함). 에이전트 = 일하는 직원. 도구에 에이전트를 연결해야 그 일을 맡길 수 있습니다. 요금제에 든 도구만 켤 수 있습니다.")),
    ...(S.tools || []).map(card));
  root.className = "page narrow";
}
function instaSettings(t, root, post) {
  const set = t.settings || {}, rules = t.rules || {};
  let rows = (set.accounts || []).map((a) => ({ ...a }));
  const dirty = () => { root.dataset.dirty = "1"; };
  const tbody = h("tbody");
  const draw = () => tbody.replaceChildren(...rows.map((a, i) => h("tr", {},
    h("td", {}, h("input", { class: "input", value: a.id, "aria-label": "계정 ID", oninput: (e) => { a.id = e.target.value.trim(); dirty(); } })),
    h("td", {}, h("input", { class: "input", value: a.label || "", "aria-label": "이름", oninput: (e) => { a.label = e.target.value; dirty(); } })),
    h("td", {}, h("select", { class: "input", "aria-label": "음성", onchange: (e) => { a.profile = e.target.value; a.skill = a.profile === "silent" ? "insta-silent" : "insta-reels"; dirty(); } },
      h("option", { value: "voice", selected: a.profile !== "silent" }, "음성 있음"), h("option", { value: "silent", selected: a.profile === "silent" }, "무음"))),
    h("td", { style: "text-align:center" }, h("input", { type: "checkbox", checked: !!a.person_intro, "aria-label": "인물 소개 필수", onchange: (e) => { a.person_intro = e.target.checked; dirty(); } })),
    h("td", {}, h("input", { class: "input", value: (a.topics || []).join(", "), placeholder: "캘린더 주제(쉼표)", "aria-label": "주제", oninput: (e) => { a.topics = e.target.value.split(",").map((x) => x.trim()).filter(Boolean); dirty(); } })),
    h("td", {}, h("button", { class: "tb-icon", "aria-label": "계정 지우기", onclick: () => { rows.splice(i, 1); dirty(); draw(); } }, ic("x", 16))))));
  draw();
  const csv = (v) => (v || []).join(", ");
  const R = { banned_bgm: h("input", { class: "input", value: csv(rules.banned_bgm), placeholder: "예: M1, M3" }), world_series_prefix: h("input", { class: "input", value: rules.world_series_prefix || "", placeholder: "예: 세계의" }),
    world_rotation: h("input", { class: "input", value: csv(rules.world_rotation), placeholder: "예: M1, M3, M6" }), voice_name: h("input", { class: "input", value: rules.voice_name || "" }),
    reading_chars_per_sec: h("input", { class: "input", type: "number", step: "0.5", value: rules.reading_chars_per_sec ?? 6 }), min_scene_seconds: h("input", { class: "input", type: "number", step: "0.5", value: rules.min_scene_seconds ?? 2.5 }) };
  for (const el of Object.values(R)) el.addEventListener("input", dirty);
  const list = (el) => el.value.split(",").map((x) => x.trim()).filter(Boolean);
  const save = async (btn) => {
    if (!rows.length || rows.some((a) => !/^[A-Za-z0-9._-]{1,40}$/.test(a.id))) return flag("err", "계정 ID를 확인하세요", "영문·숫자·점·밑줄·하이픈만, 계정은 1개 이상");
    btn.disabled = true;
    await post(`/api/tools/${t.id}`, { settings: { accounts: rows } });
    await post(`/api/tools/${t.id}/rules`, { rules: { banned_bgm: list(R.banned_bgm), world_series_prefix: R.world_series_prefix.value.trim(), world_rotation: list(R.world_rotation),
      voice_name: R.voice_name.value.trim(), reading_chars_per_sec: R.reading_chars_per_sec.value, min_scene_seconds: R.min_scene_seconds.value } }, "인스타그램 설정을 저장했습니다");
    btn.disabled = false;
  };
  const f = (label, el, help) => h("div", { class: "field" }, h("label", {}, label), el, help ? h("div", { class: "help" }, help) : null);
  return [h("h4", {}, "계정"),
    h("div", { class: "small", style: "margin-bottom:8px" }, "릴스를 만들 계정. 무음 계정은 음성 없이 인스타 무료 음원으로 만듭니다. 계정 ID 는 패키지·캘린더에 쓰입니다(로그인 정보는 받지 않습니다)."),
    h("div", { class: "table-wrap" }, h("table", { class: "t" }, h("thead", {}, h("tr", {}, ["계정 ID", "이름", "음성", "인물 소개", "캘린더 주제", ""].map((x) => h("th", {}, x)))), tbody)),
    h("button", { class: "btn sm", style: "margin-top:8px", onclick: () => { rows.push({ id: "", label: "", profile: "voice", skill: "insta-reels", person_intro: false, topics: [] }); dirty(); draw(); } }, ic("plus", 14), "계정 추가"),
    h("h4", {}, "검수 규칙"),
    h("div", { class: "grid g2", style: "gap:0 16px" }, f("금지 BGM 곡 번호", R.banned_bgm, "비우면 검사 안 함"), f("기본 음성(Edge TTS 이름)", R.voice_name),
      f("로테이션 시리즈 이름 앞부분", R.world_series_prefix, "이 글자로 시작하는 시리즈만 아래 곡을 순서대로"), f("시리즈 로테이션 곡", R.world_rotation),
      f("읽기 속도(초당 글자, 공백 포함)", R.reading_chars_per_sec), f("장면 최소 시간(초)", R.min_scene_seconds)),
    h("div", { class: "row" }, h("button", { class: "btn primary", onclick: (e) => save(e.currentTarget) }, "저장"), h("span", { class: "small" }, "저장하면 다음 실행부터 검수기가 이 값을 씁니다."))];
}

// ---------- 4단계: 게시하기(복사 + 인스타 콘텐츠 예약, 자동 게시 없음) ----------
const pkgCache = {};
async function renderPublish(root, isUpdate) {
  const posted = postedIds();
  const approved = S.runs.filter((r) => r.status === "approved" && (r.tool || "instagram") === "instagram");
  const todo = approved.filter((r) => !posted.has(r.id)), done = approved.filter((r) => posted.has(r.id));
  if (isUpdate && root.dataset.sig === todo.map((r) => r.id).join()) return;
  root.dataset.sig = todo.map((r) => r.id).join();
  const copyBtn = (label, text) => h("button", { class: "btn sm", disabled: !text, onclick: () => navigator.clipboard && navigator.clipboard.writeText(text).then(() => flag("ok", label + " 복사했습니다", ""), () => {}) }, ic("copy", 14), label + " 복사");
  const card = (r) => {
    const box = h("div", { class: "card pub-card" }, h("div", { class: "row" }, typeIcon(), h("a", { class: "key", href: "#issue/" + r.id }, keyOf(r)), h("b", { class: "grow ellipsis" }, r.topic || ""), h("span", { class: "tag" }, ACCOUNTS[r.account] || r.account)), h("div", { class: "small" }, "불러오는 중…"));
    (async () => {
      const pkg = pkgCache[r.id] || (pkgCache[r.id] = (await api("/api/runs/" + r.id)).data.package || {});
      const isPosted = postedIds().has(r.id);
      box.replaceChildren(
        h("div", { class: "row" }, typeIcon(), h("a", { class: "key", href: "#issue/" + r.id }, keyOf(r)), h("b", { class: "grow ellipsis" }, pkg.topic || r.topic || ""), h("span", { class: "tag" }, ACCOUNTS[r.account] || r.account)),
        h("div", { class: "pub-row" }, h("div", { class: "lbl" }, "영상"), pkg.video_path ? h("code", { class: "small" }, pkg.video_path)
          : h("div", { class: "small" }, "영상 파일이 아직 없습니다. 「영상 제작」 에이전트(reels-renderer)는 예정 상태라, 지금은 PC에 있는 영상 제작 도구로 따로 만듭니다.")),
        h("div", { class: "pub-row" }, h("div", { class: "lbl" }, "캡션"), h("div", { class: "pub-text" }, pkg.caption || "(없음)"), copyBtn("캡션", pkg.caption)),
        h("div", { class: "pub-row" }, h("div", { class: "lbl" }, "소개 댓글"), h("div", { class: "pub-text" }, pkg.intro_comment || "(없음)"), copyBtn("소개 댓글", pkg.intro_comment)),
        pkg.dm_cta ? h("div", { class: "pub-row" }, h("div", { class: "lbl" }, "댓글 키워드"), h("div", { class: "pub-text" }, `「${pkg.dm_cta.keyword}」 — ${pkg.dm_cta.comment_line || ""}`)) : null,
        h("div", { class: "row", style: "margin-top:8px" },
          h("button", { class: "btn " + (isPosted ? "sel" : "primary"), onclick: () => { const s = postedIds(); s.has(r.id) ? s.delete(r.id) : s.add(r.id); store.set("posted", [...s]); delete root.dataset.sig; renderPublish(root); updateChrome(); } }, ic("check", 16), isPosted ? "예약함(되돌리기)" : "예약했어요"),
          h("span", { class: "small" }, "이 표시는 이 브라우저에만 저장됩니다.")));
    })();
    return box;
  };
  root.replaceChildren(...pageHead("4. 게시하기", [h("span", {}, "인스타 콘텐츠 예약")]), stepGuide(3),
    h("div", { class: "card", style: "margin-bottom:16px" }, h("h3", { class: "sub" }, "올리는 순서(인스타 앱, 직접)"),
      h("ol", { class: "how" },
        h("li", {}, "프로필 ☰ → 프로페셔널 대시보드 → 모범사례 → 도달 → 카메라 버튼으로 릴스 올리기(+ 버튼 말고)."),
        h("li", {}, "아래 「캡션 복사」를 눌러 붙여 넣기. 캡션에는 링크를 넣지 않습니다(링크는 프로필 대표 링크)."),
        h("li", {}, "「고급 설정」 → 「예약」으로 날짜·시간을 정해 콘텐츠 예약. Claude 예약 작업은 쓰지 않습니다."),
        h("li", {}, "올라가면 「소개 댓글 복사」로 내 게시물에 소개 댓글을 답니다(모든 게시물)."),
        h("li", {}, "다 했으면 「예약했어요」를 누릅니다."))),
    h("h2", { class: "sec" }, `게시할 것 ${todo.length}`),
    todo.length ? h("div", { class: "pub-list" }, todo.map(card)) : emptyState("게시할 것이 없습니다", "3단계에서 승인한 결과물이 여기에 모입니다."),
    done.length ? h("details", { style: "margin-top:24px" }, h("summary", {}, `예약한 것 ${done.length}`), h("div", { class: "pub-list" }, done.map(card))) : null);
  root.className = "page narrow";
}

function openCreate(pre = {}) {
  if (pre instanceof Event) pre = {};
  const acc = h("select", { class: "input", id: "c-acc" }, Object.entries(ACCOUNTS).map(([k, v]) => h("option", { value: k, selected: pre.account === k }, `${v} (${k})`)));
  const scen = h("select", { class: "input", id: "c-scen" }, h("option", { value: "ok" }, "규칙 통과 예시"), h("option", { value: "bad" }, "규칙 위반 예시"));
  const series = h("input", { class: "input", id: "c-series", placeholder: "예) 생활 꿀팁", value: pre.series || "" });
  const type = h("select", { class: "input", id: "c-type" }, h("option", { value: "general" }, "일반"), h("option", { value: "person" }, "인물"));
  const topic = h("input", { class: "input", id: "c-topic", placeholder: "예) 전세 계약 전 확인 3가지", autofocus: true, value: pre.topic || "" });
  const cmd = h("code", { class: "small", style: "display:block;white-space:pre-wrap;overflow-wrap:anywhere" });
  const upd = () => { cmd.textContent = `python -m hub.runner --tool instagram --account ${acc.value}${series.value ? ` --series "${series.value}"` : ""}${type.value === "person" ? " --type person" : ""} --topic "${topic.value || "주제"}"`; };
  for (const el of [acc, series, type, topic]) el.addEventListener("input", upd);
  upd();
  const runDemo = async (btn) => {
    btn.disabled = true;
    const r = await api("/api/demo", { scenario: scen.value, account: acc.value, series: series.value, type: type.value });
    closeModal(true);
    if (r.ok) flag("ok", "시험 실행을 시작했습니다", "잠시 뒤 보드의 「승인 대기」 또는 「검수」 열에 나타납니다.");
    else flag("err", "시작하지 못했습니다", r.data.error || "실패");
    setTimeout(() => refresh(true), 700);
  };
  openModal([
    h("div", { class: "modal-h" }, h("h2", {}, "릴스 작업 만들기"), h("button", { class: "tb-icon x", "aria-label": "닫기", onclick: () => closeModal() }, ic("x", 20))),
    h("div", { class: "modal-b" },
      h("div", { class: "grid g2", style: "gap:0 16px" },
        h("div", { class: "field" }, h("label", { for: "c-acc" }, "계정"), acc),
        h("div", { class: "field" }, h("label", { for: "c-type" }, "유형"), type)),
      h("div", { class: "field" }, h("label", { for: "c-series" }, "시리즈"), series),
      h("div", { class: "field" }, h("label", { for: "c-topic" }, "주제"), topic, h("div", { class: "help" }, "실제 에이전트 실행(비용 발생)은 아래 명령을 PC 터미널에서 실행합니다.")),
      h("div", { class: "msg", style: "align-items:flex-start" }, ic("info", 20), h("div", { class: "grow", style: "min-width:0" }, h("h4", {}, "실제 실행 명령"), cmd,
        h("button", { class: "btn sm", style: "margin-top:8px", onclick: () => navigator.clipboard && navigator.clipboard.writeText(cmd.textContent).then(() => flag("ok", "명령을 복사했습니다", ""), () => {}) }, ic("copy", 14), "복사"))),
      h("div", { class: "msg disc", style: "margin-top:12px;align-items:flex-start" }, ic("play", 20), h("div", { class: "grow" }, h("h4", {}, "시험 실행(비용 없음)"),
        h("div", { class: "small", style: "margin-bottom:8px" }, "에이전트를 부르지 않고 가짜 결과물로 승인 흐름을 확인합니다. 주제는 「(데모) 전세 계약 전 확인」으로 고정됩니다."),
        h("div", { class: "field", style: "margin:0" }, scen)))),
    h("div", { class: "modal-f" }, h("button", { class: "btn subtle", onclick: () => closeModal() }, "취소"), h("button", { class: "btn primary", id: "c-run", onclick: (e) => runDemo(e.currentTarget) }, "시험 실행"))],
  { size: "sm", label: "작업 만들기" });
}
function openShortcuts() {
  const row = (k, d) => h("tr", {}, h("td", { style: "width:120px" }, k.map((x) => h("kbd", { style: "margin-right:4px" }, x))), h("td", {}, d));
  openModal([h("div", { class: "modal-h" }, h("h2", {}, "단축키"), h("button", { class: "tb-icon x", "aria-label": "닫기", onclick: () => closeModal() }, ic("x", 20))),
    h("div", { class: "modal-b" }, h("table", { class: "t" }, h("tbody", {},
      row(["/"], "검색"), row(["C"], "1단계 만들기"), row(["G", "S"], "요약"), row(["G", "B"], "보드"), row(["G", "L"], "목록"), row(["G", "C"], "캘린더"), row(["G", "I"], "승인함"),
      row(["G", "A"], "자동화"), row(["G", "T"], "에이전트"), row(["G", "M"], "모니터"), row(["G", "V"], "활동"), row(["J"], "다음 작업(승인함·상세 창)"), row(["K"], "이전 작업"), row(["["], "사이드바 접기·펴기"), row(["Esc"], "창 닫기"), row(["?"], "이 도움말"))))], { size: "sm", label: "단축키" });
}

// ---------- 알림(플래그) ----------
function flag(kind, title, text) {
  const f = h("div", { class: "flag " + kind, role: "status" }, ic(kind === "ok" ? "ok" : kind === "err" ? "err" : "info", 22), h("div", { class: "grow" }, h("b", {}, title), text ? h("div", { class: "muted" }, text) : null),
    h("button", { class: "tb-icon", "aria-label": "닫기", style: "width:24px;height:24px", onclick: () => f.remove() }, ic("x", 14)));
  $("#flags").append(f);
  setTimeout(() => f.remove(), 5000);
}

// ---------- 자동화(흐름 편집기) ----------
function renderAutomation() {
  flowMounted = true;
  const root = $("#page"); root.className = "page"; root.style.maxWidth = "none";
  const host = h("div");
  root.replaceChildren(...pageHead("자동화", [h("span", {}, "워크플로우")], [h("span", { class: "small" }, "AI가 노드를 만들고, 상자를 끌어 고칠 수 있습니다.")]), host);
  FlowEditor.mount(host, S, () => refresh(true));
}

// ---------- 에이전트 ----------
function renderAgents(root) {
  const totalActive = S.groups.reduce((a, g) => a + g.agents.filter((x) => x.state === "active").length, 0);
  const total = S.groups.reduce((a, g) => a + g.agents.length, 0);
  const toggle = h("label", { class: "row small", style: "cursor:pointer" }, h("input", { type: "checkbox", checked: ui.showPlanned, onchange: (e) => { ui.showPlanned = e.target.checked; store.set("showPlanned", ui.showPlanned); renderAgents(root); } }), "예정 에이전트 보기");
  const tbody = h("tbody");
  for (const g of S.groups) {
    const closed = ui.closedGroups.includes(g.id);
    const active = g.agents.filter((a) => a.state === "active").length;
    tbody.append(h("tr", { class: "grp" + (closed ? " closed" : ""), onclick: () => { ui.closedGroups = closed ? ui.closedGroups.filter((x) => x !== g.id) : [...ui.closedGroups, g.id]; store.set("closedGroups", ui.closedGroups); renderAgents(root); } },
      h("td", { colspan: "6" }, h("span", { class: "chev" }, ic("chevD", 14, 2.5)), g.title, h("span", { class: "small", style: "margin-left:8px;font-weight:400" }, `사용 중 ${active} / ${g.agents.length} · 리드 ${agentTitle[g.lead] || g.lead}`))));
    if (closed) continue;
    const shown = g.agents.filter((a) => ui.showPlanned || a.state !== "planned");
    for (const a of shown) {
      const st = AGENT_STATE[a.state] || [a.state, ""];
      const counts = Object.entries(a.counts || {});
      tbody.append(h("tr", { class: "click", tabindex: "0", title: "자세히 보기", onclick: () => openAgent(a, g), onkeydown: (e) => { if (e.key === "Enter") openAgent(a, g); } },
        h("td", {}, h("div", { class: "agent-name" }, avatar(a.name, "lg"), h("div", {}, h("b", {}, a.title, a.name === g.lead ? h("span", { class: "lz purple", style: "margin-left:6px" }, "리드") : null), h("small", {}, a.name)))),
        h("td", { class: "nowrap" }, h("span", { class: "lz " + st[1] }, st[0])),
        h("td", { style: "min-width:220px" }, a.role),
        h("td", { class: "small", style: "min-width:160px" }, a.tools),
        h("td", { class: "small", style: "min-width:160px" }, a.forbidden),
        h("td", { class: "nowrap" }, counts.length ? counts.map(([k, n]) => h("div", {}, lz(k), " ", n)) : h("span", { class: "small" }, "실행 없음"))));
    }
    const hidden = g.agents.length - shown.length;
    if (hidden) tbody.append(h("tr", {}, h("td", { colspan: "6", class: "small" }, `예정 ${hidden}개 숨김: ` + g.agents.filter((a) => a.state === "planned").map((a) => a.title).join(" · "))));
  }
  root.replaceChildren(...pageHead("에이전트", [], [toggle]),
    h("div", { class: "grid g4", style: "margin-bottom:16px" },
      h("div", { class: "card stat" }, h("span", { class: "ic" }, ic("agents", 20)), h("div", {}, h("b", {}, total), h("span", {}, "정의된 에이전트"))),
      h("div", { class: "card stat" }, h("span", { class: "ic", style: "background:var(--success-bg);color:var(--success-text)" }, ic("ok", 20)), h("div", {}, h("b", {}, totalActive), h("span", {}, "사용 중"))),
      h("div", { class: "card stat" }, h("span", { class: "ic" }, ic("board", 20)), h("div", {}, h("b", {}, S.groups.length), h("span", {}, "그룹"))),
      h("div", { class: "card stat" }, h("span", { class: "ic", style: "background:var(--danger-bg);color:var(--danger-text)" }, ic("shield", 20)), h("div", {}, h("b", {}, S.events.filter((e) => e.kind === "blocked").length), h("span", {}, "최근 훅 차단")))),
    h("div", { class: "table-wrap" }, h("table", { class: "t" }, h("thead", {}, h("tr", {}, ["에이전트", "상태", "역할", "도구", "금지", "실행"].map((x) => h("th", {}, x)))), tbody)));
  root.className = "page";
}

function openAgent(a, g) {
  const st = AGENT_STATE[a.state] || [a.state, ""];
  const runs = S.runs.filter((r) => r.agent === a.name);
  const steps = (g.flow_order || []).map((s, i) => [s, i]).filter(([s]) => s.who === a.name);
  const cost = ((S.usage.per_agent || {})[a.name] || {});
  const field = (k, v) => [h("dt", {}, k), h("dd", {}, v)];
  openModal([
    h("div", { class: "modal-h" }, avatar(a.name, "lg"), h("div", { class: "grow" }, h("h2", {}, a.title), h("div", { class: "small", style: "font-family:var(--mono)" }, a.name)),
      h("button", { class: "tb-icon x", "aria-label": "닫기", onclick: () => closeModal() }, ic("x", 20))),
    h("div", { class: "modal-b" },
      h("div", { class: "row", style: "margin-bottom:16px" }, h("span", { class: "lz " + st[1] }, st[0]), a.name === g.lead ? h("span", { class: "lz purple" }, "리드") : null, h("span", { class: "tag" }, g.title)),
      h("h4", { class: "sub" }, "역할"), h("p", { style: "margin-top:0" }, a.role),
      h("div", { class: "details", style: "margin:16px 0" }, h("dl", {},
        field("도구", a.tools || "-"), field("금지", a.forbidden || "-"),
        field("흐름 위치", steps.length ? steps.map(([s, i]) => h("span", { class: "tag" }, `${i + 1}. ${s.step}`)) : "흐름에 없음"),
        field("실행", `${runs.length}건`), field("오늘 비용", usd(cost.cost_usd)))),
      h("h4", { class: "sub" }, "최근 작업"),
      runs.length ? h("div", {}, runs.slice(0, 8).map((r) => h("a", { class: "row", href: "#issue/" + r.id, onclick: () => closeModal(true), style: "padding:8px 0;border-bottom:1px solid var(--border);color:inherit;text-decoration:none;flex-wrap:nowrap" },
        typeIcon(), h("span", { class: "key" }, keyOf(r)), h("span", { class: "grow ellipsis" }, r.topic || ""), lz(r.status))))
        : h("div", { class: "small" }, a.state === "planned" ? "아직 정의만 있는 예정 에이전트입니다. 실행기에 연결하면 여기에 작업이 쌓입니다." : "실행 기록이 없습니다."),
      h("div", { class: "msg", style: "margin-top:20px" }, ic("info", 20), h("div", {}, "정의 파일: ", h("code", {}, `.claude/agents/${a.name}.md`), " · 목록: ", h("code", {}, "hub/agents.json"))))],
  { side: true, label: a.title });
}

// ---------- 활동 ----------
let worklogCache = null;
async function renderActivity(root, isUpdate) {
  const ev = [...S.events].reverse();
  const n = (k) => ev.filter((e) => k === "all" || e.kind === k).length;
  const tab = (k, label) => h("button", { class: ui.actTab === k ? "on" : "", role: "tab", "aria-selected": ui.actTab === k ? "true" : "false", onclick: () => { ui.actTab = k; renderActivity(root); } }, label, h("span", { class: "n" }, n(k)));
  const det = h("details", { class: "card flat", style: "margin-top:24px", open: store.get("wlOpen", false) },
    h("summary", { style: "cursor:pointer;font-weight:600" }, "작업 기록 (docs/work-log.md)"), h("pre", { class: "log", style: "margin-top:12px", id: "wl" }, worklogCache || "불러오는 중…"));
  det.addEventListener("toggle", () => store.set("wlOpen", det.open));
  root.replaceChildren(...pageHead("활동", [], [h("span", { class: "small" }, "에이전트 도구 사용, 훅 차단, 상태 변경")]),
    h("div", { class: "tabs", role: "tablist" }, tab("all", "전체"), tab("blocked", "차단"), tab("status", "상태"), tab("tool", "도구")),
    h("div", { class: "card flat" }, activityList(ev.filter((e) => ui.actTab === "all" || e.kind === ui.actTab), true)), det);
  root.className = "page narrow";
  if (!isUpdate || worklogCache == null) {
    const w = (await api("/api/worklog")).data.text;
    worklogCache = w || "(비어 있음)";
    const pre = $("#wl"); if (pre) pre.textContent = worklogCache;
  }
}

// ---------- 설정 ----------
function cloudSection(section, dl) {
  const c = S.cloud || {};
  if (c.paired) {
    const act = async (btn, url, msg) => { btn.disabled = true; const r = await api(url, {}); btn.disabled = false; if (r.ok) { flag("ok", msg, ""); refresh(true); } else flag("err", "실패했습니다", r.data.error || ""); };
    return section("웹 콘솔 연결", "15분마다 상태 요약(개수만)을 보내고 이용권을 새로 받습니다. 주제·원고·파일 내용은 보내지 않습니다.",
      dl(["콘솔", c.console], ["조직", c.org || "-"], ["연결한 때", (c.paired_at || "").slice(0, 16).replace("T", " ")], ["마지막 동기화", (c.last_sync || "-").slice(0, 16).replace("T", " ")]),
      c.last_error ? h("div", { class: "msg err", style: "margin-top:12px" }, ic("err", 20), h("div", {}, c.last_error)) : null,
      h("div", { class: "row", style: "margin-top:12px" }, h("button", { class: "btn", onclick: (e) => act(e.currentTarget, "/api/cloud/sync", "동기화했습니다") }, ic("refresh", 16), "지금 동기화"),
        h("button", { class: "btn subtle", onclick: (e) => act(e.currentTarget, "/api/cloud/unpair", "연결을 끊었습니다") }, "연결 끊기")));
  }
  const url = h("input", { class: "input", id: "c-url", placeholder: "https://console.example.com", value: store.get("consoleUrl", "") });
  const code = h("input", { class: "input", id: "c-code", placeholder: "예: 7KQ2-M9XD", autocomplete: "off" });
  const pair = async (btn) => { btn.disabled = true; store.set("consoleUrl", url.value.trim()); const r = await api("/api/cloud/pair", { console: url.value.trim(), code: code.value.trim() }); btn.disabled = false;
    if (r.ok) { flag("ok", "웹 콘솔에 연결했습니다", "이용권을 받았습니다."); refresh(true); } else flag("err", "연결하지 못했습니다", r.data.error || ""); };
  return section("웹 콘솔 연결", "웹 콘솔 → 기기 → 「PC 연결 코드 받기」에서 받은 코드를 넣으세요(10분 유효).",
    h("div", { class: "grid g2", style: "gap:0 16px" }, h("div", { class: "field" }, h("label", { for: "c-url" }, "콘솔 주소"), url), h("div", { class: "field" }, h("label", { for: "c-code" }, "연결 코드"), code)),
    h("button", { class: "btn primary", onclick: (e) => pair(e.currentTarget) }, ic("link", 16), "연결"));
}
function renderSettings(root) {
  const lic = S.license || {}, b = S.branding || {};
  const mode = { licensed: ["정식", "green"], grace: ["유예", "yellow"], trial: ["평가판", "yellow"], expired: ["만료", "red"] }[lic.mode] || [lic.mode, ""];
  const key = h("input", { class: "input", id: "lic-key", type: "text", placeholder: "AH2.…", autocomplete: "off" });
  const reg = async (btn) => { btn.disabled = true; const r = await api("/api/license", { key: key.value }); btn.disabled = false; if (r.ok) { flag("ok", "라이선스를 등록했습니다", ""); key.value = ""; } else flag("err", "등록하지 못했습니다", r.data.error || "실패"); refresh(true); };
  const standalone = window.matchMedia && matchMedia("(display-mode: standalone)").matches;
  const section = (title, desc, ...body) => h("section", { class: "card flat", style: "margin-bottom:16px" }, h("div", { class: "card-h" }, h("h3", {}, title)), desc ? h("div", { class: "small", style: "margin:-6px 0 12px" }, desc) : null, ...body);
  const dl = (...rows) => h("div", { class: "details", style: "border:0" }, h("dl", { style: "padding:0" }, rows.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])));
  root.replaceChildren(...pageHead("프로젝트 설정"),
    section("이용권", "웹 콘솔에서 가입·결제하고 이 PC를 연결하면 이용권이 자동으로 들어옵니다. 처음 14일은 평가판(모든 도구)입니다.",
      dl(["상태", h("span", { class: "lz " + mode[1] }, mode[0])], ["요금제", { trial: "평가판", starter: "스타터", pro: "프로", team: "팀", legacy: "판매자용(옛 키)" }[lic.plan] || lic.plan || "-"],
        ["쓸 수 있는 도구", (lic.tools || []).includes("*") ? "전부" : (lic.tools || []).map(toolName).join(", ") || "없음"],
        ["고객", lic.customer || "(미설정)"], ["만료", lic.expires || "-"], ["남은 일수", lic.days_left == null ? "-" : lic.days_left + "일"], ["이 PC 기기 ID", h("code", {}, lic.device || "-")]),
      lic.mode === "grace" ? h("div", { class: "msg warn", style: "margin-top:12px" }, ic("warn", 20), h("div", {}, "이용권 기간이 지나 유예 중입니다. 인터넷 연결과 웹 콘솔 결제 상태를 확인하세요.")) : null,
      lic.key_ok === false ? h("div", { class: "msg err", style: "margin-top:12px" }, ic("err", 20), h("div", {}, lic.error || "입력된 이용권이 맞지 않습니다.")) : null),
    keySection(section),
    cloudSection(section, dl),
    h("details", { class: "card flat", style: "margin-bottom:16px;padding:12px 16px" }, h("summary", { class: "small", style: "cursor:pointer" }, "이용권 토큰 직접 넣기(인터넷이 안 되는 PC)"),
      h("div", { class: "field", style: "margin:12px 0 0" }, h("label", { for: "lic-key" }, "이용권 토큰(AH2.…)"),
        h("div", { class: "row", style: "flex-wrap:nowrap" }, key, h("button", { class: "btn primary", onclick: (e) => reg(e.currentTarget) }, "등록")),
        h("div", { class: "help" }, "웹 콘솔 → 기기 → 「오프라인 토큰」에서 이 PC 기기 ID로 받은 토큰을 붙여 넣습니다."))),
    section("제품 정보", "브랜딩(제품명·고객사·로고 글자·색)은 hub/config.json 의 branding, 비밀번호는 .env 의 HUB_PASSWORD 에서 바꿉니다.",
      dl(["제품명", b.product_name || "Agent Hub"], ["고객사", b.customer_name || "-"], ["로고", h("span", { class: "logo", style: b.accent ? `background:${b.accent}` : "" }, (b.logo_text || "AH").slice(0, 3))], ["버전", S.version]),
      null),
    section("운영 한도", "hub/config.json 의 daily_budget_usd, port 에서 바꿉니다. 외부 접속은 열지 않습니다.",
      dl(["하루 API 한도", usd(S.usage.budget_usd)], ["오늘 사용", usd(S.usage.total_usd)], ["접속", (S.lan || {}).enabled ? "이 PC + 같은 와이파이 휴대폰(비밀번호)" : "이 PC 전용(127.0.0.1)"],
        ["에이전트별 한도", Object.keys(S.usage.agent_budgets_usd || {}).length ? h("div", {}, Object.entries(S.usage.agent_budgets_usd).map(([k, v]) => h("div", { class: "small" }, `${agentTitle[k] || k}: ${usd(((S.usage.per_agent || {})[k] || {}).cost_usd || 0)} / ${usd(v)}`))) : "없음 (hub/config.json 의 agent_budgets_usd)"])),
    (() => { const L = S.lan || {};
      return section("휴대폰으로 보기", "집·사무실 같은 와이파이에 연결된 휴대폰에서 이 화면(오늘 할 일·승인·모니터·인사)을 볼 수 있습니다. 바깥 인터넷에는 열리지 않습니다.",
        L.enabled ? h("div", {}, h("div", { class: "msg ok" }, ic("ok", 20), h("div", {}, "켜져 있습니다. 휴대폰 브라우저에서 아래 주소를 열고 비밀번호로 로그인하세요.")),
            (L.urls || []).map((u) => h("div", { class: "row", style: "margin-top:8px" }, h("code", { style: "font-size:16px" }, u), h("button", { class: "btn sm", onclick: () => { navigator.clipboard && navigator.clipboard.writeText(u); flag("ok", "주소를 복사했습니다", u); } }, "복사"))),
            h("div", { class: "small", style: "margin-top:8px" }, "휴대폰 브라우저 메뉴의 「홈 화면에 추가」를 누르면 앱처럼 열립니다."))
          : h("ol", { class: "how" },
            h("li", {}, "프로그램 폴더의 ", h("code", {}, ".env"), "에 ", h("code", {}, "HUB_PASSWORD=원하는 비밀번호"), L.password_set ? " (이미 있음 ✓)" : "", "와 ", h("code", {}, "HUB_LAN=1"), " 두 줄을 넣습니다."),
            h("li", {}, "관리 화면(run.bat)을 껐다 켭니다. 처음 한 번 Windows 방화벽이 물으면 「개인 네트워크」만 허용합니다."),
            h("li", {}, "이 칸에 휴대폰에서 열 주소(예: http://192.168.0.12:4830/)가 나옵니다."),
            L.requested && !L.password_set ? h("li", { style: "color:#C9372C" }, "HUB_LAN=1 은 들어가 있지만 비밀번호가 없어 꺼져 있습니다(비밀번호 없이 다른 기기가 들어오지 못하게).") : null)); })(),
    section("앱 설치(PWA)", "이 PC에 앱으로 설치하면 주소창 없는 별도 창으로 열리고, 작업 표시줄에 고정할 수 있습니다.",
      standalone ? h("div", { class: "msg ok" }, ic("ok", 20), h("div", {}, "지금 설치된 앱으로 열려 있습니다."))
        : installEvt ? h("button", { class: "btn primary", onclick: installApp }, ic("download", 16), "앱으로 설치")
        : h("div", { class: "small" }, "설치 버튼이 안 보이면 주소창 오른쪽 설치 아이콘 또는 메뉴 ⋮ → 「Agent Hub 설치」를 누르세요. 이미 설치했다면 바탕화면·시작 메뉴에서 여세요.")),
    section("모델", "작업별로 어떤 AI 를 쓰는지. 기본은 Claude 이며, hub/config.json 의 model_routes 에서 바꾸고 키는 .env 에 넣습니다. 원고·사내 자료 작업은 외부 무료 모델로 보내지 않습니다(자동으로 Claude 로 돌아감).",
      h("div", { class: "table-wrap" }, h("table", { class: "t" }, h("thead", {}, h("tr", {}, ["작업", "제공자", "모델", "자료", "키"].map((x) => h("th", {}, x)))),
        h("tbody", {}, (S.models || []).map((m) => h("tr", {},
          h("td", { class: "nowrap" }, { flow: "흐름 설계", trend: "트렌드 조사", reels_draft: "릴스 초안", novel: "웹소설 원고", company: "사내 개발", review: "코드 리뷰" }[m.task] || m.task),
          h("td", { class: "nowrap" }, m.label), h("td", { class: "small" }, h("code", {}, m.model)),
          h("td", { class: "nowrap" }, h("span", { class: "lz " + (m.data === "private" ? "purple" : "") }, m.data === "private" ? "비공개" : "공개 자료만")),
          h("td", { class: "nowrap" }, h("span", { class: "lz " + (m.key_ok ? "green" : "yellow") }, m.key_ok ? "있음" : "없음"))))))),
      h("div", { class: "help", style: "margin-top:8px" }, "쓸 수 있는 제공자: Claude(기본)·DeepSeek·Kimi·GLM·StepFun·Qwen·MiMo·OpenRouter. 자세한 것은 docs/alt-models.md")),
    section("화면", "테마·알림은 이 브라우저(앱)에만 저장됩니다.", h("div", { class: "row" }, h("span", { class: "small", style: "width:80px" }, "테마"), themePicker()),
      h("div", { class: "row", style: "margin-top:12px" }, h("span", { class: "small", style: "width:80px" }, "알림"), notifyButton(), h("span", { class: "small" }, "승인 기다림·훅 차단이 새로 생기면 PC 알림(앱을 닫으면 안 옴)")),
      h("div", { class: "row", style: "margin-top:12px" }, h("span", { class: "small", style: "width:80px" }, "단축키"), h("button", { class: "btn", onclick: openShortcuts }, ic("keyboard", 16), "단축키 보기"))));
  root.className = "page narrow";
}

// ---------- 로그인 ----------
function showLogin(session) {
  const app = $("#app"); S = null; sig = "";
  const b = (session && session.branding) || {};
  const pw = h("input", { class: "input", id: "pw", type: "password", placeholder: "비밀번호", autofocus: true, autocomplete: "current-password" });
  const err = h("div", { class: "help", style: "color:var(--danger-text)", role: "alert" });
  const go = async () => { const r = await api("/api/login", { password: pw.value }); if (r.ok) { app.replaceChildren(); refresh(true); } else err.textContent = r.data.error || "실패"; };
  pw.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  app.replaceChildren(h("div", { class: "login-wrap" }, h("div", { class: "login-card" },
    h("div", { class: "brand" }, h("span", { class: "logo", style: b.accent ? `background:${b.accent}` : "" }, (b.logo_text || "AH").slice(0, 3)), b.product_name || "Agent Hub"),
    h("h2", {}, "관리 화면에 로그인"),
    h("div", { class: "field" }, h("label", { for: "pw" }, "비밀번호"), pw, err),
    h("button", { class: "btn primary", style: "width:100%;height:40px", onclick: go }, "계속"),
    h("div", { class: "small", style: "text-align:center;margin-top:20px" }, (b.customer_name ? b.customer_name + " · " : "") + "이 PC(127.0.0.1)에서만 열립니다."))));
  document.title = (b.product_name || "Agent Hub") + " · 로그인";
  setTimeout(() => pw.focus(), 30);
}

// ---------- PWA ----------
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; const b = $("#install"); if (b) b.classList.remove("hide"); });
async function installApp() { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; const b = $("#install"); if (b) b.classList.add("hide"); }
window.addEventListener("appinstalled", () => { store.set("installed", true); const b = $("#install"); if (b) b.classList.add("hide"); flag("ok", "앱으로 설치했습니다", "바탕화면·시작 메뉴에서 열 수 있습니다."); });

// ---------- 단축키 ----------
let gPending = 0;
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { if ($(".popover")) { closePop(); return; } if ($(".blanket")) { e.preventDefault(); closeModal(); } return; }
  const t = e.target; if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (t && (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable)) return;
  if (!S) return;
  if (e.key === "/") { e.preventDefault(); const q = $("#q"); if (q) q.focus(); return; }
  if (e.key === "?") { openShortcuts(); return; }
  if ($(".blanket[data-issue]") && (e.key === "j" || e.key === "k")) { stepIssue(e.key === "j" ? 1 : -1); return; }
  if ($(".blanket")) return;
  if (route.page === "inbox" && (e.key === "j" || e.key === "k")) {
    const items = $$(".qitem"); const i = items.findIndex((x) => x.classList.contains("on"));
    const nx = items[Math.max(0, Math.min(items.length - 1, i + (e.key === "j" ? 1 : -1)))]; if (nx) { nx.click(); setTimeout(() => { const on = $(".qitem.on"); if (on) on.scrollIntoView({ block: "nearest" }); }, 0); }
    return;
  }
  if (gPending && Date.now() - gPending < 1200) {
    const m = { s: "summary", b: "board", l: "list", c: "calendar", i: "inbox", a: "automation", t: "agents", m: "monitor", v: "activity" }[e.key.toLowerCase()];
    gPending = 0; if (m) { go(m); return; }
  }
  if (e.key === "g" || e.key === "G") { gPending = Date.now(); return; }
  if (e.key === "c" || e.key === "C") { e.preventDefault(); go("make"); return; }
  if (e.key === "[") toggleSidebar();
});

window.addEventListener("hashchange", () => { document.body.classList.remove("mob-menu"); if (S) onRoute(); });
refresh(); setInterval(refresh, 5000);

// ---------- 직원 생각(사람을 누르면 보이는 것) ----------
// 지어내지 않는다: 실행 기록·훅 기록·인사 기록에 있는 것만으로 1인칭 문장을 만든다.
function thoughtOf(x) {
  const out = [], L = x.live || {}, w = x.work, hr = x.hr || {};
  const last = x.runs && x.runs[0];
  const recs = (hr.records || []).filter((r) => r.level && r.level !== "none");
  if (x.st === "fired") return ["해고된 상태라 일을 맡을 수 없다. 복직은 인사 → 징계위원회에서 정한다."];
  if (x.st === "off") return [hr.status === "suspended" ? `정직 중이다(${hr.until}까지). 그동안은 일을 맡지 않는다.` : `근무 시간이 아니라 퇴근했다. 내 근무 시간: ${hr.shift_text || "-"}.`];
  if (x.st === "working") {
    if (w) out.push(`「${w.topic || "맡은 일"}」을(를) 만드는 중이다.`);
    else if (L.task) out.push(`${agentTitle[L.by] || L.by || "총괄"}이(가) 맡긴 「${L.task}」을(를) 하는 중이다.`);
    else if (x.a.name === MAIN_AGENT.name) out.push("사람이 보낸 요청에 답하는 중이다. 필요한 일은 팀원에게 나눠 맡긴다.");
    if (L.last_tool) out.push(`방금 ${L.last_tool}${L.last_detail ? `(으)로 「${String(L.last_detail).split(/[\\/]/).pop().slice(0, 50)}」` : ""}을(를) 썼다.`);
  } else if (x.st === "waiting") {
    const r = x.runs.find((q) => q.status === "awaiting_approval");
    out.push(`「${(r && r.topic) || "결과물"}」을(를) 결재함에 올렸다. 규칙 검수는 통과했고, 사람의 승인을 기다린다.`);
  } else if (x.st === "error") {
    out.push(`「${(last && last.topic) || "지난 일"}」이(가) 멈췄다${last && last.note ? ": " + last.note : ""}. 원인을 고쳐야 다시 할 수 있다.`);
  } else if (x.st === "blocked") {
    const b = S.events.filter((e) => e.agent === x.a.name && e.kind === "blocked").pop();
    out.push(`훅에 막혔다${b && b.reason ? ": " + b.reason : ""}. 규칙을 지키는 다른 방법을 찾거나 사람에게 물어야 한다.`);
  } else if (x.st === "planned") {
    out.push("아직 한 번도 불려 나오지 않았다. 도구에 연결되면 일을 시작한다.");
  } else {
    out.push("다음 일을 기다리는 중이다.");
    if (last) out.push(`마지막으로 한 일은 「${last.topic || "-"}」(${STATUS[last.status] || last.status}, ${ago(last.created)}).`);
  }
  if (last && last.status === "validation_failed" && x.st !== "error") out.push(`지난번 「${last.topic || "-"}」은(는) 검수에서 ${last.errors}건 걸렸다. 이번엔 규칙부터 확인한다.`);
  if (recs.length) { const r = recs[recs.length - 1]; out.push(`${r.date} ${(S.hr.levels.find((l) => l.id === r.level) || {}).label || r.level} 처분을 받았다(${r.reason}). 같은 실수는 하지 않는다.`); }
  return out;
}

// ---------- 인사(HR): 근무표 · 사규 · 징계위원회 ----------
ui.hr = { tab: store.get("hrTab", "shift"), sel: null, ev: null, form: null, busy: false };
const DAY_KO = ["월", "화", "수", "목", "금", "토", "일"];
function hrAgents() {   // 인사 대상: 정의된 에이전트(총괄 본 세션·임시 도우미 제외)
  return S.groups.flatMap((g) => g.agents.map((a) => ({ a, g, hr: ((S.hr || {}).agents || {})[a.name] }))).filter((x) => x.hr);
}
function hrChip(hr) {
  if (!hr) return null;
  if (hr.status === "dismissed") return h("span", { class: "lz red bold" }, "해고");
  if (hr.status === "suspended") return h("span", { class: "lz yellow" }, `정직 ~${hr.until.slice(5)}`);
  return hr.on_shift ? h("span", { class: "lz green" }, "근무 중") : h("span", { class: "lz" }, "퇴근·휴무");
}
function shiftBar(sh) {   // 오늘 24시간 중 근무 시간
  const m = (t) => { const [a, b] = t.split(":").map(Number); return a * 60 + b; };
  const wd = (new Date().getDay() + 6) % 7, A = m(sh.start), B = m(sh.end), segs = [];
  if (A === B || (A === 0 && B >= 1440)) { if (sh.days.includes(wd)) segs.push([0, 1440]); }
  else if (A < B) { if (sh.days.includes(wd)) segs.push([A, B]); }
  else { if (sh.days.includes(wd)) segs.push([A, 1440]); if (sh.days.includes((wd + 6) % 7)) segs.push([0, B]); }
  const now = new Date(), nm = now.getHours() * 60 + now.getMinutes();
  return h("div", { class: "shift-bar", title: "오늘 근무 시간(0시~24시)" }, segs.map(([a, b]) => h("i", { style: `left:${a / 14.4}%;width:${(b - a) / 14.4}%` })), h("b", { style: `left:${nm / 14.4}%` }));
}
async function hrPost(path, body, okTitle) {
  const r = await api(path, body);
  if (!r.ok) { flag("err", "저장하지 못했습니다", r.data.error || ""); return false; }
  if (r.data.hr) S.hr = r.data.hr;
  flag("ok", okTitle, ""); await refresh(true); return true;
}
function renderHr(root) {
  root.className = "page"; root.style.maxWidth = "";
  const tabs = [["shift", "근무표"], ["perf", "성과 평가"], ["rules", "사규"], ["committee", "징계위원회"]];
  const body = h("div");
  root.replaceChildren(...pageHead("인사", [h("span", {}, "에이전트 근무·사규·징계")], [
    h("div", { class: "btn-group" }, tabs.map(([k, l]) => h("button", { class: "btn" + (ui.hr.tab === k ? " sel" : " subtle"), onclick: () => { ui.hr.tab = k; store.set("hrTab", k); renderHr(root); } }, l)))]),
    h("div", { class: "small", style: "margin:-8px 0 16px" }, "에이전트는 칭찬이나 벌로 의욕이 바뀌지 않습니다. 그래서 근무 시간과 징계는 모두 실제로 효력이 있습니다. 시프트 밖의 실행은 거절되고, 징계를 받으면 지시문·예산·실행 권한·도구 연결이 바뀝니다."),
    body);
  if (!S.hr) { body.append(emptyState("인사 정보를 불러오지 못했습니다", "")); return; }
  if (ui.hr.tab === "shift") return hrShift(body);
  if (ui.hr.tab === "rules") return hrRules(body);
  if (ui.hr.tab === "perf") return hrPerf(body, root);
  return hrCommittee(body, root);
}
function hrShift(body) {
  const presets = Object.entries(S.hr.shifts);
  const tbody = h("tbody");
  for (const g of S.groups) {
    const rows = hrAgents().filter((x) => x.g.id === g.id);
    if (!rows.length) continue;
    tbody.append(h("tr", { class: "grp" }, h("td", { colspan: "4" }, g.title)));
    for (const { a, hr } of rows) {
      const sh = hr.shift, custom = !(sh.preset in S.hr.shifts);
      const days = h("span", { class: "shift-days" }, DAY_KO.map((d, i) => h("label", {}, h("input", { type: "checkbox", value: i, checked: sh.days.includes(i), disabled: !custom }), d)));
      const st = h("input", { type: "time", value: sh.start === "24:00" ? "00:00" : sh.start, disabled: !custom, class: "inp sm" });
      const en = h("input", { type: "time", value: sh.end === "24:00" ? "23:59" : sh.end, disabled: !custom, class: "inp sm" });
      const sel = h("select", { class: "inp sm", onchange: () => { const c = sel.value === "custom"; for (const x of [...days.querySelectorAll("input"), st, en]) x.disabled = !c; } },
        presets.map(([k, l]) => h("option", { value: k, selected: sh.preset === k }, l)), h("option", { value: "custom", selected: custom }, "직접 정하기"));
      const save = h("button", { class: "btn sm primary", onclick: () => {
        const shift = sel.value === "custom" ? { preset: "custom", days: [...days.querySelectorAll("input:checked")].map((x) => +x.value), start: st.value, end: en.value === "23:59" ? "24:00" : en.value } : { preset: sel.value };
        hrPost(`/api/hr/${a.name}/shift`, { shift }, `${a.title} 근무 시간을 바꿨습니다`); } }, "저장");
      tbody.append(h("tr", {}, h("td", {}, h("div", { class: "agent-name" }, avatar(a.name, "lg"), h("div", {}, h("b", {}, a.title), h("small", {}, a.name)))),
        h("td", { class: "nowrap" }, hrChip(hr)),
        h("td", { class: "shift-cell" }, h("div", { class: "row", style: "gap:6px;flex-wrap:wrap" }, sel, days, st, "~", en, save), shiftBar(sh)),
        h("td", { class: "small" }, hr.why || "지금 일할 수 있음")));
    }
  }
  body.append(h("div", { class: "card", style: "padding:0;overflow:auto" }, h("table", { class: "t hr-shift" }, h("thead", {}, h("tr", {}, h("th", {}, "에이전트"), h("th", {}, "상태"), h("th", {}, "근무 시프트 · 오늘 근무 시간"), h("th", {}, "지금"))), tbody)),
    h("p", { class: "small" }, "시프트 밖에서는 러너가 실행을 거절하고, Claude Code 안에서 그 에이전트를 부르는 것도 훅이 막습니다. 모니터 사무실에서는 퇴근한 직원의 자리가 비어 보입니다."));
}
function hrRules(body) {
  const rb = S.hr.rulebook || { articles: [] };
  body.append(h("div", { class: "card rulebook" }, h("h2", {}, rb.title + (rb.version ? ` (v${rb.version})` : "")), h("p", { class: "small" }, rb.note || ""),
    rb.articles.map((x) => h("section", {}, h("h3", {}, `${x.no} ${x.title}`), h("p", {}, x.body)))),
    h("div", { class: "card" }, h("div", { class: "card-h" }, h("h3", {}, "징계 종류와 실제 효력")),
      h("table", { class: "t" }, h("tbody", {}, S.hr.levels.map((l) => h("tr", {}, h("td", { class: "nowrap" }, h("b", {}, l.label)), h("td", {}, l.effect)))))));
}
function hrScore(name) {   // 안건 후보 점수(화면에 있는 최근 기록 기준; 정확한 근거는 위원회를 열 때 서버에서 가져온다)
  const runs = S.runs.filter((r) => r.agent === name);
  return runs.filter((r) => r.status === "validation_failed").length + runs.filter((r) => r.status === "rejected").length * 2
    + runs.filter((r) => r.status === "error").length + S.events.filter((e) => e.agent === name && e.kind === "blocked").length * 3;
}
async function hrOpen(name, root) {
  ui.hr.sel = name; ui.hr.ev = null; ui.hr.form = { level: "caution", days: 3, reason: "", fix: "", articles: [], picked: [] };
  renderHr(root);
  const r = await api(`/api/hr/${name}/evidence`, {});
  ui.hr.ev = r.ok ? r.data.evidence : [];
  renderHr(root);
}
function hrCommittee(body, root) {
  const list = hrAgents().map((x) => ({ ...x, score: hrScore(x.a.name) })).filter((x) => x.a.state !== "planned" || x.score || x.hr.records.length || x.hr.status !== "active")
    .sort((p, q) => (q.hr.status !== "active") - (p.hr.status !== "active") || q.score - p.score);
  const side = h("div", { class: "card cm-list" }, h("div", { class: "card-h" }, h("h3", {}, "안건 후보")),
    list.map((x) => h("button", { class: "cm-cand" + (ui.hr.sel === x.a.name ? " on" : ""), onclick: () => hrOpen(x.a.name, root) },
      pixelAvatar(x.a.name, 28), h("div", { class: "grow" }, h("b", {}, x.a.title), h("div", { class: "small" }, x.g.title)), hrChip(x.hr),
      x.score ? h("span", { class: "lz red" }, "위반 " + x.score) : null)));
  const main = h("div", { class: "grow" });
  const sel = list.find((x) => x.a.name === ui.hr.sel) || hrAgents().find((x) => x.a.name === ui.hr.sel);
  if (!sel) main.append(h("div", { class: "card" }, emptyState("징계위원회", "왼쪽에서 안건에 올릴 에이전트를 고르세요. 기록(훅 차단·검수 실패·반려·오류·한도 초과)이 많은 에이전트가 위에 있습니다.")));
  else main.append(hrRoom(sel, root));
  const hist = (S.hr.committees || []).slice().reverse();
  body.append(h("div", { class: "row cm-wrap" }, side, main),
    h("div", { class: "card" }, h("div", { class: "card-h" }, h("h3", {}, "의결 기록"), h("span", { class: "small" }, `${hist.length}건`)),
      hist.length ? h("table", { class: "t" }, h("tbody", {}, hist.map((c) => h("tr", {}, h("td", { class: "nowrap small" }, ts(c.ts)), h("td", {}, h("b", {}, agentTitle[c.agent] || c.agent)),
        h("td", { class: "nowrap" }, h("span", { class: "lz" + (c.level === "dismiss" ? " red bold" : "") }, ((S.hr.levels.find((l) => l.id === c.level) || {}).label || c.level) + (c.days && ["paycut", "suspend"].includes(c.level) ? ` ${c.days}일` : ""))),
        h("td", {}, c.reason, c.articles && c.articles.length ? h("span", { class: "small" }, " · " + c.articles.join(", ")) : null)))))
        : h("div", { class: "small" }, "아직 의결이 없습니다.")));
}
function hrRoom(sel, root) {
  const a = sel.a, hr = sel.hr, f = ui.hr.form, ev = ui.hr.ev;
  const arts = (S.hr.rulebook || { articles: [] }).articles;
  const seat = (cls, who, label, av) => h("div", { class: "cm-seat " + cls }, av, h("b", {}, who), h("small", {}, label));
  const room = h("div", { class: "cm-room" },
    h("div", { class: "cm-table" }, h("span", {}, "징계위원회"), h("small", {}, `안건: ${a.title}`)),
    seat("chair", "위원장", "사람(대표)", h("span", { class: "cm-av me" }, "나")),
    seat("m1", "규칙 검수기", "위원 · 기록 확인", h("span", { class: "cm-av" }, "⚖")),
    seat("m2", "총괄", "위원 · 업무 배정", pixelAvatar(MAIN_AGENT.name, 34)),
    seat("m3", "작업 기록", "간사", h("span", { class: "cm-av" }, "📝")),
    seat("target", a.title, "심의 대상", pixelAvatar(a.name, 40)));
  const pick = (i) => { const k = f.picked.indexOf(i); if (k >= 0) f.picked.splice(k, 1); else f.picked.push(i);
    const items = f.picked.map((j) => ev[j]); f.articles = [...new Set(items.map((x) => x.article))];
    if (!f.reasonEdited) f.reason = [...new Set(items.map((x) => x.what))].join(", ") + (items.length ? ` (${items.length}건)` : "");
    renderHr(root); };
  const evBox = ev == null ? h("div", { class: "small" }, "기록에서 위반 근거를 찾는 중…")
    : ev.length ? h("ul", { class: "cm-ev" }, ev.slice(0, 30).map((x, i) => h("li", {}, h("label", {}, h("input", { type: "checkbox", checked: f.picked.includes(i), onchange: () => pick(i) }),
        h("span", { class: "lz" }, x.article), " ", h("b", {}, x.what), " ", h("span", { class: "small" }, `${short(x.ts)} · ${x.detail || ""}`)), x.run ? h("a", { href: "#issue/" + x.run, class: "small" }, " 보기") : null)))
      : h("div", { class: "small" }, "최근 14일 기록에 위반 근거가 없습니다. 근거 없이 징계하지 않는 것을 권합니다(불문).");
  const x = agentStates()[a.name];
  const plea = h("div", { class: "cm-plea" }, (x ? thoughtOf(x) : []).map((t) => h("p", {}, t)),
    S.events.filter((e) => e.agent === a.name).slice(-4).reverse().map((e) => h("div", { class: "small" }, `${ago(e.ts)} · ${[e.kind === "blocked" ? "차단" : e.kind === "status" ? "상태" : e.tool || e.kind, e.reason || e.detail].filter(Boolean).join(" · ")}`)));
  const lv = S.hr.levels.find((l) => l.id === f.level) || S.hr.levels[0];
  const needDays = ["paycut", "suspend"].includes(f.level);
  const reason = h("textarea", { class: "inp", rows: 2, placeholder: "사유(필수) — 근거를 고르면 자동으로 채워집니다", oninput: (e) => { f.reason = e.target.value; f.reasonEdited = true; } }, f.reason);
  const fix = h("input", { class: "inp", placeholder: "재발 방지 지시(다음 실행 지시문에 들어감) 예: 설명에 외부 연락처·링크를 넣지 않는다", value: f.fix, oninput: (e) => { f.fix = e.target.value; } });
  const decideBtn = h("button", { class: "btn " + (f.level === "dismiss" ? "danger" : "primary"), onclick: async () => {
    if (f.level !== "none" && !f.reason.trim()) { flag("err", "사유를 적어 주세요", ""); return; }
    const msg = f.level === "dismiss" ? `${a.title}을(를) 해고합니다. 모든 도구에서 연결이 끊기고 실행·호출이 막힙니다(복직 가능). 의결할까요?`
      : f.level === "suspend" ? `${a.title}을(를) ${f.days}일 정직합니다. 그동안 실행·호출이 막힙니다. 의결할까요?` : null;
    if (msg && !confirm(msg)) return;
    const ok = await hrPost(`/api/hr/${a.name}/decide`, { level: f.level, reason: f.reason, articles: f.articles, days: needDays ? f.days : 0, fix: f.fix, evidence: f.picked.map((i) => (ev[i] || {}).run).filter(Boolean) }, `의결했습니다: ${a.title} ${lv.label}`);
    if (ok) { ui.hr.form = { level: "caution", days: 3, reason: "", fix: "", articles: [], picked: [] }; renderHr(root); } } }, "의결");
  return h("div", { class: "card cm-main" }, room,
    h("div", { class: "cm-agenda" },
      h("h3", {}, "1. 위반 근거(기록)"), evBox,
      h("h3", {}, "2. 소명(본인 기록으로 갈음)"), plea,
      h("h3", {}, "3. 관련 사규"), h("div", { class: "row", style: "gap:6px;flex-wrap:wrap" }, arts.filter((x) => /제[2-8]조/.test(x.no)).map((x) => h("button", { class: "chip" + (f.articles.includes(x.no) ? " on" : ""), title: x.body,
        onclick: () => { f.articles = f.articles.includes(x.no) ? f.articles.filter((y) => y !== x.no) : [...f.articles, x.no]; renderHr(root); } }, `${x.no} ${x.title}`))),
      h("h3", {}, "4. 의결"),
      h("div", { class: "cm-levels" }, S.hr.levels.map((l) => h("label", { class: "cm-level" + (f.level === l.id ? " on" : "") + (l.id === "dismiss" ? " max" : "") },
        h("input", { type: "radio", name: "lv", checked: f.level === l.id, onchange: () => { f.level = l.id; renderHr(root); } }), h("b", {}, l.label), h("small", {}, l.effect)))),
      needDays ? h("label", { class: "row small" }, "기간 ", h("input", { type: "number", class: "inp sm", min: 1, max: 90, value: f.days, style: "width:72px", oninput: (e) => { f.days = Math.max(1, Math.min(90, +e.target.value || 1)); } }), "일") : null,
      reason, f.level !== "none" && f.level !== "dismiss" ? fix : null,
      h("div", { class: "row", style: "justify-content:flex-end;gap:8px" },
        hr.status !== "active" ? h("button", { class: "btn", onclick: () => { if (confirm(`${a.title}을(를) 복직시킵니다. 해고 때 끊은 도구 연결이 되돌아옵니다.`)) hrPost(`/api/hr/${a.name}/reinstate`, {}, `${a.title} 복직`); } }, "복직") : null,
        decideBtn)));
}

// ---------- 성과 평가표 ----------
// ①반려 이유 ②기준 예시 ③자주 걸리는 검수 실수는 평가표에 보이는 그대로 다음 실행 지시문에 자동으로 들어간다.
// ④업무 분담(한 에이전트=한 단계)과 ⑤성과(승인률·1회 통과율·비용)는 이 표로 보고 일을 나눈다.
function hrPerf(body, root) {
  const P = S.perf || { agents: {}, examples: {} };
  const pct = (v) => (v == null ? "-" : Math.round(v * 100) + "%");
  const exSet = new Set(Object.values(P.examples || {}).flat());
  const stepOf = (g, name) => ((g.flow_order || []).filter((f) => f.who === name).map((f) => f.step).join(", ") || "-");
  const gradeCls = { A: "green", B: "blue", C: "yellow", D: "red" };
  const rows = [];
  for (const g of S.groups) for (const a of g.agents) {
    const p = P.agents[a.name]; if (!p) continue;
    rows.push({ a, g, p });
  }
  rows.sort((x, y) => (y.p.score ?? -1) - (x.p.score ?? -1));
  const how = h("div", { class: "card perf-how" }, h("div", { class: "card-h" }, h("h3", {}, "일을 더 잘하게 만드는 5가지 — 이 표에 반영됨")),
    h("ol", {},
      h("li", {}, h("b", {}, "반려 이유 → 다음 지시"), " · 승인함에서 반려할 때 적은 이유(최근 3건)가 그 에이전트의 다음 실행 지시문에 자동으로 들어갑니다. 「반려 이유」 칸에 보이는 문장이 그대로 들어갑니다."),
      h("li", {}, h("b", {}, "기준 예시"), " · 승인된 결과물 옆 ☆을 누르면 그 도구의 기준 예시(도구마다 최근 3개)가 됩니다. 다음 실행 때 「형식과 수준만 참고」하라는 지시와 함께 들어갑니다."),
      h("li", {}, h("b", {}, "자주 걸리는 검수 실수"), " · 규칙 검수기에서 자주 걸린 규칙 3개를 「만들기 전에 먼저 확인」으로 지시문에 넣습니다. 새 규칙이 필요하면 「도구 → 규칙」에서 늘립니다."),
      h("li", {}, h("b", {}, "업무 분담"), " · 「맡은 단계」에 한 에이전트가 한 단계만 맡는지 보입니다. 여러 도구에 걸친 에이전트는 노란 표시가 붙습니다."),
      h("li", {}, h("b", {}, "성과표"), " · 점수 = 승인률 50 + 1회 통과율 30 + 비용 효율 20 − 견책 이상 징계 1건당 5. A(85↑)·B(70↑)·C(50↑)·D. 점수가 낮은 에이전트는 「징계위원회」 안건으로 올릴 수 있습니다.")));
  const tbody = h("tbody", {}, rows.map(({ a, g, p }) => h("tr", {},
    h("td", {}, h("div", { class: "agent-name" }, avatar(a.name, "lg"), h("div", {}, h("b", {}, a.title), h("small", {}, g.title)))),
    h("td", { class: "nowrap" }, h("span", { class: "lz bold " + (gradeCls[p.grade] || "") }, p.grade), p.score != null ? h("span", { class: "small" }, ` ${p.score}점`) : null),
    h("td", { class: "nowrap" }, pct(p.approval_rate), h("div", { class: "small" }, `승인 ${p.approved} · 반려 ${p.rejected}`)),
    h("td", { class: "nowrap" }, pct(p.first_pass)),
    h("td", { class: "nowrap" }, p.cost_avg ? usd(p.cost_avg) : "-", h("div", { class: "small" }, p.cost_total ? `누적 ${usd(p.cost_total)}` : "")),
    h("td", { class: "small", style: "max-width:220px" }, p.reject_reasons.length ? p.reject_reasons.map((x) => h("div", {}, "· " + x)) : "-"),
    h("td", { class: "small" }, p.top_rules.length ? p.top_rules.map(([r, n]) => h("div", {}, `${r} ${n}회`)) : "-"),
    h("td", { class: "small" }, stepOf(g, a.name), p.tools.length > 1 ? h("div", {}, h("span", { class: "lz yellow" }, `도구 ${p.tools.length}개`)) : null),
    h("td", { class: "small" }, p.approved_runs.length ? p.approved_runs.map((r) => h("div", { class: "row", style: "gap:4px;flex-wrap:nowrap" },
      h("button", { class: "star" + (exSet.has(r.id) ? " on" : ""), title: exSet.has(r.id) ? "기준 예시 해제" : "기준 예시로 지정", onclick: async () => {
        const res = await api("/api/hr-example", { run: r.id, on: !exSet.has(r.id) });
        if (!res.ok) return flag("err", "지정하지 못했습니다", res.data.error || "");
        await refresh(true); renderHr(root); } }, exSet.has(r.id) ? "★" : "☆"),
      h("a", { href: "#issue/" + r.id, class: "ellipsis", style: "max-width:150px" }, r.topic || r.id))) : "-"))));
  body.append(how, h("div", { class: "card", style: "padding:0;overflow:auto" }, h("table", { class: "t" },
    h("thead", {}, h("tr", {}, ["에이전트", "등급", "승인률", "1회 통과율", "비용(평균)", "반려 이유 → 다음 지시", "자주 걸리는 실수", "맡은 단계 · 분담", "기준 예시(★)"].map((t) => h("th", {}, t)))),
    rows.length ? tbody : h("tbody", {}, h("tr", {}, h("td", { colspan: 9, class: "small" }, "아직 실행 기록이 없습니다."))))));
}

// ---------- API 키 넣기(설정) ----------
// 키는 이 PC의 .env 에만 저장된다. 화면에는 넣었는지와 끝 4자리만 보이고, 다시 꺼내 볼 수 없다.
function keySection(section) {
  const local = ["127.0.0.1", "localhost"].includes(location.hostname);
  const keys = S.keys || [];
  const main = keys.filter((k) => k.name === "ANTHROPIC_API_KEY"), rest = keys.filter((k) => k.name !== "ANTHROPIC_API_KEY");
  const row = (k) => {
    const inp = h("input", { class: "input", type: "password", autocomplete: "off", spellcheck: "false", placeholder: k.set ? "새 키로 바꾸려면 붙여 넣기" : "키 붙여 넣기", disabled: !local, "aria-label": k.name });
    const save = async (value) => {
      const r = await api("/api/keys", { name: k.name, value });
      inp.value = "";
      if (!r.ok) return flag("err", "저장하지 못했습니다", r.data.error || "");
      flag("ok", value ? `${k.name} 를 저장했습니다` : `${k.name} 를 지웠습니다`, value ? "다시 켜지 않아도 바로 쓰입니다." : "");
      refresh(true);
    };
    return h("div", { class: "key-row" },
      h("div", { class: "key-name" }, h("code", {}, k.name), h("div", { class: "small" }, k.desc)),
      h("span", { class: "lz " + (k.set ? "green" : k.name === "ANTHROPIC_API_KEY" ? "red" : "") }, k.set ? "넣음" + (k.tail ? " ••••" + k.tail : "") : "없음"),
      h("div", { class: "row key-in", style: "flex-wrap:nowrap" }, inp,
        h("button", { class: "btn primary", disabled: !local, onclick: () => { if (inp.value.trim()) save(inp.value.trim()); else flag("err", "키를 붙여 넣어 주세요", ""); } }, "저장"),
        k.set ? h("button", { class: "btn subtle", disabled: !local, onclick: () => { if (confirm(`${k.name} 를 .env 에서 지울까요?`)) save(""); } }, "지우기") : null));
  };
  return section("API 키", "에이전트가 쓰는 AI 서비스 키를 넣습니다. 이 PC의 .env 파일에만 저장되고 웹 콘솔·판매자에게는 가지 않습니다. 넣은 키는 다시 볼 수 없고 끝 4자리만 보입니다.",
    !local ? h("div", { class: "msg warn" }, ic("warn", 20), h("div", {}, "API 키는 이 PC에서 연 관리 화면(127.0.0.1)에서만 넣거나 바꿀 수 있습니다.")) : null,
    main.map(row),
    rest.length ? h("details", { class: "key-more" }, h("summary", { class: "small" }, `다른 모델 키 ${rest.length}개(선택: 공개 자료 작업을 외부 무료·저가 모델로 돌릴 때)`), rest.map(row)) : null);
}
