// Agent Hub — 3D 사무실 모니터 (WebGL, three.js r169 / MIT, 같은 폴더에 들어 있음 — 인터넷 없이 동작)
// 에이전트마다 책상·캐릭터. 상태에 따라: 작업 중=타자·화면 코드 흐름, 승인 기다림=손 들기·「!」, 차단=빨간 경광등, 오류=빨간 화면·연기,
// 대기=숨 쉬기·가끔 커피 마시러 감, 예정=반투명. 일이 넘어가면 서류가 다음 책상으로 날아가고, 승인 대기가 되면 담당이 「나」 책상까지 걸어가 서류를 둔다.
import * as THREE from "./three.module.min.js";

const STATE_COLOR = { working: "#22A06B", waiting: "#E2B203", blocked: "#E34935", error: "#C9372C", idle: "#579DFF", planned: "#8590A2" };
const STATE_KO = { working: "작업 중", waiting: "승인 기다림", blocked: "훅 차단", error: "오류", idle: "대기", planned: "예정" };
const ZONE_COLORS = ["#DCEBFF", "#E3F5EA", "#FFF1D6", "#F1E8FF", "#FFE3E0", "#E0F4F7", "#EEF0F3"];
const PALETTE = ["#1D7AFC", "#1F845A", "#8F7EE7", "#E2B203", "#F38A3F", "#C9372C", "#2898BD", "#943D73", "#5B7F24", "#AE4787"];
const hashColor = (s) => { let x = 0; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[x % PALETTE.length]; };
const HAIR = ["#3B2A1A", "#6B4423", "#1D1D1D", "#B5651D", "#5E4DB2", "#943D73"];
const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const FONT = () => getComputedStyle(document.body).fontFamily || "sans-serif";

let R = null; // 현재 장면(한 번에 하나)

export function supported() {
  try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl"))); } catch { return false; }
}

export function mount(container, data, cb = {}) {
  if (R && R.container === container) { update(data); return R; }
  if (R) dispose();
  const W = () => container.clientWidth || 800, H = () => container.clientHeight || 520;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(W(), H());
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-label", "에이전트 사무실 3D 화면");
  renderer.domElement.tabIndex = 0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, W() / H(), 0.1, 400);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x9aa3b0, 1.1);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 120 });
  scene.add(hemi, sun, sun.target);

  R = {
    container, renderer, scene, camera, hemi, sun, cb, data: null,
    world: new THREE.Group(), agents: new Map(), deskPos: new Map(), papers: [], puffs: [], walkers: [],
    orbit: { theta: 0.0, phi: 0.95, dist: 46, target: new THREE.Vector3(0, 0, 2), goal: null },
    prevRuns: new Map(), keySig: "", sel: null, raf: 0, last: performance.now(), clockTex: null, kpiTex: null, hover: null,
  };
  scene.add(R.world);
  bindControls();
  new ResizeObserver(() => { renderer.setSize(W(), H()); camera.aspect = W() / H(); camera.updateProjectionMatrix(); }).observe(container);
  update(data);
  R.raf = requestAnimationFrame(loop);
  return R;
}

export function dispose() {
  if (!R) return;
  cancelAnimationFrame(R.raf);
  R.renderer.dispose();
  R.renderer.domElement.remove();
  R = null;
}

export function select(name) { if (!R) return; R.sel = name; highlight(); if (name && R.deskPos.get(name)) focusOn(R.deskPos.get(name)); }
export function resetView() { if (!R) return; Object.assign(R.orbit, { theta: 0, phi: 0.95, dist: R.home.dist }); R.orbit.goal = R.home.target.clone(); }

// ---------- 데이터 갱신 ----------
export function update(data) {
  if (!R) return;
  R.data = data;
  const sig = data.agents.map((a) => a.name).join("|");
  if (sig !== R.keySig) { build(data); R.keySig = sig; }
  for (const a of data.agents) setState(a);
  // 일이 넘어가는 순간: 서류가 날아간다
  const whoFor = (st) => ({ queued: "reels-maker", running: "reels-maker", validating: "reels-validator", validation_failed: "reels-validator",
    awaiting_approval: "__me", approved: "__done", rejected: "__trash", error: "reels-maker" })[st];
  const pos = (key, r) => key === "__me" ? R.mePos : key === "__done" ? R.shelfPos : key === "__trash" ? R.trashPos : (R.deskPos.get(key) || R.deskPos.get(r.agent));
  for (const r of data.runs) {
    const prev = R.prevRuns.get(r.id);
    if (prev && prev !== r.status) {
      if (r.status === "awaiting_approval" && R.agents.get(r.agent) && !reduce) walkToMe(r.agent);   // 담당이 직접 「나」 책상까지 들고 온다
      else { const from = pos(whoFor(prev), r), to = pos(whoFor(r.status), r);
        if (from && to && from !== to) flyPaper(from, to, r.status === "rejected" ? 0xffd5d2 : r.status === "approved" ? 0xdcfff1 : 0xffffff); }
    } else if (!prev && R.prevRuns.size && ["queued", "running"].includes(r.status)) {
      const d = R.deskPos.get(r.agent); if (d) flyPaper(R.mePos, d, 0xffffff);   // 새 일이 들어옴
    }
    R.prevRuns.set(r.id, r.status);
  }
  setPile(data.pending);
  drawKpi(data.kpi);
}

// ---------- 장면 만들기 ----------
function mat(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05, ...extra }); }
function box(w, h, d, color, extra) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, extra)); m.castShadow = true; m.receiveShadow = true; return m; }

function textCanvas(w, h, draw) { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); draw(g, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return { c, g, t }; }

function label(text, sub, color) {
  const { t } = textCanvas(512, 128, (g, w, h) => {
    g.fillStyle = "rgba(23,43,77,.86)"; roundRect(g, 4, 18, w - 8, h - 36, 40); g.fill();
    g.fillStyle = color || "#579DFF"; g.beginPath(); g.arc(52, h / 2, 16, 0, 7); g.fill();
    g.fillStyle = "#fff"; g.font = `700 40px ${FONT()}`; g.textBaseline = "middle"; g.fillText(text, 84, h / 2 - (sub ? 12 : 0), w - 110);
    if (sub) { g.font = `500 26px ${FONT()}`; g.fillStyle = "rgba(255,255,255,.8)"; g.fillText(sub, 84, h / 2 + 24, w - 110); }
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(2.6, 0.65, 1); s.renderOrder = 10; return s;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

function character(name, me) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const shirt = me ? "#5E4DB2" : hashColor(name);
  const hair = HAIR[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % HAIR.length];
  const legG = new THREE.BoxGeometry(0.18, 0.5, 0.18); legG.translate(0, -0.25, 0);
  const armG = new THREE.BoxGeometry(0.14, 0.48, 0.14); armG.translate(0, -0.24, 0);
  const pants = mat("#2C3E5D"), skin = mat("#F1C27D"), cloth = mat(shirt);
  const legL = new THREE.Mesh(legG, pants), legR = new THREE.Mesh(legG, pants);
  legL.position.set(-0.12, 0.5, 0); legR.position.set(0.12, 0.5, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.56, 0.3), cloth); torso.position.y = 0.8;
  const head = new THREE.Group(); head.position.y = 1.28;
  const face = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.36), skin);
  const hairM = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.13, 0.38), mat(hair)); hairM.position.y = 0.22;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.08), mat(hair)); back.position.set(0, 0.06, 0.16);
  const eyeM = mat("#172B4D");
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), eyeM), eyeR = eyeL.clone();
  eyeL.position.set(-0.08, 0.03, -0.185); eyeR.position.set(0.08, 0.03, -0.185);
  head.add(face, hairM, back, eyeL, eyeR);
  const armL = new THREE.Mesh(armG, cloth), armR = new THREE.Mesh(armG, cloth);
  armL.position.set(-0.33, 1.04, 0); armR.position.set(0.33, 1.04, 0);
  for (const m of [legL, legR, torso, face, hairM, armL, armR]) { m.castShadow = true; }
  body.add(legL, legR, torso, head, armL, armR);
  root.userData = { parts: { body, legL, legR, torso, head, armL, armR }, mats: [pants, skin, cloth] };
  return root;
}

function setPose(ch, pose, t, phase = 0) {
  const p = ch.userData.parts;
  const seated = pose === "sit" || pose === "type";
  p.body.position.y = seated ? -0.08 : 0;
  p.legL.rotation.x = p.legR.rotation.x = seated ? Math.PI / 2 : 0;
  p.armL.rotation.set(0, 0, 0); p.armR.rotation.set(0, 0, 0); p.head.rotation.set(0, 0, 0);
  if (pose === "type") {
    const k = reduce ? 0 : 1;
    p.armL.rotation.x = 1.15 + 0.12 * Math.sin(t * 18 + phase) * k;
    p.armR.rotation.x = 1.15 + 0.12 * Math.sin(t * 18 + phase + 1.7) * k;
    p.head.rotation.x = 0.06 * Math.sin(t * 2 + phase) * k;
  } else if (pose === "sit") {
    p.armL.rotation.x = p.armR.rotation.x = 0.9;
    p.torso.scale.y = 1 + 0.02 * Math.sin(t * 1.6 + phase);
    p.head.rotation.y = reduce ? 0 : 0.35 * Math.sin(t * 0.35 + phase) * (Math.sin(t * 0.13 + phase) > 0.6 ? 1 : 0);
  } else if (pose === "raise") {
    p.armR.rotation.x = Math.PI - 0.15 + 0.15 * Math.sin(t * 6 + phase);
    p.armR.rotation.z = -0.1;
  } else if (pose === "worry") {
    p.armL.rotation.x = p.armR.rotation.x = 0.4;
    p.head.rotation.y = reduce ? 0 : 0.45 * Math.sin(t * 7 + phase);
  } else if (pose === "walk") {
    const s = Math.sin(t * 9 + phase) * 0.6;
    p.legL.rotation.x = s; p.legR.rotation.x = -s; p.armL.rotation.x = -s * 0.8; p.armR.rotation.x = s * 0.8;
    p.body.position.y = Math.abs(Math.sin(t * 9 + phase)) * 0.05;
  }
}

function desk() {
  const g = new THREE.Group();
  const top = box(1.5, 0.07, 0.85, "#C9A27A"); top.position.y = 0.76; g.add(top);
  for (const [x, z] of [[-0.68, -0.36], [0.68, -0.36], [-0.68, 0.36], [0.68, 0.36]]) { const l = box(0.06, 0.74, 0.06, "#8C6B4F"); l.position.set(x, 0.37, z); g.add(l); }
  const stand = box(0.08, 0.22, 0.08, "#2C333A"); stand.position.set(0, 0.9, -0.22); g.add(stand);
  const frame = box(0.82, 0.52, 0.05, "#1D2125"); frame.position.set(0, 1.25, -0.24); g.add(frame);
  const scr = textCanvas(256, 160, (gg, w, h) => { gg.fillStyle = "#0B1220"; gg.fillRect(0, 0, w, h); });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.46), new THREE.MeshBasicMaterial({ map: scr.t }));
  screen.position.set(0, 1.25, -0.213); g.add(screen);
  const kb = box(0.55, 0.03, 0.18, "#DCDFE4"); kb.position.set(0, 0.81, 0.08); g.add(kb);
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.12, 12), mat("#FFFFFF")); mug.position.set(0.55, 0.86, 0.1); mug.castShadow = true; g.add(mug);
  const seat = box(0.6, 0.08, 0.55, "#44546F"); seat.position.set(0, 0.44, 0.78); g.add(seat);
  const backrest = box(0.6, 0.6, 0.07, "#44546F"); backrest.position.set(0, 0.78, 1.06); g.add(backrest);
  const post = box(0.07, 0.4, 0.07, "#2C333A"); post.position.set(0, 0.2, 0.78); g.add(post);
  g.userData = { scr, screen };
  return g;
}

function plant(x, z, s = 1) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * s, 0.22 * s, 0.4 * s, 10), mat("#B5651D")); pot.position.y = 0.2 * s;
  const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 * s, 0), mat("#5B9E4D", { flatShading: true })); leaf.position.y = 0.75 * s;
  const leaf2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35 * s, 0), mat("#6FB45C", { flatShading: true })); leaf2.position.set(0.15 * s, 1.1 * s, 0.05);
  for (const m of [pot, leaf, leaf2]) { m.castShadow = true; g.add(m); }
  g.position.set(x, 0, z); return g;
}

function build(data) {
  const W = R.world;
  W.clear(); R.agents.clear(); R.deskPos.clear(); R.papers = []; R.walkers = []; R.puffs = [];
  // 구역 배치: 그룹마다 책상 3열
  const groups = data.groups.filter((g) => data.agents.some((a) => a.group === g.id));
  const zones = []; let x = 0, z = 0, rowH = 0; const MAXW = 30;
  for (const g of groups) {
    const n = data.agents.filter((a) => a.group === g.id).length;
    const cols = Math.min(3, n), rows = Math.ceil(n / 3);
    const w = cols * 2.4 + 1.4, d = rows * 2.6 + 1.8;
    if (x + w > MAXW && x > 0) { x = 0; z += rowH + 1.2; rowH = 0; }
    zones.push({ g, x, z, w, d, cols }); x += w + 1.2; rowH = Math.max(rowH, d);
  }
  const totalW = Math.max(...zones.map((q) => q.x + q.w), 10), totalD = z + rowH;
  const ox = -totalW / 2, oz = -totalD / 2 - 2;
  const floorW = totalW + 12, floorD = totalD + 16;
  // 바닥·벽·창문
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(floorW, floorD), mat("#E9E4DA"));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, oz + totalD / 2 + 4); floor.receiveShadow = true; W.add(floor);
  const grid = new THREE.GridHelper(Math.max(floorW, floorD), Math.round(Math.max(floorW, floorD) / 2), 0xd6d0c4, 0xd6d0c4);
  grid.position.copy(floor.position); grid.position.y = 0.005; W.add(grid);
  const backZ = oz - 2.5;
  const wall = box(floorW, 5, 0.3, "#F4F1EA"); wall.position.set(0, 2.5, backZ); W.add(wall);
  const sideL = box(0.3, 5, floorD, "#F4F1EA"); sideL.position.set(-floorW / 2, 2.5, floor.position.z); W.add(sideL);
  R.windows = [];
  for (let i = 0; i < 4; i++) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2), new THREE.MeshStandardMaterial({ color: "#BFE3FF", emissive: "#000000" }));
    win.position.set(-floorW / 2 + 0.17, 2.7, oz + 1 + i * (floorD / 4.2)); win.rotation.y = Math.PI / 2; W.add(win); R.windows.push(win);
  }
  // 벽 화면(오늘 처리율)과 시계
  R.kpi = textCanvas(1024, 400, () => {});
  const kpiM = new THREE.Mesh(new THREE.PlaneGeometry(8, 3.1), new THREE.MeshBasicMaterial({ map: R.kpi.t }));
  kpiM.position.set(0, 2.8, backZ + 0.17); W.add(kpiM);
  const kpiFrame = box(8.3, 3.4, 0.08, "#1D2125"); kpiFrame.position.set(0, 2.8, backZ + 0.12); W.add(kpiFrame);
  R.clock = textCanvas(256, 256, () => {});
  const clockM = new THREE.Mesh(new THREE.CircleGeometry(0.75, 40), new THREE.MeshBasicMaterial({ map: R.clock.t }));
  clockM.position.set(6.2, 3.4, backZ + 0.17); W.add(clockM);
  // 구역
  zones.forEach((q, zi) => {
    const zx = ox + q.x, zz = oz + q.z;
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(q.w, q.d), mat(ZONE_COLORS[zi % ZONE_COLORS.length]));
    rug.rotation.x = -Math.PI / 2; rug.position.set(zx + q.w / 2, 0.01, zz + q.d / 2); rug.receiveShadow = true; W.add(rug);
    const sign = label(q.g.title.replace(" 그룹", ""), `에이전트 ${data.agents.filter((a) => a.group === q.g.id).length}`, "#0C66E4");
    sign.position.set(zx + q.w / 2, 3.1, zz + 0.2); sign.scale.set(3.6, 0.9, 1); W.add(sign);
    W.add(plant(zx + 0.35, zz + 0.35, 0.8));
    const list = data.agents.filter((a) => a.group === q.g.id);
    list.forEach((a, i) => {
      const cx = zx + 0.7 + 1.2 + (i % 3) * 2.4, cz = zz + 1.2 + Math.floor(i / 3) * 2.6;
      const dk = desk(); dk.position.set(cx, 0, cz); W.add(dk);
      const ch = character(a.name); ch.position.set(cx, 0, cz + 0.78); W.add(ch);
      const tag = label(a.title, STATE_KO[a.st], STATE_COLOR[a.st]); tag.position.set(cx, 2.35, cz + 0.6); W.add(tag);
      const bubble = label("!", "", "#E2B203"); bubble.scale.set(0.9, 0.45, 1); bubble.visible = false; W.add(bubble);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), new THREE.MeshStandardMaterial({ color: "#E34935", emissive: "#E34935", emissiveIntensity: 0 }));
      beacon.position.set(cx - 0.6, 0.9, cz - 0.25); beacon.visible = false; W.add(beacon);
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.2, 40), new THREE.MeshBasicMaterial({ color: "#0C66E4", transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(cx, 0.02, cz + 0.4); ring.visible = false; W.add(ring);
      for (const o of [dk, ch]) o.traverse((m) => { if (m.isMesh) m.userData.agent = a.name; });
      const home = new THREE.Vector3(cx, 0, cz + 0.78);
      R.agents.set(a.name, { a, desk: dk, ch, tag, bubble, beacon, ring, home, phase: Math.random() * 6, st: null, scrollY: 0, nextScr: 0, nextCoffee: performance.now() / 1000 + 20 + Math.random() * 60 });
      R.deskPos.set(a.name, new THREE.Vector3(cx, 1.0, cz));
    });
  });
  // 「나」(승인 담당) 책상 — 앞쪽 가운데
  const meZ = oz + totalD + 3.2;
  const md = desk(); md.position.set(0, 0, meZ); md.rotation.y = Math.PI; W.add(md);
  R.me = character("나", true); R.me.position.set(0, 0, meZ - 0.78); R.me.rotation.y = Math.PI; W.add(R.me);
  const meTag = label("나 (승인)", "승인함", "#5E4DB2"); meTag.position.set(0, 2.35, meZ - 0.5); W.add(meTag); R.meTag = meTag;
  md.traverse((m) => { if (m.isMesh) m.userData.me = true; });
  R.me.traverse((m) => { if (m.isMesh) m.userData.me = true; });
  R.mePos = new THREE.Vector3(0.4, 0.9, meZ); R.meStand = new THREE.Vector3(0.9, 0, meZ + 1.0);
  R.pile = new THREE.Group(); R.pile.position.set(0.45, 0.8, meZ + 0.05); W.add(R.pile);
  // 완료 선반·파쇄함·커피 머신
  const shelf = box(1.8, 1.6, 0.5, "#A6825E"); shelf.position.set(floorW / 2 - 2.5, 0.8, meZ); W.add(shelf);
  const shelfTag = label("완료", "승인된 것", "#22A06B"); shelfTag.position.set(floorW / 2 - 2.5, 2.2, meZ); W.add(shelfTag);
  R.shelfPos = new THREE.Vector3(floorW / 2 - 2.5, 1.7, meZ); R.done = 0;
  const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.6, 14), mat("#626F86")); bin.position.set(-3, 0.3, meZ + 0.4); bin.castShadow = true; W.add(bin);
  R.trashPos = new THREE.Vector3(-3, 0.7, meZ + 0.4);
  const coffee = box(0.7, 1.3, 0.6, "#2C333A"); coffee.position.set(-floorW / 2 + 1.4, 0.65, meZ); W.add(coffee);
  const cTag = label("커피", "", "#8C6B4F"); cTag.scale.set(1.4, 0.35, 1); cTag.position.set(-floorW / 2 + 1.4, 1.75, meZ); W.add(cTag);
  R.coffeePos = new THREE.Vector3(-floorW / 2 + 2.3, 0, meZ);
  W.add(plant(floorW / 2 - 1, oz - 1.2, 1.3), plant(-floorW / 2 + 1, oz - 1.2, 1.3), plant(floorW / 2 - 1, meZ + 2, 1.1));
  // 카메라 기본 위치
  R.home = { dist: Math.max(18, Math.max(totalW, totalD + 6) * 0.95), target: new THREE.Vector3(0, 0, oz + (totalD + 3.2) / 2) };
  if (!R.orbit.inited) { R.orbit.dist = R.home.dist; R.orbit.target.copy(R.home.target); R.orbit.inited = true; }
  sunUpdate();
  highlight();
}

// ---------- 상태 ----------
function setState(a) {
  const o = R.agents.get(a.name); if (!o) return;
  o.a = a;
  if (o.st !== a.st || o.topic !== (a.topic || "")) {
    o.st = a.st; o.topic = a.topic || "";
    const old = o.tag; const tag = label(a.title, a.st === "working" && a.topic ? "▶ " + a.topic : STATE_KO[a.st] + (a.today ? ` · 오늘 ${a.today}` : ""), STATE_COLOR[a.st]);
    tag.position.copy(old.position); R.world.remove(old); R.world.add(tag); o.tag = tag;
    o.bubble.visible = a.st === "waiting";
    o.beacon.visible = a.st === "blocked";
    const ghost = a.st === "planned";
    o.ch.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.transparent = ghost; m.material.opacity = ghost ? 0.28 : 1; } });
    drawScreen(o, true);
  }
}

function drawScreen(o, force) {
  const { g, c } = o.desk.userData.scr, t = o.desk.userData.scr.t;
  const st = o.st, w = c.width, h = c.height;
  if (st === "working") {
    g.fillStyle = "#0B1220"; g.fillRect(0, 0, w, h);
    o.scrollY = (o.scrollY + 1) % 12;
    for (let i = 0; i < 12; i++) {
      const y = 10 + i * 13 - o.scrollY;
      const len = 30 + ((i * 37 + o.scrollY * 11 + o.phase * 50) % 170);
      g.fillStyle = ["#4BCE97", "#579DFF", "#F5CD47", "#9F8FEF"][(i + Math.floor(o.phase)) % 4];
      g.fillRect(12 + (i % 3) * 14, y, len, 6);
    }
  } else if (force) {
    const bg = { waiting: "#3D3304", blocked: "#5D1F1A", error: "#5D1F1A", idle: "#101826", planned: "#1D2125" }[st] || "#101826";
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = "#fff"; g.font = `700 30px ${FONT()}`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText({ waiting: "승인 기다림", blocked: "차단됨", error: "오류", idle: "", planned: "예정" }[st] || "", w / 2, h / 2);
    if (st === "idle") { g.fillStyle = "#579DFF"; g.beginPath(); g.arc(w / 2, h / 2, 10, 0, 7); g.fill(); }
    g.textAlign = "start";
  } else return;
  t.needsUpdate = true;
}

function highlight() {
  for (const [n, o] of R.agents) o.ring.visible = n === R.sel;
}

function setPile(n) {
  if (!R.pile) return;
  n = Math.min(15, n || 0);
  if (R.pile.children.length === n) return;
  R.pile.clear();
  for (let i = 0; i < n; i++) { const p = box(0.42, 0.025, 0.3, i % 2 ? "#FFFFFF" : "#F7F8F9"); p.position.set((Math.random() - 0.5) * 0.04, i * 0.03, (Math.random() - 0.5) * 0.04); p.rotation.y = (Math.random() - 0.5) * 0.2; R.pile.add(p); }
  if (R.meTag) { const old = R.meTag; const tag = label("나 (승인)", n ? `승인 기다림 ${n}건` : "승인함 비었음", n ? "#E2B203" : "#5E4DB2"); tag.position.copy(old.position); R.world.remove(old); R.world.add(tag); R.meTag = tag; }
}

function drawKpi(k) {
  if (!R.kpi || !k) return;
  const { g, c, t } = R.kpi, w = c.width, h = c.height;
  g.fillStyle = "#0E1426"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#4BCE97"; g.font = `800 120px ${FONT()}`; g.textBaseline = "top"; g.fillText(`${k.pct.toFixed(1)}%`, 40, 30);
  g.fillStyle = "rgba(255,255,255,.75)"; g.font = `500 34px ${FONT()}`; g.fillText(`오늘 ${k.finished} / ${k.total}건 끝남`, 44, 160);
  g.fillStyle = "#22313F"; roundRect(g, 40, 215, w - 80, 26, 13); g.fill();
  g.fillStyle = "#4BCE97"; roundRect(g, 40, 215, Math.max(26, (w - 80) * k.pct / 100), 26, 13); g.fill();
  const items = [["작업 중", k.working, "#4BCE97"], ["승인 기다림", k.waiting, "#F5CD47"], ["차단", k.blocked, "#F87168"], ["오늘 비용", k.cost, "#fff"]];
  items.forEach(([l, v, col], i) => { const x = 44 + i * 240; g.fillStyle = col; g.font = `700 54px ${FONT()}`; g.fillText(String(v), x, 268); g.fillStyle = "rgba(255,255,255,.65)"; g.font = `500 26px ${FONT()}`; g.fillText(l, x, 334); });
  t.needsUpdate = true;
}

function drawClock() {
  if (!R.clock) return;
  const { g, c, t } = R.clock, s = c.width, r = s / 2, d = new Date();
  g.clearRect(0, 0, s, s);
  g.fillStyle = "#FFFFFF"; g.beginPath(); g.arc(r, r, r - 4, 0, 7); g.fill(); g.lineWidth = 8; g.strokeStyle = "#172B4D"; g.stroke();
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.fillStyle = "#172B4D"; g.fillRect(r + Math.sin(a) * (r - 26) - 3, r - Math.cos(a) * (r - 26) - 3, 6, 6); }
  const hand = (a, len, wd, col) => { g.strokeStyle = col; g.lineWidth = wd; g.lineCap = "round"; g.beginPath(); g.moveTo(r, r); g.lineTo(r + Math.sin(a) * len, r - Math.cos(a) * len); g.stroke(); };
  hand(((d.getHours() % 12) + d.getMinutes() / 60) / 12 * Math.PI * 2, r * 0.5, 10, "#172B4D");
  hand((d.getMinutes() + d.getSeconds() / 60) / 60 * Math.PI * 2, r * 0.72, 7, "#172B4D");
  hand(d.getSeconds() / 60 * Math.PI * 2, r * 0.8, 3, "#E34935");
  t.needsUpdate = true;
}

function sunUpdate() {
  const hr = new Date().getHours(), night = hr < 7 || hr >= 19;
  R.scene.background = new THREE.Color(night ? "#0E1426" : "#DDE7F2");
  R.hemi.intensity = night ? 0.55 : 1.1;
  R.sun.intensity = night ? 0.35 : 1.6;
  R.sun.position.set(night ? -10 : 18, 30, 20);
  for (const w of R.windows || []) { w.material.color.set(night ? "#1B2A4A" : "#BFE3FF"); w.material.emissive.set(night ? "#3B4A7A" : "#000000"); }
}

// ---------- 움직임 ----------
function flyPaper(from, to, color) {
  if (reduce) return;
  const m = box(0.36, 0.02, 0.26, color); m.position.copy(from); R.world.add(m);
  R.papers.push({ m, from: from.clone(), to: to.clone(), t: 0 });
}
function walkToMe(name) {
  const o = R.agents.get(name); if (!o || reduce || o.walk) return;
  o.walk = { path: [o.home.clone(), R.meStand.clone(), o.home.clone()], i: 0, t: 0, pause: 1.2, paper: true };
}
function walkCoffee(o) {
  if (!R.coffeePos || o.walk) return;
  o.walk = { path: [o.home.clone(), R.coffeePos.clone().add(new THREE.Vector3(0, 0, (Math.random() - 0.5) * 1.5)), o.home.clone()], i: 0, t: 0, pause: 2.5, coffee: true };
}
function stepWalk(o, dt, t) {
  const w = o.walk, a = w.path[w.i], b = w.path[w.i + 1];
  if (!b) { o.walk = null; o.ch.position.copy(o.home); o.ch.rotation.y = 0; return false; }
  const dist = a.distanceTo(b), speed = 2.2;
  if (w.wait > 0) { w.wait -= dt; setPose(o.ch, w.paper && w.i === 1 ? "raise" : "sit", t, o.phase); o.ch.userData.parts.legL.rotation.x = o.ch.userData.parts.legR.rotation.x = 0; o.ch.userData.parts.body.position.y = 0; return true; }
  w.t += dt * speed / Math.max(0.01, dist);
  const p = a.clone().lerp(b, Math.min(1, w.t));
  o.ch.position.copy(p);
  o.ch.rotation.y = Math.atan2(-(b.x - a.x), -(b.z - a.z));
  setPose(o.ch, "walk", t, o.phase);
  if (w.t >= 1) {
    w.i++; w.t = 0;
    if (w.i === 1) { w.wait = w.pause; if (w.paper) flyPaper(o.ch.position.clone().setY(1.0), R.mePos, 0xffffff); }
  }
  return true;
}

function loop(now) {
  if (!R) return;
  if (!R.container.isConnected) { dispose(); return; }
  R.raf = requestAnimationFrame(loop);
  if (document.hidden) return;
  const dt = Math.min(0.05, (now - R.last) / 1000); R.last = now;
  const t = now / 1000;
  // 카메라
  const ob = R.orbit;
  if (ob.goal) { ob.target.lerp(ob.goal, 0.08); if (ob.target.distanceTo(ob.goal) < 0.05) ob.goal = null; }
  if (!ob.dragging && !reduce && !R.sel) ob.theta += dt * 0.012;
  R.camera.position.set(ob.target.x + ob.dist * Math.sin(ob.phi) * Math.sin(ob.theta), ob.target.y + ob.dist * Math.cos(ob.phi), ob.target.z + ob.dist * Math.sin(ob.phi) * Math.cos(ob.theta));
  R.camera.lookAt(ob.target);
  // 에이전트
  for (const o of R.agents.values()) {
    if (o.walk && stepWalk(o, dt, t)) continue;
    const st = o.st;
    if (st === "working") setPose(o.ch, "type", t, o.phase);
    else if (st === "waiting") setPose(o.ch, "raise", t, o.phase);
    else if (st === "blocked" || st === "error") setPose(o.ch, "worry", t, o.phase);
    else setPose(o.ch, "sit", t, o.phase);
    if (st === "working" && t > o.nextScr) { drawScreen(o); o.nextScr = t + 0.12; }
    if (o.bubble.visible) { o.bubble.position.set(o.home.x, 2.95 + 0.12 * Math.sin(t * 4 + o.phase), o.home.z - 0.1); }
    if (o.beacon.visible) o.beacon.material.emissiveIntensity = 0.5 + 2.5 * Math.max(0, Math.sin(t * 8));
    if (st === "error" && !reduce && Math.random() < dt * 2) puff(o.home.x, 1.6, o.home.z - 0.9);
    if (st === "idle" && !reduce && t > o.nextCoffee) { o.nextCoffee = t + 60 + Math.random() * 90; if (![...R.agents.values()].some((x) => x.walk && x.walk.coffee)) walkCoffee(o); }
    o.ring.material.opacity = 0.55 + 0.35 * Math.sin(t * 3);
  }
  if (R.me) setPose(R.me, R.pile && R.pile.children.length ? "type" : "sit", t, 0.5);
  // 서류
  R.papers = R.papers.filter((p) => {
    p.t += dt / 1.3;
    const k = Math.min(1, p.t), pos = p.from.clone().lerp(p.to, k); pos.y += Math.sin(Math.PI * k) * 2.2;
    p.m.position.copy(pos); p.m.rotation.y += dt * 6; p.m.rotation.x = Math.sin(k * Math.PI) * 0.6;
    if (k >= 1) { R.world.remove(p.m); return false; }
    return true;
  });
  // 연기
  R.puffs = R.puffs.filter((p) => { p.life -= dt; p.m.position.y += dt * 0.6; p.m.scale.multiplyScalar(1 + dt * 0.8); p.m.material.opacity = Math.max(0, p.life / 2) * 0.5; if (p.life <= 0) { R.world.remove(p.m); return false; } return true; });
  if (!R.nextClock || t > R.nextClock) { drawClock(); R.nextClock = t + 1; if (!R.nextSun || t > R.nextSun) { sunUpdate(); R.nextSun = t + 60; } }
  R.renderer.render(R.scene, R.camera);
}
function puff(x, y, z) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: "#8590A2", transparent: true, opacity: 0.5 }));
  m.position.set(x + (Math.random() - 0.5) * 0.3, y, z); R.world.add(m); R.puffs.push({ m, life: 2 });
}

// ---------- 조작: 끌어서 돌리기, 휠로 확대, 누르면 선택, 두 번 누르면 다가가기 ----------
function focusOn(v) { R.orbit.goal = new THREE.Vector3(v.x, 0, v.z + 0.5); R.orbit.dist = Math.min(R.orbit.dist, 14); }
function pick(ev) {
  const el = R.renderer.domElement, r = el.getBoundingClientRect();
  const p = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  const rc = new THREE.Raycaster(); rc.setFromCamera(p, R.camera);
  for (const hit of rc.intersectObjects(R.world.children, true)) {
    if (hit.object.userData.agent) return { agent: hit.object.userData.agent };
    if (hit.object.userData.me) return { me: true };
  }
  return null;
}
function bindControls() {
  const el = R.renderer.domElement, ob = R.orbit;
  let down = null, moved = false;
  el.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, th: ob.theta, ph: ob.phi }; moved = false; ob.dragging = true; el.setPointerCapture(e.pointerId); });
  el.addEventListener("pointermove", (e) => {
    if (down) {
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      ob.theta = down.th - dx * 0.006; ob.phi = Math.max(0.35, Math.min(1.35, down.ph - dy * 0.005));
    } else {
      const h = pick(e); el.style.cursor = h ? "pointer" : "grab";
      el.title = h && h.agent ? (() => { const o = R.agents.get(h.agent); return `${o.a.title} · ${STATE_KO[o.st]}${o.a.today ? ` · 오늘 ${o.a.today}건` : ""}`; })() : h && h.me ? "나 — 누르면 승인함" : "";
    }
  });
  el.addEventListener("pointerup", (e) => {
    ob.dragging = false; const was = down; down = null;
    if (!was || moved) return;
    const h = pick(e);
    if (h && h.agent) { R.sel = R.sel === h.agent ? null : h.agent; highlight(); R.cb.onSelect && R.cb.onSelect(R.sel); }
    else if (h && h.me) { R.cb.onMe && R.cb.onMe(); }
  });
  el.addEventListener("dblclick", (e) => { const h = pick(e); if (h && h.agent) focusOn(R.deskPos.get(h.agent)); else resetView(); });
  el.addEventListener("wheel", (e) => { e.preventDefault(); ob.dist = Math.max(8, Math.min(90, ob.dist * (1 + Math.sign(e.deltaY) * 0.1))); }, { passive: false });
  el.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") ob.theta -= 0.1; if (e.key === "ArrowRight") ob.theta += 0.1;
    if (e.key === "+" || e.key === "=") ob.dist = Math.max(8, ob.dist * 0.9); if (e.key === "-") ob.dist = Math.min(90, ob.dist * 1.1);
    if (e.key === "0") resetView();
  });
}
