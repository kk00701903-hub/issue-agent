// Agent Hub — 사무실 모니터(한 층 전체)
// 배경: Adobe Firefly(포토샵 「이미지 생성」)로 그린 빈 사무실 층(office-room-v5.png) — 바닥·벽·휴게실(커피머신·소파)·복사기만 있다.
// 바닥·옆면·벽 색은 그림을 다시 칠해 차분한 회색 계열로 바꿈(나무결은 살림).
// 책상·의자·파티션·쓰레기통·생수통·복사실(용지장·폐지함·낮은 파티션): 이 파일이 3D로 놓는다. 그림을 그린 카메라를 바닥 네 모서리로 맞춰(원근 포함) 같은 시점으로 그린다.
//   부서(도구 팀)마다 파티션으로 나눈 구역 1개 = 팀장 자리(ㄱ자 파티션) 1 + 팀원 자리 4. 구역 8개 = 40석, 남는 칸은 회의 공간.
//   모든 자리는 통로 쪽으로 열려 있다. 자리 → 구역 출구 → 복도(가로·세로 4줄)로만 다니므로 책상·파티션을 뚫고 가지 않는다.
// 직원: Blender로 만든 사람+의자 모형(office-worker.glb, 동작 7개)을 three.js AnimationMixer로 움직인다(0.45초 섞기).
//       동작은 Adobe Mixamo 모션캡처(타자·앉아 쉬기·걷기·서 있기·마시기·손 들기·머리 감싸기)를 Blender에서 이 모형 뼈대로 옮긴 것. 손목·손가락 뼈가 있어 타자 치는 손이 움직인다.
// 움직임: 실제 기록(러너 실행 상태·훅 기록) 그대로 앉아 일하고, 승인 대기가 되면 결재함까지 걸어간다.
//         분주하게: 대기 직원은 자주 휴게실(커피·생수)·복사실·회의 공간·다른 부서에 다녀오고, 일하는 직원도 가끔 출력물을 가지러 간다.
//         상태가 바뀌면(일이 들어오거나 끝나면) 바로 자리로 돌아간다.
import * as THREE from "./three.module.min.js";
import { GLTFLoader } from "./three-gltf.js";

const IMG_W = 1792, IMG_H = 1024;
const BG = "/static/office-room-v5.png";
// 그림을 그린 카메라(바닥 네 모서리 px로 맞춤: 뒤 898,115 / 오른쪽 1665,346 / 앞 898,762 / 왼쪽 128,346, 바닥 한 변 22m, 복사기 높이로 크기 확인)
const CAM = { pos: [42.768, 18.979, 43.391], fwd: [-0.62978, -0.45116, -0.63843], up: [-0.31771, 0.89961, -0.31830], fov: 24.06 };
const CELL = 5.2;                         // 부서 구역 한 변(m)
const ORIGIN = [2.8, 9.3, 15.8];          // 구역 시작점(x·z 같음)
const LINES = [2.2, 8.65, 15.15, 21.5];   // 복도 중심선(x=… 세로 복도, z=… 가로 복도). 가구가 없는 줄
const CELL_ORDER = [[1, 1], [2, 2], [2, 1], [1, 2], [0, 2], [2, 0], [0, 1], [1, 0], [0, 0]];   // 첫 칸(가운데)은 공통(총괄)
const FACE = { pz: 0, nz: Math.PI, px: Math.PI / 2, nx: -Math.PI / 2 };
// 구역 안 자리(u: x 방향, v: z 방향, 구역 왼쪽 위 모서리 기준 m). out: 자리에서 출구까지(EX·EZ 는 오른쪽·앞 복도선)
const SEATS = [
  { u: 2.8, v: 0.5, face: FACE.pz, lead: true, out: [[4.4, 0.5], [4.4, 1.85], ["EX", 1.85]] },
  { u: 2.1, v: 2.45, face: FACE.pz, out: [[2.1, 1.85], ["EX", 1.85]] },
  { u: 3.5, v: 2.45, face: FACE.pz, out: [[3.5, 1.85], ["EX", 1.85]] },
  { u: 2.1, v: 4.75, face: FACE.nz, out: [[2.1, "EZ"]] },
  { u: 3.5, v: 4.75, face: FACE.nz, out: [[3.5, "EZ"]] },
];
const STAND = [[0.9, 5.45], [4.5, 5.45], [0.9, 3.6], [4.7, 3.6]];   // 자리보다 사람이 많을 때 구역 앞쪽에 서서 일함
const LOUNGE = [{ x: 12.2, z: 0.95, via: [12.2, 2.2] }, { x: 12.9, z: 1.05, via: [12.9, 2.2] }, { x: 13.5, z: 1.0, via: [13.5, 2.2] }];   // 커피머신 앞
const COPIER = { x: 2.05, z: 9.5, via: [2.2, 9.5], face: FACE.nx };
const WATER = { x: 11.3, z: 0.95, via: [11.3, 2.2], face: FACE.nz };   // 생수통 앞
const PLACES = [{ t: "휴게실", x: 12.9, z: 0.3, y: 1.9 }, { t: "복사실", x: 0.9, z: 7.5, y: 1.6 }];
const TRAY = { x: 1.15, z: 16.4, via: [2.2, 16.4], face: FACE.nx };   // 결재함(왼쪽 벽 서류함)
const DOOR = { x: 0.6, z: 12.5 };      // 왼쪽 벽 출입구
const VIEW = { x0: 0.035, y0: 0.045, x1: 0.965, y1: 0.80 };   // 그림에서 보여 줄 부분(앞쪽 바닥 두께·하늘은 잘라 화면을 크게)

const STATE_COLOR = { working: "#22A06B", waiting: "#E2B203", blocked: "#E34935", error: "#C9372C", idle: "#579DFF", planned: "#8590A2", off: "#A5ADBA", fired: "#44546F" };
const STATE_KO = { working: "작업 중", waiting: "승인 기다림", blocked: "훅 차단", error: "오류", idle: "대기", planned: "예정", off: "퇴근·휴무", fired: "해고" };
const CLIP = { working: "typing", waiting: "raise_hand", blocked: "worry", error: "worry", idle: "sit_idle", planned: "sit_idle", off: "sit_idle", fired: "sit_idle" };
const AWAY = (st) => st === "off" || st === "fired";   // 인사: 근무 시간 밖·정직·해고 → 출입구로 나가 자리를 비움
const SHIRT = ["#A9C8E8", "#F4B6C2", "#B9E3C6", "#FFD9A0", "#CDB8F0", "#9FD8E0", "#F7C59F", "#C8D6A0", "#E8B4D8", "#B0C4DE"];
const HAIR = ["#3A2B2B", "#5A3B26", "#1E1E22", "#7A4E2D", "#2E2A3A", "#8A5A3B"];
const ZONE_TINT = ["#8FB8DE", "#E8A0B4", "#9CCFB0", "#F2C27B", "#B8A4E0", "#86C9D3", "#EFA98A", "#B5C98A", "#C9C9D6"];
const hashN = (s, n) => { let x = 0; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) >>> 0; return x % n; };
const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const rnd = (a, b) => a + Math.random() * (b - a);

let R = null;
let gltfP = null;
const loadModel = () => gltfP || (gltfP = new GLTFLoader().loadAsync("/static/office-worker.glb"));

export function supported() {
  try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl"))); } catch { return false; }
}

export function mount(container, data, cb = {}) {
  if (R && R.container === container) { update(data); return R; }
  if (R) dispose();
  container.classList.add("o2");
  const tabs = el("div", "o2-tabs");
  const stage = el("div", "o2-stage");
  const view = el("div", "o2-view");
  const room = el("div", "o2-room");
  const bg = el("img", "o2-bg"); bg.src = BG; bg.alt = "사무실 층 그림(Firefly)"; bg.draggable = false;
  const tags = el("div", "o2-tags");
  const tray = el("button", "o2-tray"); tray.type = "button"; tray.title = "결재함 — 누르면 승인함으로";
  tray.onclick = () => cb.onMe && cb.onMe();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = "o2-gl";
  renderer.domElement.setAttribute("aria-label", "에이전트 사무실 화면");
  room.append(bg, renderer.domElement, tags, tray);
  view.append(room); stage.append(view);
  container.replaceChildren(tabs, stage);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAM.fov, IMG_W / IMG_H, 1, 200);
  camera.position.set(...CAM.pos); camera.up.set(...CAM.up);
  camera.lookAt(CAM.pos[0] + CAM.fwd[0], CAM.pos[1] + CAM.fwd[1], CAM.pos[2] + CAM.fwd[2]); camera.updateMatrixWorld();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xf2d3b3, 2.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(2, 30, 4); sun.target.position.set(11, 0, 11);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 60 }); sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), new THREE.ShadowMaterial({ opacity: 0.16 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(11, 0.002, 11); ground.receiveShadow = true; scene.add(ground);

  R = { container, tabs, stage, room, tags, tray, renderer, scene, camera, cb, data: null, focus: null, people: new Map(), zones: [], zoneOf: new Map(),
    furn: new THREE.Group(), clock: new THREE.Clock(), raf: 0, sel: null, prevRuns: new Map(), model: null, sig: "", fsig: "", w: 0, h: 0, lounge: new Set() };
  scene.add(R.furn);
  const fit = () => {
    if (!R) return;
    const sw = stage.clientWidth || 800, sh = Math.max(360, window.innerHeight - (document.fullscreenElement ? 90 : 250));   // 화면 높이 안에서 가장 크게
    const cw = VIEW.x1 - VIEW.x0, ch = VIEW.y1 - VIEW.y0, ca = (cw * IMG_W) / (ch * IMG_H);
    const narrow = sw < 640;   // 휴대폰: 사무실을 화면보다 넓게 그려 옆으로 밀어 보게
    const vw = narrow ? 780 : Math.max(320, Math.min(sw, sh * ca)), w = vw / cw, h = w * IMG_H / IMG_W;
    stage.classList.toggle("o2-pan", narrow);
    if (Math.abs(w - R.w) < 1) return; R.w = w; R.h = h;
    view.style.width = vw + "px"; view.style.height = ch * h + "px";
    room.style.width = w + "px"; room.style.height = h + "px"; room.style.left = -VIEW.x0 * w + "px"; room.style.top = -VIEW.y0 * h + "px";
    renderer.setSize(w, h);
  };
  R.ro = new ResizeObserver(fit); R.ro.observe(stage); R.onwin = fit; window.addEventListener("resize", fit); fit();
  renderer.domElement.addEventListener("click", pick);
  loadModel().then((g) => { if (!R) return; R.model = g; R.sig = ""; R.fsig = ""; update(R.data); })
    .catch((e) => { tags.replaceChildren(el("div", "o2-err", "직원 모형을 불러오지 못했습니다: " + e.message)); });
  update(data);
  R.raf = requestAnimationFrame(loop);
  return R;
}

export function dispose() {
  if (!R) return;
  cancelAnimationFrame(R.raf);
  if (R.ro) R.ro.disconnect();
  if (R.onwin) window.removeEventListener("resize", R.onwin);
  R.renderer.dispose();
  R.container.classList.remove("o2");
  R = null;
}
export function select(name) {
  if (!R) return; R.sel = name || null;
  if (!R.think) { R.think = el("div", "o2-think"); R.tags.append(R.think); }
  for (const p of R.people.values()) p.tag.classList.toggle("sel", p.a.name === R.sel);
}
export function resetView() { if (R) { R.focus = null; applyFocus(); } }

// ---------- 좌표 ----------
const _v = new THREE.Vector3();
const W = (x, z, y = 0) => new THREE.Vector3(x, y, z);
function toPx(v) { _v.copy(v).project(R.camera); return { x: (_v.x + 1) / 2, y: (1 - _v.y) / 2 }; }
function cellXZ(c) { return { x: ORIGIN[c[0]], z: ORIGIN[c[1]], ex: LINES[c[0] + 1] - ORIGIN[c[0]], ez: LINES[c[1] + 1] - ORIGIN[c[1]] }; }
function local(z, u, v) { return W(z.x + (u === "EX" ? z.ex : u), z.z + (v === "EZ" ? z.ez : v)); }

// ---------- 복도 길 찾기(복도선 위 점끼리만 이동) ----------
function onLine(p) {   // 점이 놓인 복도선: {axis:"x"|"z", at}
  for (const L of LINES) { if (Math.abs(p.x - L) < 0.05) return { axis: "x", at: L }; }
  for (const L of LINES) { if (Math.abs(p.z - L) < 0.05) return { axis: "z", at: L }; }
  return null;
}
function route(a, b) {   // a·b: 복도선 위 점(Vector3). 복도 교차점을 거쳐 가장 짧은 길
  const nodes = [a, b];
  for (const x of LINES) for (const z of LINES) nodes.push(W(x, z));
  const lines = new Map();
  nodes.forEach((n, i) => {
    for (const L of LINES) {
      if (Math.abs(n.x - L) < 0.05) { const k = "x" + L; if (!lines.has(k)) lines.set(k, []); lines.get(k).push(i); }
      if (Math.abs(n.z - L) < 0.05) { const k = "z" + L; if (!lines.has(k)) lines.set(k, []); lines.get(k).push(i); }
    }
  });
  const adj = nodes.map(() => []);
  for (const [k, ids] of lines) {
    const ax = k[0] === "x" ? "z" : "x";
    ids.sort((i, j) => nodes[i][ax] - nodes[j][ax]);
    for (let i = 1; i < ids.length; i++) { const d = nodes[ids[i]].distanceTo(nodes[ids[i - 1]]); adj[ids[i]].push([ids[i - 1], d]); adj[ids[i - 1]].push([ids[i], d]); }
  }
  const dist = nodes.map(() => Infinity), prev = nodes.map(() => -1), done = nodes.map(() => false); dist[0] = 0;
  for (;;) {
    let u = -1; for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === 1) break; done[u] = true;
    for (const [v, d] of adj[u]) if (dist[u] + d < dist[v]) { dist[v] = dist[u] + d; prev[v] = u; }
  }
  if (dist[1] === Infinity) return [b];
  const path = []; for (let i = 1; i > 0; i = prev[i]) path.unshift(nodes[i].clone());
  return path;
}

// ---------- 데이터 ----------
export function update(data) {
  if (!R || !data) return;
  R.data = data;
  layoutZones(data);
  drawTabs();
  const fsig = R.zones.map((z) => z.id + ":" + z.cell).join(",") + "|" + !!R.model;
  if (fsig !== R.fsig) { buildFurniture(); R.fsig = fsig; R.sig = ""; }
  const placed = placeAgents(data);
  const sig = placed.map((x) => x.a.name + "@" + x.key).join(",") + "|" + !!R.model;
  if (sig !== R.sig) { buildPeople(placed); R.sig = sig; }
  for (const x of placed) { const p = R.people.get(x.a.name); if (p) setState(p, x.a); }
  drawZoneLabels();
  // 일이 넘어가는 순간: 서류가 날아간다 / 승인 대기가 되면 결재함까지 걸어온다
  for (const r of data.runs) {
    const prev = R.prevRuns.get(r.id);
    const fresh = !prev && R.seenOnce;
    if ((prev && prev !== r.status) || fresh) {
      const p = R.people.get(r.agent);
      if (p && r.status === "awaiting_approval" && !reduce && p.seat) { cancelWander(p); goTo(p, TRAY, 2.2, "stand_idle", "tray"); }
      else if (p && r.status === "awaiting_approval") paper(headPx(p), trayPx(), "#fff");
      else if (p && ["approved", "rejected"].includes(r.status)) {
        paper(trayPx(), headPx(p), r.status === "approved" ? "#DCFFF1" : "#FFD5D2");
        if (r.status === "approved") { bark(p, "🎉 승인됐다!"); [...R.people.values()].filter((q) => q !== p && q.z === p.z && !q.walk).slice(0, 2).forEach((q, i) => setTimeout(() => { bark(q, "👏"); q.lookTarget = p; q.lookT = performance.now() + 2500; }, 400 + i * 300)); }
        else bark(p, "😓 다시 해야겠다");
      }
    }
    R.prevRuns.set(r.id, r.status);
  }
  R.seenOnce = true;
  const tp = toPx(W(0.55, 16.4, 1.15));
  R.tray.style.left = tp.x * 100 + "%"; R.tray.style.top = tp.y * 100 + "%";
  R.tray.replaceChildren(el("span", "o2-tray-ic", "📥"), el("b", "", String(data.pending || 0)), el("span", "", " 결재함"));
  R.tray.classList.toggle("has", (data.pending || 0) > 0);
  applyFocus();
}
function layoutZones(data) {   // 부서 → 구역 칸. 공통(총괄)은 가운데, 나머지는 순서대로
  const groups = data.groups.slice();
  const si = groups.findIndex((g) => data.agents.some((a) => a.group === g.id && a.lead));
  const ordered = si >= 0 ? [groups[si], ...groups.filter((_, i) => i !== si)] : groups;
  R.zones = ordered.slice(0, CELL_ORDER.length).map((g, i) => ({ id: g.id, title: g.title.replace(/ 그룹.*$/, "").replace(/ 팀$/, "").replace(/\(.*\)/, "").trim(), lead: g.lead, cell: i, c: CELL_ORDER[i], tint: ZONE_TINT[i % ZONE_TINT.length] }));
  const free = CELL_ORDER.slice(R.zones.length);
  free.forEach((c, k) => R.zones.push({ id: k === free.length - 1 ? "_meeting" : "_spare" + k, title: k === free.length - 1 ? "회의 공간" : "빈 구역", cell: R.zones.length, c, tint: "#C9C9D6", empty: true, meeting: k === free.length - 1 }));
  R.zoneOf = new Map(R.zones.map((z) => [z.id, z]));
}
function placeAgents(data) {   // 부서 구역 자리에 사람 앉히기: 팀장 자리 ← 팀장, 나머지 4자리 ← 팀원, 넘치면 구역 앞에 서서
  const out = [];
  for (const z of R.zones) {
    if (z.empty) continue;
    const g = data.groups.find((x) => x.id === z.id), order = (g && g.members) || [];
    const ag = data.agents.filter((a) => a.group === z.id).sort((a, b) => ((a.st === "planned") - (b.st === "planned")) || (order.indexOf(a.name) - order.indexOf(b.name)));
    const lead = ag.find((a) => a.lead) || ag.find((a) => a.name === z.lead);
    if (lead) out.push({ a: lead, z, seat: 0, key: z.cell + ".0" });
    let s = 1, k = 0;
    for (const a of ag) {
      if (a === lead) continue;
      if (s < SEATS.length) out.push({ a, z, seat: s, key: z.cell + "." + s++ });
      else out.push({ a, z, stand: k, key: z.cell + ".s" + k++ });
    }
  }
  return out;
}
function drawTabs() {
  const d = R.data;
  const real = R.zones.filter((z) => !z.empty);
  const all = el("button", "o2-tab" + (!R.focus ? " on" : "")); all.type = "button";
  all.append(el("span", "o2-tab-t", "전체"), el("span", "o2-tab-n", `${d.agents.length}명 · ${real.length * SEATS.length}석`));
  all.onclick = () => { R.focus = null; drawTabs(); applyFocus(); };
  R.tabs.replaceChildren(all, ...real.map((z) => {
    const ag = d.agents.filter((a) => a.group === z.id);
    const n = (st) => ag.filter((a) => a.st === st).length;
    const alert = n("waiting") + n("error") + n("blocked");
    const b = el("button", "o2-tab" + (z.id === R.focus ? " on" : ""));
    b.type = "button"; b.style.setProperty("--zt", z.tint);
    b.append(el("i", "o2-tab-dot"), el("span", "o2-tab-t", z.title),
      el("span", "o2-tab-n", `${n("working") ? "▶" + n("working") + " " : ""}${ag.length}명`),
      alert ? el("span", "o2-tab-a", "!" + alert) : "");
    b.onclick = () => { R.focus = R.focus === z.id ? null : z.id; drawTabs(); applyFocus(); };
    return b;
  }));
}
function applyFocus() {
  if (!R) return;
  for (const p of R.people.values()) p.tag.classList.toggle("dim", !!R.focus && p.z.id !== R.focus);
  for (const z of R.zones) if (z.label) z.label.classList.toggle("on", z.id === R.focus);
}

// ---------- 가구(책상·의자·파티션) ----------
const box = (w, h, d, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = true; m.receiveShadow = true; return m; };
const MAT = {};
function mats() {
  if (MAT.desk) return MAT;
  const S = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0, ...o });
  Object.assign(MAT, { desk: S("#FBFAF7"), wood: S("#D9B48A"), leg: S("#B8BCC6"), panel: S("#D5DBE3", { roughness: 0.95 }), glass: S("#DDEBF3", { transparent: true, opacity: 0.55, roughness: 0.2 }),
    mon: S("#2B2F38", { roughness: 0.4 }), bin: S("#5E6673", { roughness: 0.6 }), bottle: S("#8EC9F0", { transparent: true, opacity: 0.75, roughness: 0.1 }), paper: S("#FFFFFF"), key: S("#E9EBEF"), plant: S("#7FBF7A"), pot: S("#C98E6B"), table: S("#F3E7DA") });
  return MAT;
}
function desk(g, x, z, w, d, top) {
  const M = mats();
  const t = box(w, 0.04, d, top || M.desk); t.position.set(x, 0.70, z); g.add(t);   // 믹사모 타자 동작의 손 높이에 맞춘 책상 높이
  for (const sx of [-1, 1]) { const l = box(0.04, 0.68, d * 0.9, M.leg); l.position.set(x + sx * (w / 2 - 0.05), 0.34, z); g.add(l); }
}
function monitor(g, x, z, faceZ) {   // faceZ: 화면이 보는 쪽(+1: +z, -1: -z)
  const M = mats();
  const scr = new THREE.MeshStandardMaterial({ color: "#3A4250", emissive: "#000000", roughness: 0.3 });
  const body = box(0.56, 0.34, 0.035, M.mon); body.position.set(x, 0.94, z); g.add(body);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.3), scr); face.position.set(x, 0.94, z + faceZ * 0.019); if (faceZ < 0) face.rotation.y = Math.PI; g.add(face);
  const st = box(0.06, 0.16, 0.06, M.mon); st.position.set(x, 0.79, z); g.add(st);
  const kb = box(0.42, 0.02, 0.14, M.key); kb.position.set(x, 0.73, z + faceZ * 0.43);   // 손이 닿는 자리(의자에서 약 0.6m) g.add(kb);
  return scr;
}
function panel(g, x1, z1, x2, z2, h, mat, rail, y0 = 0) {
  const len = Math.hypot(x2 - x1, z2 - z1), m = box(len, h, 0.06, mat);
  m.position.set((x1 + x2) / 2, y0 + h / 2, (z1 + z2) / 2); m.rotation.y = -Math.atan2(z2 - z1, x2 - x1); g.add(m);
  if (rail) { const r = box(len + 0.02, 0.05, 0.08, rail); r.position.set((x1 + x2) / 2, y0 + h + 0.02, (z1 + z2) / 2); r.rotation.y = m.rotation.y; g.add(r); }
}
function chairAt(g, pos, face) {
  const src = R.model && R.model.scene.getObjectByName("Chair");
  if (!src) return;
  const c = src.clone(true), holder = new THREE.Group();
  c.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  holder.add(c); holder.position.copy(pos); holder.rotation.y = face;
  g.add(holder);
}
function buildFurniture() {
  const M = mats();
  R.scene.remove(R.furn); R.furn = new THREE.Group(); R.scene.add(R.furn);
  R.screens = new Map();
  for (const z of R.zones) {
    const c = cellXZ(z.c), g = new THREE.Group(); g.position.set(c.x, 0, c.z); R.furn.add(g);
    const rail = new THREE.MeshStandardMaterial({ color: z.tint, roughness: 0.6 });
    // 구역 뒤쪽 두 변 파티션(보는 사람 반대쪽이라 사람을 가리지 않음). 앞쪽 두 변은 통로로 열려 있다.
    panel(g, 0.05, 0.05, CELL, 0.05, 1.2, M.panel, rail);
    panel(g, 0.05, 2.3, 0.05, CELL - 0.6, 1.2, M.panel, rail);   // 왼쪽 뒤 모서리는 비워 둠(뒤쪽 복사기·벽이 가리지 않게)
    if (z.meeting) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.04, 32), M.table); t.position.set(2.6, 0.74, 2.6); t.castShadow = t.receiveShadow = true; g.add(t);
      const leg = box(0.08, 0.72, 0.08, M.leg); leg.position.set(2.6, 0.36, 2.6); g.add(leg);
      [[2.6, 1.35, FACE.pz], [2.6, 3.85, FACE.nz], [1.35, 2.6, FACE.px], [3.85, 2.6, FACE.nx]].forEach(([u, v, f]) => chairAt(g, W(u, v), f));
      continue;
    }
    // 팀장 자리: 큰 나무 책상 + ㄱ자 파티션(뒤 + 왼쪽, 위는 유리). 오른쪽이 열려 있어 그쪽으로 드나든다.
    desk(g, 2.8, 1.2, 1.8, 0.7, M.wood);
    R.screens.set(z.cell + ".0", monitor(g, 2.8, 1.38, -1));
    panel(g, 1.55, 0.05, 1.55, 1.6, 1.2, M.panel, rail);
    panel(g, 1.55, 0.05, 4.3, 0.05, 0.45, M.glass, null, 1.25);
    panel(g, 1.55, 0.05, 1.55, 1.6, 0.45, M.glass, null, 1.25);
    // 팀원 4자리: 마주 보는 책상 2×2 + 가운데 낮은 칸막이
    for (let s = 1; s < SEATS.length; s++) {
      const st = SEATS[s], back = st.face === FACE.pz, dz = back ? 3.25 : 3.95;
      desk(g, st.u, dz, 1.38, 0.7);
      R.screens.set(z.cell + "." + s, monitor(g, st.u, back ? 3.48 : 3.72, back ? -1 : 1));
    }
    panel(g, 1.42, 3.6, 4.18, 3.6, 0.34, M.glass, null, 0.76);
    if (R.model) SEATS.forEach((st) => chairAt(g, W(st.u, st.v), st.face));
    if (z.cell % 3 === 1) {   // 화분 몇 개
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.32, 16), M.pot); pot.position.set(4.9, 0.16, 0.35); pot.castShadow = true; g.add(pot);
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), M.plant); leaf.position.set(4.9, 0.62, 0.35); leaf.castShadow = true; g.add(leaf);
    }
  }
  // 쓰레기통: 구역마다 팀장 자리 오른쪽(드나드는 길 밖)
  for (const z of R.zones) { if (z.meeting) continue; const c = cellXZ(z.c); bin(c.x + 4.95, c.z + 1.3); }
  // 생수통(휴게실 커피머신 왼쪽)
  const wc = box(0.34, 0.95, 0.34, M.desk); wc.position.set(11.3, 0.475, 0.4); R.furn.add(wc);
  const bt = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.42, 20), M.bottle); bt.position.set(11.3, 1.17, 0.4); bt.castShadow = true; R.furn.add(bt);
  const tap = box(0.08, 0.05, 0.06, M.mon); tap.position.set(11.3, 0.78, 0.6); R.furn.add(tap);
  bin(14.35, 0.55); bin(10.75, 0.45);
  // 복사실: 복사기 옆을 낮은 파티션으로 나누고 용지장·폐지함
  const g = new THREE.Group(); R.furn.add(g);
  panel(g, 0.1, 7.4, 1.8, 7.4, 1.2, M.panel, new THREE.MeshStandardMaterial({ color: "#9AA6B6", roughness: 0.6 }));
  const shelf = box(0.5, 0.9, 0.9, M.desk); shelf.position.set(0.4, 0.45, 8.0); g.add(shelf);
  for (let i = 0; i < 3; i++) { const ream = box(0.3, 0.07, 0.22, M.paper); ream.position.set(0.4, 0.935 + i * 0.075, 7.8 + (i % 2) * 0.3); g.add(ream); }
  bin(1.45, 7.75, "#3F7FBF");
  // 결재함: 왼쪽 벽 서류함
  const cab = box(0.5, 0.95, 0.8, M.desk); cab.position.set(0.45, 0.475, 16.4); R.furn.add(cab);
  const inbox = box(0.36, 0.12, 0.5, M.wood); inbox.position.set(0.45, 1.01, 16.4); R.furn.add(inbox);
}

// ---------- 사람 ----------
function buildPeople(placed) {
  for (const p of R.people.values()) { R.scene.remove(p.body); p.tag.remove(); }
  R.people.clear(); R.lounge.clear();
  if (!R.model) return;
  const base = R.model.scene;
  for (const x of placed) {
    const a = x.a, z = x.z, c = cellXZ(z.c);
    const seat = x.seat != null ? SEATS[x.seat] : null;
    const spot = seat ? local(c, seat.u, seat.v) : local(c, ...STAND[x.stand % STAND.length]);
    const clone = base.clone(true);
    const rig = clone.getObjectByName("Rig");
    const shirt = new THREE.Color(SHIRT[hashN(a.name, SHIRT.length)]), hair = new THREE.Color(HAIR[hashN(a.name + "h", HAIR.length)]);
    const list = [];
    rig.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.material = o.material.clone(); list.push(o.material);
      if (o.material.name === "Shirt") o.material.color.copy(shirt);
      if (o.material.name === "Hair") o.material.color.copy(hair);
    });
    const body = new THREE.Group();
    body.add(rig); body.position.copy(spot); body.rotation.y = seat ? seat.face : FACE.nz + 0.5; R.scene.add(body);
    const mixer = new THREE.AnimationMixer(rig);
    const acts = {};
    for (const clip of R.model.animations) { const act = mixer.clipAction(clip); act.enabled = true; acts[clip.name] = act; }
    const tag = el("button", "o2-tag"); tag.type = "button";
    tag.onclick = () => R.cb.onSelect && R.cb.onSelect(a.name);
    R.tags.append(tag);
    const headBone = rig.getObjectByName("head");
    const p = { headBone, look: 0, lookT: 0, lookTarget: null, nextGlance: performance.now() + rnd(3000, 12000), bark: null, barkUntil: 0, lastBark: 0, lastTool: "",
      pace: rnd(0.88, 1.12), lane: [rnd(-0.25, 0.25), rnd(-0.25, 0.25)], a, z, seat, home: spot.clone(), face: seat ? seat.face : FACE.nz + 0.5, out: seat ? seat.out.map(([u, v]) => local(c, u, v)) : null,
      body, rig, mixer, acts, mats: list, tag, screen: R.screens && R.screens.get(x.key), cur: null, st: null, walk: null, phase: Math.random() * 10, nextWander: 0 };
    R.people.set(a.name, p);
    play(p, seat ? "sit_idle" : "stand_idle", 0);
    p.mixer.update(p.phase);
  }
}
function play(p, name, fade = 0.45) {
  const next = p.acts[name]; if (!next || p.cur === name) return;
  next.reset(); next.setEffectiveWeight(1); next.play();
  const prev = p.cur && p.acts[p.cur];
  if (prev && fade > 0 && !reduce) prev.crossFadeTo(next, fade, false); else if (prev) prev.stop();
  next.timeScale = name === "typing" ? 1.35 : name === "walk" ? 1.2 : 1;
  p.cur = name;
}
function setState(p, a) {
  p.a = a;
  const changed = p.st !== a.st; p.st = a.st;
  const ghost = a.st === "planned";
  for (const m of p.mats) { m.transparent = false; m.opacity = 1; m.depthWrite = true; }   // 사람은 늘 불투명(예정 직원도 이름표로만 구분)
  if (p.screen) { p.screen.emissive.set(a.st === "working" ? "#5AA9FF" : a.st === "waiting" ? "#E2B203" : a.st === "error" || a.st === "blocked" ? "#E34935" : "#000000"); p.screen.emissiveIntensity = a.st === "idle" || ghost ? 0 : 0.9; }
  if (changed && p.walk && ((p.walk.kind === "wander" && a.st !== "idle") || (p.walk.kind === "errand" && a.st !== "working"))) cancelWander(p);   // 일이 들어오거나 바뀌면 바로 자리로
  if (AWAY(a.st) && p.st0 === undefined) { p.away = true; p.body.visible = false; }   // 화면을 열 때 이미 퇴근한 사람은 없음
  else if (changed && AWAY(a.st) && !p.away) leave(p, a.st === "fired");
  else if (changed && !AWAY(a.st) && p.away) arrive(p);
  else if (changed && !AWAY(a.st) && p.walk && p.walk.kind === "leave") { cancelWander(p); bark(p, "↩ 아, 다시 들어갈게요"); }   // 나가다가 다시 근무가 되면 돌아옴
  if (changed && p.st0 !== undefined) {
    if (a.st === "waiting") bark(p, "🙋 확인 부탁드려요!");
    else if (a.st === "error") bark(p, "😵 앗, 멈췄다");
    else if (a.st === "blocked") bark(p, "⛔ 막혔네…");
    else if (a.st === "working" && p.st0 === "idle") bark(p, "💪 시작!");
    else if (a.st === "idle" && p.st0 === "working") bark(p, "✅ 끝!");
  }
  p.st0 = a.st;
  if (a.st === "working" && a.tool && a.tool !== p.lastTool) { p.lastTool = a.tool; const v = TOOL_BARK[a.tool] || (a.tool.startsWith("mcp__") ? "🔌 도구 쓰는 중" : ""); if (v) bark(p, v); }
  if (changed && (a.st === "idle" || a.st === "working")) p.nextWander = performance.now() + (a.st === "idle" ? 1 : rnd(15000, 45000));
  if (!p.walk) play(p, p.seat ? CLIP[a.st] : "stand_idle");
  const badge = { waiting: "!", blocked: "⛔", error: "✖" }[a.st] || "";
  const mini = (a.st === "idle" || a.st === "planned") && !(p.walk && p.walk.kind === "wander");   // 쉬는 사람은 작은 점만(마우스를 올리면 이름)
  p.tag.className = "o2-tag st-" + a.st + (mini ? " mini" : "") + (a.name === R.sel ? " sel" : "") + (p.seat && p.seat.lead ? " lead" : "") + (R.focus && p.z.id !== R.focus ? " dim" : "");
  p.tag.style.setProperty("--c", STATE_COLOR[a.st] || "#888");
  p.tag.title = `${a.title} (${a.name}) — ${p.z.title}${p.seat && p.seat.lead ? " 팀장 자리" : ""} · ${STATE_KO[a.st] || a.st}${a.topic ? " · " + a.topic : ""}`;
  p.tag.replaceChildren(
    badge ? el("span", "o2-badge", badge) : "",
    el("span", "o2-name", a.title),
    el("span", "o2-st", p.walk && (p.walk.kind === "wander" || p.walk.kind === "errand") ? p.walk.what : a.st === "working" && a.topic ? "▶ " + a.topic : STATE_KO[a.st] || a.st));
  // 일을 맡는 순간: 맡긴 쪽 자리에서 서류가 날아온다. 맡긴 쪽이 없으면 출입구에서.
  if (changed && a.st === "working" && p.prevSt && p.prevSt !== "planned") {
    const from = a.by && R.people.get(a.by) && a.by !== a.name ? headPx(R.people.get(a.by)) : toPx(W(DOOR.x, DOOR.z, 1.6));
    paper(from, headPx(p), "#fff");
  }
  p.prevSt = a.st;
}

// ---------- 걷기 ----------
// 길: 자리 → (출구 점들) → 복도 → 목적지 앞 복도선 → 목적지. 돌아올 때는 지나온 점을 거꾸로.
function goTo(p, dest, stay, clip, kind, what = "") {
  if (!p.seat || p.walk) return false;
  const exit = p.out[p.out.length - 1], via = W(dest.via[0], dest.via[1]);
  const mid = route(exit, via).map((q, i, arr) => i < arr.length - 1 ? q.add(W(p.lane[0], p.lane[1])) : q);   // 사람마다 복도 안쪽·바깥쪽을 조금씩 달리 걸음
  const legs = [...p.out, ...mid, W(dest.x, dest.z)];
  p.walk = { legs, done: [p.home.clone()], stay, clip, kind, what, face: dest.face, dest, phase: "go", t: 0 };
  play(p, "walk", 0.3);
  if (kind === "wander" || kind === "errand") setState(p, p.a);
  return true;
}
function cancelWander(p) {
  const w = p.walk; if (!w || w.phase === "back") return;
  if (w.dest && w.dest.slot) R.lounge.delete(w.dest.slot);
  w.phase = "back"; w.legs = w.done.slice().reverse(); w.kind = "return";
  play(p, "walk", 0.3);
}
function stepWalk(p, dt) {
  const w = p.walk; if (!w) return;
  if (w.phase === "stay") {
    w.t += dt;
    if (w.t > w.stay) { if (w.dest.slot) R.lounge.delete(w.dest.slot); w.phase = "back"; w.legs = w.done.slice().reverse(); play(p, "walk", 0.3); }
    return;
  }
  const target = w.legs[0];
  const pos = p.body.position, d = _v.copy(target).sub(pos); d.y = 0;
  const dist = d.length(), speed = 1.55 * p.pace;   // 바쁜 걸음(사람마다 걸음 빠르기가 조금씩 다름)
  if (dist < 0.04) {
    pos.copy(target);
    const reached = w.legs.shift();
    if (w.phase === "go" && w.legs.length) w.done.push(reached.clone());
    if (!w.legs.length) {
      if (w.phase === "go" && w.kind === "leave") { p.walk = null; p.away = true; p.body.visible = false; return; }
      if (w.phase === "go") { w.phase = "stay"; w.t = 0; if (w.face != null) turnTo(p, w.face, 1); play(p, w.clip, 0.35); arriveBark(p, w); }
      else { p.walk = null; p.backAt = performance.now(); p.body.position.copy(p.home); turnTo(p, p.face, 1); play(p, CLIP[p.st] || "sit_idle", 0.5); setState(p, p.a); }
    }
    return;
  }
  pos.addScaledVector(d.normalize(), Math.min(dist, speed * dt));
  // 마주 오거나 나란히 걷는 사람과 부딪히지 않게 옆으로 살짝 비켜 걷기(복도 폭 안에서)
  for (const q of R.people.values()) {
    if (q === p || !q.walk || q.away) continue;
    const ox = q.body.position.x - pos.x, oz = q.body.position.z - pos.z, dd = Math.hypot(ox, oz);
    if (dd > 0.01 && dd < 0.6) { const side = Math.sign(ox * -d.z + oz * d.x) || 1; pos.x -= -d.z * side * 0.5 * dt; pos.z -= d.x * side * 0.5 * dt; }
  }
  turnTo(p, Math.atan2(d.x, d.z), Math.min(1, dt * 8));
}
function turnTo(p, yaw, k) {
  const cur = p.body.rotation.y, diff = ((yaw - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  p.body.rotation.y = cur + diff * k;
}
// ---------- 살아 있는 느낌(NPC) ----------
// 지어낸 일은 하지 않는다: 말풍선은 실제 상태 변화·실제로 쓴 도구·실제 이동에서만 뜬다. 고개 돌리기·인사·걸음 차이는 연출.
const TOOL_BARK = { WebSearch: "🔍 찾아보는 중", WebFetch: "🌐 읽어 보는 중", Read: "📖 자료 읽는 중", Grep: "🔎 뒤지는 중", Glob: "🗂 파일 찾는 중",
  Write: "✍ 쓰는 중", Edit: "✏ 고치는 중", Bash: "⚙ 돌려 보는 중", Agent: "📨 일 맡기는 중", Task: "📨 일 맡기는 중", Skill: "📘 규칙 확인", TodoWrite: "📝 할 일 정리" };
function bark(p, text, ms = 2600) {
  if (reduce || !text) return;
  const now = performance.now();
  if (now - p.lastBark < 1500 && p.bark) { clearTimeout(p.barkQ); p.barkQ = setTimeout(() => R && bark(p, text, ms), 1600 - (now - p.lastBark)); return; }   // 앞 말이 끝나면 이어서
  if (p.bark) p.bark.remove();
  p.bark = el("div", "o2-bark", text); R.tags.append(p.bark);
  p.barkUntil = now + ms; p.lastBark = now;
}
function arriveBark(p, w) {
  if (w.kind === "tray") return bark(p, "📥 결재 올립니다");
  if (!w.what) return;
  if (w.what.includes("협의")) {   // 찾아간 부서의 가장 가까운 사람이 고개를 돌려 맞아 준다
    const host = [...R.people.values()].filter((q) => q !== p && !q.walk).sort((a, b) => a.body.position.distanceTo(p.body.position) - b.body.position.distanceTo(p.body.position))[0];
    bark(p, "💬 잠깐 얘기 좀…");
    if (host && host.body.position.distanceTo(p.body.position) < 2.5) { host.lookTarget = p; host.lookT = performance.now() + 5000; setTimeout(() => bark(host, "🙂 네, 말씀하세요"), 900); }
  } else bark(p, { "☕ 휴식": "☕ 한숨 돌리자", "💧 물": "💧 물 한 잔", "🖨 복사": "🖨 출력 중…", "🖨 출력물 가지러": "🖨 출력물 챙기고", "🗂 회의 준비": "🗂 회의 자료 놓고" }[w.what] || w.what);
}
const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _side = new THREE.Vector3(1, 0, 0);
function leave(p, fired) {   // 출입구로 걸어 나가 사라짐
  cancelWander(p); p.walk = null;
  if (reduce || !p.seat) { p.away = true; p.body.visible = false; return; }
  const exit = p.out[p.out.length - 1], door = W(2.2, DOOR.z);
  p.walk = { legs: [...p.out, ...route(exit, door), W(DOOR.x, DOOR.z)], done: [p.home.clone()], kind: "leave", what: "", phase: "go", t: 0, dest: {} };
  play(p, "walk", 0.3); bark(p, fired ? "📦 짐 싸서 나갑니다" : "👋 먼저 들어가 볼게요");
}
function arrive(p) {   // 출입구로 들어와 자리에 앉음
  p.away = false; p.body.visible = true;
  if (reduce || !p.seat) { p.body.position.copy(p.home); turnTo(p, p.face, 1); return; }
  const exit = p.out[p.out.length - 1], door = W(2.2, DOOR.z);
  p.body.position.set(DOOR.x, 0, DOOR.z);
  p.walk = { legs: [door, ...route(door, exit), ...p.out.slice(0, -1).reverse(), p.home.clone()], done: [], kind: "arrive", what: "", phase: "back", t: 0, dest: {} };
  play(p, "walk", 0.3); bark(p, "☀ 출근했습니다");
}
function alive(p, now, dt) {
  if (!p.headBone || p.away) return;
  const seated = !p.walk && p.seat;
  // 일하다가 가끔 손을 멈추고 화면을 들여다봄(2~3초) / 쉬는 사람은 의자를 살짝 좌우로 돌림
  if (seated && p.st === "working") {
    if (!p.pauseAt) p.pauseAt = now + rnd(15000, 35000);
    if (now > p.pauseAt && !p.pauseUntil) { p.pauseUntil = now + rnd(2000, 3500); play(p, "sit_idle", 0.5); }
    if (p.pauseUntil && now > p.pauseUntil) { p.pauseUntil = 0; p.pauseAt = now + rnd(15000, 35000); play(p, "typing", 0.5); }
  } else if (p.pauseUntil) { p.pauseUntil = 0; }
  if (seated) {
    const sway = p.st === "idle" ? Math.sin(now / 2600 + p.phase) * 0.14 : 0;
    p.body.rotation.y += ((p.face + sway) - p.body.rotation.y) * Math.min(1, dt * 2);
    if (p.st === "idle" && now > (p.nextChat || 0)) {   // 옆자리 동료와 잡담
      p.nextChat = now + rnd(25000, 60000);
      const mate = [...R.people.values()].find((q) => q !== p && q.z === p.z && !q.walk && !q.away && q.st === "idle" && q.body.position.distanceTo(p.body.position) < 3.2);
      if (mate && Math.random() < 0.6) {
        p.lookTarget = mate; mate.lookTarget = p; p.lookT = mate.lookT = now + 4000; mate.nextChat = now + 30000;
        bark(p, "💬"); setTimeout(() => bark(mate, "😄"), 1200);
      }
    }
  }
  // 바라볼 대상: (1) 누가 불렀거나 박수 칠 사람 (2) 가까이 지나가는 사람(앉아 있을 때 힐끔) (3) 가끔 이리저리
  let want = 0;
  if (p.lookTarget && now < p.lookT) want = yawTo(p, p.lookTarget.body.position);
  else {
    p.lookTarget = null;
    if (!p.walk && p.seat) {
      const near = [...R.people.values()].find((q) => q !== p && q.walk && q.body.position.distanceTo(p.body.position) < 2.2);
      if (near && p.st !== "working") want = yawTo(p, near.body.position);
      else if (now > p.nextGlance) { p.glance = rnd(-0.7, 0.7); p.glanceUntil = now + rnd(900, 2200); p.nextGlance = now + (p.st === "working" ? rnd(9000, 20000) : rnd(4000, 10000)); }
      if (!near && p.glanceUntil && now < p.glanceUntil) want = p.glance;
    }
  }
  want = Math.max(-1.0, Math.min(1.0, want));
  p.look += (want - p.look) * Math.min(1, dt * 5);
  if (Math.abs(p.look) > 0.002) { _q.setFromAxisAngle(_up, p.look); p.headBone.quaternion.multiply(_q); }
  if (p.cur === "typing" && !p.lookTarget) { _q.setFromAxisAngle(_side, Math.sin(now / 900 + p.phase) * 0.06); p.headBone.quaternion.multiply(_q); }   // 화면 보며 고개 끄덕
}
function yawTo(p, target) {   // 몸이 보는 방향 기준으로 대상까지 몇 도 돌려야 하는지
  const dx = target.x - p.body.position.x, dz = target.z - p.body.position.z;
  return ((Math.atan2(dx, dz) - p.body.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}
function greetings(now) {   // 걷다가 서로 스치면 손 인사
  if (reduce) return;
  const ws = [...R.people.values()].filter((q) => q.walk && q.walk.phase !== "stay");
  for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) {
    const a = ws[i], b = ws[j];
    if (a.body.position.distanceTo(b.body.position) < 1.3 && now - (a.greeted || 0) > 15000 && now - (b.greeted || 0) > 15000) {
      a.greeted = b.greeted = now; bark(a, "👋"); setTimeout(() => bark(b, "👋 안녕하세요"), 500);
      a.lookTarget = b; b.lookTarget = a; a.lookT = b.lookT = now + 1200;
    }
  }
}
function bin(x, z, color) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.4, 16), color ? new THREE.MeshStandardMaterial({ color, roughness: 0.6 }) : mats().bin);
  m.position.set(x, 0.2, z); m.castShadow = m.receiveShadow = true; R.furn.add(m);
}
function meetSpots() {   // 회의 공간 탁자 옆에 서는 자리 2곳
  const m = R.zones.find((z) => z.meeting); if (!m) return [];
  const c = cellXZ(m.c), col = m.c[0], row = m.c[1];
  if (!m.spots) m.spots = [{ x: c.x + 4.6, z: c.z + 2.6, via: [LINES[col + 1], c.z + 2.6], face: FACE.nx }, { x: c.x + 2.6, z: c.z + 4.6, via: [c.x + 2.6, LINES[row + 1]], face: FACE.nz }];
  return m.spots;
}
function visitSpot(p) {   // 다른 부서 책상 앞(앞쪽 복도 옆)에 들러 이야기
  const others = R.zones.filter((z) => !z.empty && z !== p.z); if (!others.length) return null;
  const z = others[Math.floor(Math.random() * others.length)], c = cellXZ(z.c), u = Math.random() < 0.5 ? 2.1 : 3.5;
  return { x: c.x + u, z: c.z + 5.4, via: [c.x + u, LINES[z.c[1] + 1]], face: FACE.nz };
}
// 분주하게: 대기 중인 직원은 자주 휴게실(커피·생수)·복사실·회의 공간·다른 부서에 다녀오고,
// 일하는 직원도 가끔 복사실에 출력물을 가지러 다녀온다(그동안 이름표는 하던 일 그대로). 같은 자리에는 한 사람씩.
function busyCount() { return [...R.people.values()].filter((q) => q.walk && (q.walk.kind === "wander" || q.walk.kind === "errand")).length; }
function busyCap() { return Math.max(2, Math.ceil([...R.people.values()].filter((q) => !q.away && q.seat).length * 0.45)); }   // 절반 넘게 한꺼번에 자리를 비우지 않게
// 실제로 「대기」인 직원이 돌아가며 움직이게: 몇 초마다 가장 오래 자리에만 있던 대기 직원 한 명을 보낸다(같은 사람만 계속 움직이지 않게)
function wanderDispatch(now) {
  if (reduce || now < (R.nextDispatch || 0)) return;
  R.nextDispatch = now + rnd(2500, 6000);
  if (busyCount() >= busyCap()) return;
  const idle = [...R.people.values()].filter((q) => q.st === "idle" && q.seat && !q.walk && !q.away && now - (q.backAt || 0) > 8000);
  if (!idle.length) return;
  idle.sort((a, b) => (a.lastOut || 0) - (b.lastOut || 0) || Math.random() - 0.5);
  const p = idle[0]; p.lastOut = now; p.nextWander = 1; maybeWander(p, now, true);
}
function maybeWander(p, now, picked = false) {
  if (reduce || p.walk || p.away || !p.seat || !p.nextWander || now < p.nextWander) return;
  const idle = p.st === "idle", working = p.st === "working";
  if (!idle && !working) return;
  if (idle && !picked) return;   // 대기 직원은 위 순번표로만
  if (busyCount() >= busyCap()) return;   // 자리가 나면 다음에 다시(타이머는 그대로)
  p.nextWander = now + (idle ? 1 : rnd(30000, 70000));
  const take = (spot) => spot && !R.lounge.has(spot) ? (R.lounge.add(spot), spot) : null;
  if (working) {
    const s = take(COPIER); if (s) goTo(p, { ...s, slot: s }, rnd(2.5, 4), "stand_idle", "errand", "🖨 출력물 가지러");
    return;
  }
  const r = Math.random(), free = LOUNGE.filter((x) => !R.lounge.has(x)), meet = meetSpots().filter((x) => !R.lounge.has(x));
  let s;
  if (r < 0.18 && (s = take(WATER))) goTo(p, { ...s, slot: s }, rnd(3, 6), "drink", "wander", "💧 물");
  else if (r < 0.42 && free.length) { s = take(free[Math.floor(Math.random() * free.length)]); goTo(p, { ...s, face: FACE.nz, slot: s }, rnd(5, 9), "drink", "wander", "☕ 휴식"); }
  else if (r < 0.58 && (s = take(COPIER))) goTo(p, { ...s, slot: s }, rnd(3, 5), "stand_idle", "wander", "🖨 복사");
  else if (r < 0.74 && meet.length) { s = take(meet[Math.floor(Math.random() * meet.length)]); goTo(p, { ...s, slot: s }, rnd(5, 9), "stand_idle", "wander", "🗂 회의 준비"); }
  else { s = visitSpot(p); if (s) goTo(p, s, rnd(4, 8), "stand_idle", "wander", "💬 협의"); }
}

// ---------- 서류 ----------
function headPx(p) { const h = p.body.position.clone(); h.y += 1.6; return toPx(h); }
function trayPx() { return toPx(W(0.45, 16.4, 1.1)); }
function paper(a, b, color) {
  if (reduce || !a || !b) return;
  const e = el("i", "o2-paper"); e.style.background = color;
  e.style.left = a.x * 100 + "%"; e.style.top = a.y * 100 + "%";
  R.tags.append(e);
  requestAnimationFrame(() => requestAnimationFrame(() => { e.style.left = b.x * 100 + "%"; e.style.top = b.y * 100 + "%"; e.style.opacity = "0"; }));
  setTimeout(() => e.remove(), 1400);
}
function drawZoneLabels() {
  for (const z of R.zones) {
    if (!z.label) {
      z.label = el("button", "o2-zone" + (z.empty ? " vacant" : "")); z.label.type = "button";
      z.label.style.setProperty("--zt", z.tint);
      if (!z.empty) z.label.onclick = () => { R.focus = R.focus === z.id ? null : z.id; drawTabs(); applyFocus(); };
      R.tags.append(z.label);
    }
    const c = cellXZ(z.c), q = toPx(W(c.x + 2.4, c.z + 0.1, 1.3));
    z.label.style.left = q.x * 100 + "%"; z.label.style.top = q.y * 100 + "%";
    const used = [...R.people.values()].filter((p) => p.z.id === z.id && p.seat).length;
    z.label.replaceChildren(el("b", "", z.title), z.meeting ? "" : el("span", "", ` ${used}/${SEATS.length}석`));
  }
  for (const el2 of R.tags.querySelectorAll(".o2-zone")) if (!R.zones.some((z) => z.label === el2)) el2.remove();
  if (!R.places) R.places = PLACES.map((x) => { const e = el("span", "o2-place", x.t); R.tags.append(e); return { ...x, e }; });
  for (const x of R.places) { const q = toPx(W(x.x, x.z, x.y)); x.e.style.left = q.x * 100 + "%"; x.e.style.top = q.y * 100 + "%"; }
}

// ---------- 그리기 ----------
function loop(now) {
  if (!R) return;
  R.raf = requestAnimationFrame(loop);
  if (!R.container.isConnected) { dispose(); return; }
  const dt = Math.min(0.05, R.clock.getDelta());
  for (const p of R.people.values()) {
    p.mixer.update(dt);
    if (p.walk) stepWalk(p, dt); else maybeWander(p, now);
    alive(p, now, dt);
    const head = p.body.position.clone(); head.y += (p.cur === "walk" || p.cur === "stand_idle" || p.cur === "drink" ? 1.85 : 1.5);
    const q = toPx(head);
    p.tag.style.left = q.x * 100 + "%"; p.tag.style.top = q.y * 100 + "%";
    p.tag.hidden = !!p.away;
    p.tag.style.zIndex = String((p.st === "idle" || p.st === "planned" ? 100 : 400) + Math.round(q.y * 100));
    if (p.bark) {
      if (now > p.barkUntil) { p.bark.remove(); p.bark = null; }
      else { const bq = toPx(head.setY(head.y + 0.45)); p.bark.style.left = bq.x * 100 + "%"; p.bark.style.top = bq.y * 100 + "%"; }
    }
  }
  greetings(now);
  wanderDispatch(now);
  const sp = R.sel && R.people.get(R.sel);   // 누른 직원의 생각 말풍선(실제 기록으로 만든 문장)
  if (R.think) {
    R.think.hidden = !(sp && sp.a.thought);
    if (sp && sp.a.thought) {
      if (R.think.dataset.t !== sp.a.thought) { R.think.dataset.t = sp.a.thought; R.think.textContent = "💭 " + sp.a.thought; }
      const q = toPx(sp.body.position.clone().setY(2.25)); R.think.style.left = q.x * 100 + "%"; R.think.style.top = q.y * 100 + "%";
    }
  }
  R.renderer.render(R.scene, R.camera);
}
function pick(ev) {
  const r = R.renderer.domElement.getBoundingClientRect();
  const x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
  let best = null, bd = 0.03;
  for (const p of R.people.values()) {
    const c = p.body.position.clone(); c.y += 0.9; const q = toPx(c);
    const d = Math.hypot(q.x - x, (q.y - y) * IMG_H / IMG_W); if (d < bd) { bd = d; best = p; }
  }
  if (best && R.cb.onSelect) R.cb.onSelect(best.a.name);
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

// 보정용(개발자 도구에서 window.__office2 로 확인)
window.__office2 = { get R() { return R; }, SEATS, LINES, route: (a, b) => route(a, b), toPx: (x, z, y) => toPx(W(x, z, y)) };
