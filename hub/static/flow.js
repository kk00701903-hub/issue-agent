/* 워크플로우 편집기 v2. 외부 라이브러리 없음.
   - 「AI로 만들기」: 설명을 적으면 AI가 노드·선을 만든다(키가 없으면 규칙 기반). 결과는 확인 후 저장
   - 상자 끌기, ● → ○ 연결, Delete 삭제, 오른쪽 패널에서 수정
   - 선 위로 작업 흐름이 움직이고, 실행 중인 에이전트는 빛나며, 「흐름 재생」으로 한 건이 지나가는 모습을 본다 */
(function () {
  const KIND = {
    agent:   { label: "에이전트",  icon: "✦" },
    code:    { label: "코드 검사", icon: "{}" },
    browser: { label: "크롬 통제", icon: "◎" },
    human:   { label: "사람",      icon: "✋" },
    note:    { label: "메모",      icon: "✎" },
  };
  const NODE_W = 196, NODE_H = 72, GAP_X = 270, GAP_Y = 140;
  const LIVE = ["queued", "running", "validating"];
  let group = null, flow = null, dirty = false, sel = null, selEdge = null, drag = null, link = null, els = {}, scale = null;
  let aiOpen = false, aiInfo = null, playing = null;

  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else if (v != null && v !== false) e.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return e;
  }
  const svgEl = (tag, attrs) => { const e = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); return e; };
  const uid = () => "n" + Math.random().toString(36).slice(2, 7);

  function mount(root, state, onSaved) {
    root.replaceChildren();
    const groups = state.groups;
    if (!group) group = groups[0].id;
    const g = groups.find((x) => x.id === group) || groups[0];
    if (!flow || flow._group !== g.id) { flow = JSON.parse(JSON.stringify(g.flow_graph)); flow._group = g.id; dirty = false; sel = selEdge = null; aiInfo = null; }
    const agentMap = Object.fromEntries(groups.flatMap((x) => x.agents).map((a) => [a.name, a]));

    // 지금 실제로 움직이는 것: 에이전트별 진행 중 건수, 승인 대기 건수
    const liveCount = {}, waiting = state.runs.filter((r) => r.status === "awaiting_approval" && g.agents.some((a) => a.name === r.agent)).length;
    state.runs.forEach((r) => { if (LIVE.includes(r.status)) liveCount[r.agent] = (liveCount[r.agent] || 0) + 1; });
    if (state.runs.some((r) => r.status === "validating")) liveCount["reels-validator"] = (liveCount["reels-validator"] || 0) + 1;

    // --- 상단: 그룹 칩 + 도구 ---
    const chips = el("div", { class: "fl-chips" });
    for (const x of groups) chips.append(el("button", { class: "fl-chip" + (x.id === group ? " on" : ""), onclick: () => { if (dirty && !confirm("저장하지 않은 변경이 있습니다. 버릴까요?")) return; group = x.id; flow = null; stopPlay(); mount(root, state, onSaved); } }, x.title.replace(" 그룹", "")));
    const status = el("span", { class: "small fl-status" });
    const tools = el("div", { class: "fl-tools" },
      el("button", { class: "fl-btn ai", onclick: () => { aiOpen = !aiOpen; mount(root, state, onSaved); } }, "✨ AI로 만들기"),
      el("button", { class: "fl-btn", onclick: () => (playing ? stopPlay() : play()) }, "▶ 흐름 재생"),
      el("span", { class: "fl-sep" }),
      el("button", { class: "fl-btn icon", title: "축소", onclick: () => zoom(scale / 1.15) }, "−"),
      el("button", { class: "fl-btn icon", title: "확대", onclick: () => zoom(scale * 1.15) }, "+"),
      el("button", { class: "fl-btn", onclick: () => { scale = null; render(); } }, "맞춤"),
      el("button", { class: "fl-btn", onclick: autoLayout }, "정렬"),
      el("span", { class: "fl-sep" }),
      el("button", { class: "fl-btn", onclick: () => { flow = null; stopPlay(); mount(root, state, onSaved); } }, "되돌리기"),
      el("button", { class: "fl-btn primary", onclick: save }, "저장"), status);
    root.append(el("div", { class: "fl-top" }, chips, tools));

    // --- AI 패널 ---
    if (aiOpen) {
      const ta = el("textarea", { class: "fl-ai-input", rows: 3, placeholder: aiPlaceholder(g.id) });
      const msg = el("div", { class: "small" });
      const go = el("button", { class: "fl-btn ai", onclick: async () => {
        go.disabled = true; go.textContent = "만드는 중…"; msg.textContent = "";
        let r, d;
        try { r = await fetch(`/api/flows/${group}/generate`, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub": "1" }, body: JSON.stringify({ prompt: ta.value }) }); d = await r.json(); }
        catch (err) { r = { ok: false }; d = { error: "서버 오류 — 로그를 확인하세요" }; }
        go.disabled = false; go.textContent = "흐름 만들기";
        if (!r.ok) { msg.textContent = d.error || "실패"; return; }
        flow = Object.assign(d.flow, { _group: group }); aiInfo = d.info; dirty = true; sel = selEdge = null; scale = null; aiOpen = false;
        mount(root, state, onSaved); play();
      } }, "흐름 만들기");
      root.append(el("div", { class: "fl-ai" },
        el("div", { class: "fl-ai-head" }, el("b", {}, "어떤 흐름을 원하세요?"), el("span", { class: "small" }, "에이전트 목록과 안전 규칙(마지막 버튼은 사람)을 지켜서 AI가 노드를 만듭니다. 만든 뒤 고치고 저장하세요.")),
        ta, el("div", { class: "row", style: "margin-top:8px" }, go, msg)));
    }
    if (aiInfo) root.append(el("div", { class: "fl-note" + (aiInfo.source === "local" ? " warn" : "") },
      aiInfo.source === "ai" ? `AI(${aiInfo.model})가 만든 흐름입니다. 확인하고 「저장」을 누르세요.` : `API 키가 없어 규칙 기반으로 만들었습니다(.env 에 ANTHROPIC_API_KEY 를 넣으면 AI가 만듭니다). 확인하고 「저장」을 누르세요.`));

    // --- 본문 ---
    const palette = el("div", { class: "fl-side" });
    palette.append(el("div", { class: "fl-side-h" }, "노드 추가"));
    const addBtn = (label, who, kind) => el("button", { class: "fl-pal k-" + kind, onclick: () => addNode(label, who, kind) },
      el("span", { class: "fl-ic" }, KIND[kind].icon), el("span", {}, el("b", {}, label), el("small", {}, who)));
    palette.append(el("div", { class: "fl-side-s" }, "이 그룹"));
    for (const a of g.agents) palette.append(addBtn(a.title, a.name, kindOf(a)));
    const shared = groups.find((x) => x.id === "shared");
    if (shared && g.id !== "shared") { palette.append(el("div", { class: "fl-side-s" }, "공통")); for (const a of shared.agents) palette.append(addBtn(a.title, a.name, kindOf(a))); }
    palette.append(el("div", { class: "fl-side-s" }, "기타"));
    palette.append(addBtn("사람이 하는 단계", "사람", "human"), addBtn("코드 검사", "스크립트", "code"), addBtn("메모", "", "note"));

    const wrap = el("div", { class: "fl-canvas-wrap" });
    const sizer = el("div", { style: "position:relative" });
    const canvas = el("div", { class: "fl-canvas" });
    const svg = svgEl("svg", { class: "fl-edges" });
    const defs = svgEl("defs");
    const mk = (id, cls) => { const m = svgEl("marker", { id, viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" }); m.append(svgEl("path", { d: "M0,0 L10,5 L0,10 z", class: cls })); return m; };
    defs.append(mk("fl-arrow", "fl-arrow"), mk("fl-arrow-hot", "fl-arrow hot"));
    svg.append(defs);
    canvas.append(svg); sizer.append(canvas); wrap.append(sizer);
    const props = el("div", { class: "fl-side props" });
    root.append(el("div", { class: "fl-body" }, palette, wrap, props));
    root.append(el("div", { class: "small", style: "margin-top:8px" }, "상자를 끌어 옮기고, 오른쪽 ● 를 끌어 다른 상자 왼쪽 ○ 에 놓으면 연결됩니다. 선이나 상자를 누르고 Delete 키로 지웁니다."));
    els = { canvas, svg, props, status, wrap, sizer, agentMap, liveCount, waiting };
    if (dirty) status.textContent = "저장 안 됨";
    canvas.addEventListener("mousedown", (e) => { if (e.target === canvas || e.target === svg) { sel = selEdge = null; render(); } });
    document.onkeydown = (e) => { if (e.key === "Delete" && (sel || selEdge) && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) removeSelected(); };
    window.onmousemove = onMove; window.onmouseup = onUp;
    render();

    // ---------- 동작 ----------
    function kindOf(a) { return a.name === "browser-operator" || /browser-operator/.test(a.tools) ? "browser" : /Python/.test(a.tools) ? "code" : "agent"; }
    function aiPlaceholder(id) {
      return ({ reels: "예) 오늘 뜬 전세 뉴스로 주제를 고르고, 잘 된 쇼츠 자막을 참고해 패키지를 만든 뒤 규칙 검수 → 내가 승인 → 영상 제작 → 예약 화면까지 채워 줘",
        goods: "예) 백구 새 세트 대사 목록을 만들고, Firefly 그림을 검수해서 LINE·OGQ 규격에 맞춘 뒤 업로드 화면까지",
        novel: "예) 다음 회차를 설계해서 쓰고, AI 티 검수 후 Argon 퇴고, 문피아 업로드 준비까지",
        game: "예) 컷씬 대본을 쓰고 Kling 프롬프트로 그림을 만든 뒤 불량 검수, 게임에 넣고 빌드",
        work: "예) 주유소 관리 화면 요구사항을 정리하고 구현, 코드 리뷰 후 내가 커밋" })[id] || "만들고 싶은 흐름을 한두 문장으로 적어 주세요";
    }
    function zoom(s) { scale = Math.max(0.5, Math.min(1.5, s)); render(); }
    function autoLayout() { topo().forEach((n, i) => { n.x = 40 + (i % 3) * GAP_X; n.y = 50 + Math.floor(i / 3) * GAP_Y; }); markDirty(); scale = null; render(); }
    function topo() {
      const byId = Object.fromEntries(flow.nodes.map((n) => [n.id, n])), indeg = {}, out = {};
      flow.nodes.forEach((n) => { indeg[n.id] = 0; out[n.id] = []; });
      flow.edges.forEach((e) => { if (byId[e.from] && byId[e.to]) { indeg[e.to]++; out[e.from].push(e.to); } });
      const pos = (a, b) => byId[a].y - byId[b].y || byId[a].x - byId[b].x;
      let ready = Object.keys(indeg).filter((k) => !indeg[k]).sort(pos), res = [];
      while (ready.length) { const k = ready.shift(); res.push(byId[k]); out[k].forEach((t) => { if (!--indeg[t]) ready.push(t); }); ready.sort(pos); }
      return res.length === flow.nodes.length ? res : [...flow.nodes].sort((a, b) => a.y - b.y || a.x - b.x);
    }
    function addNode(label, who, kind) {
      const n = { id: uid(), label, who, kind, x: 60 + (flow.nodes.length % 5) * 30, y: 40 + Math.ceil(flow.nodes.length / 3) * 130, note: "" };
      flow.nodes.push(n); sel = n.id; selEdge = null; markDirty(); render();
    }
    function removeSelected() {
      if (sel) { flow.nodes = flow.nodes.filter((n) => n.id !== sel); flow.edges = flow.edges.filter((e) => e.from !== sel && e.to !== sel); sel = null; }
      else if (selEdge) { flow.edges = flow.edges.filter((e) => !(e.from === selEdge.from && e.to === selEdge.to)); selEdge = null; }
      markDirty(); render();
    }
    function markDirty() { dirty = true; els.status.textContent = "저장 안 됨"; }
    async function save() {
      const r = await fetch("/api/flows/" + group, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub": "1" }, body: JSON.stringify({ nodes: flow.nodes, edges: flow.edges }) });
      const d = await r.json();
      if (r.ok) { dirty = false; aiInfo = null; flow = Object.assign(d.flow, { _group: group }); onSaved && onSaved(); render(); els.status.textContent = "저장됨 " + new Date().toTimeString().slice(0, 5); }
      else els.status.textContent = d.error || "저장 실패";
    }

    // ---------- 흐름 재생: 한 건이 노드를 차례로 지나가는 모습 ----------
    function play() {
      stopPlay();
      const order = topo(); if (!order.length) return;
      let i = 0; playing = { timer: null };
      const step = () => {
        els.canvas.querySelectorAll(".fl-node").forEach((d) => d.classList.remove("playing", "played"));
        order.forEach((n, k) => { const d = els.canvas.querySelector(`[data-node="${n.id}"]`); if (d && k < i) d.classList.add("played"); });
        const cur = order[i], d = cur && els.canvas.querySelector(`[data-node="${cur.id}"]`);
        if (d) d.classList.add("playing");
        const nxt = order[i + 1];
        if (cur && nxt) shootToken(cur.id, nxt.id);
        i++;
        if (i <= order.length) playing.timer = setTimeout(step, 950);
        else playing.timer = setTimeout(stopPlay, 900);
      };
      step();
    }
    function stopPlay() {
      if (playing) clearTimeout(playing.timer);
      playing = null;
      if (els.canvas) { els.canvas.querySelectorAll(".fl-node").forEach((d) => d.classList.remove("playing", "played")); els.svg.querySelectorAll(".fl-token").forEach((t) => t.remove()); }
    }
    function shootToken(from, to) {
      const e = flow.edges.find((x) => x.from === from && x.to === to);
      const a = portPos(from, "out"), b = portPos(to, "in"); if (!a || !b) return;
      const d = e ? pathD(a, b) : `M${a.x},${a.y} L${b.x},${b.y}`;
      const c = svgEl("circle", { r: "7", class: "fl-token" });
      const anim = svgEl("animateMotion", { dur: "0.85s", path: d, fill: "freeze" });
      c.append(anim); els.svg.append(c); try { anim.beginElement(); } catch (_) {}
      setTimeout(() => c.remove(), 950);
    }

    // ---------- 그리기 ----------
    function render() {
      const c = els.canvas;
      c.querySelectorAll(".fl-node").forEach((n) => n.remove());
      let maxX = 600, maxY = 360;
      for (const n of flow.nodes) {
        maxX = Math.max(maxX, n.x + NODE_W + 50); maxY = Math.max(maxY, n.y + NODE_H + 70);
        const a = els.agentMap[n.who];
        const planned = a && a.state === "planned";
        const isNew = !a && n.kind !== "human" && n.kind !== "note" && n.who !== "사용자·Firefly" && n.who !== "스크립트";
        const live = els.liveCount[n.who] || 0;
        const wait = n.kind === "human" && isApproval(n) ? els.waiting : 0;
        const badge = live ? el("span", { class: "fl-badge live" }, `실행 중 ${live}`)
          : wait ? el("span", { class: "fl-badge wait" }, `승인 대기 ${wait}`)
          : planned ? el("span", { class: "fl-badge" }, "예정")
          : isNew ? el("span", { class: "fl-badge new" }, "새 에이전트") : null;
        const node = el("div", { class: `fl-node k-${n.kind}${sel === n.id ? " sel" : ""}${live ? " live" : ""}${wait ? " wait" : ""}${planned ? " planned" : ""}`, "data-node": n.id, style: `left:${n.x}px;top:${n.y}px;width:${NODE_W}px` },
          el("div", { class: "port in" }), el("div", { class: "port out" }),
          el("div", { class: "fl-node-h" }, el("span", { class: "fl-ic" }, KIND[n.kind].icon), el("span", { class: "fl-kind" }, KIND[n.kind].label), badge),
          el("div", { class: "fl-title" }, n.label || "(이름 없음)"),
          el("div", { class: "fl-who" }, (n.kind === "note" ? n.note : (a ? a.title + " · " : "") + (n.who || "")) || ""));
        node.addEventListener("mousedown", (e) => {
          if (e.target.classList.contains("port")) {
            if (e.target.classList.contains("out")) { link = { from: n.id, x: e.clientX, y: e.clientY }; e.preventDefault(); }
            return;
          }
          sel = n.id; selEdge = null; drag = { id: n.id, dx: e.clientX / scale - n.x, dy: e.clientY / scale - n.y, moved: false }; e.preventDefault(); render();
        });
        node.addEventListener("mouseup", () => { if (link && link.from !== n.id) { if (!flow.edges.some((x) => x.from === link.from && x.to === n.id)) { flow.edges.push({ from: link.from, to: n.id }); markDirty(); } link = null; render(); } });
        c.append(node);
      }
      if (scale == null) scale = Math.max(0.75, Math.min(1.1, (els.wrap.clientWidth - 24) / maxX));
      c.style.width = maxX + "px"; c.style.height = maxY + "px";
      c.style.transform = `scale(${scale})`; c.style.transformOrigin = "0 0";
      els.sizer.style.width = maxX * scale + "px"; els.sizer.style.height = maxY * scale + "px";
      drawEdges(); renderProps(); checkRules();
    }
    function isApproval(n) { return /승인|확인/.test(n.label) && topo().indexOf(n) === topo().findIndex((x) => x.kind === "human"); }
    function portPos(id, side) { const n = flow.nodes.find((x) => x.id === id); return n ? { x: n.x + (side === "out" ? NODE_W + 2 : -2), y: n.y + NODE_H / 2 } : null; }
    function pathD(a, b) {
      if (b.x > a.x + 20) { const dx = (b.x - a.x) / 2; return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`; }
      // 다음 줄로 넘어가는 선: 아래로 돌아서 들어간다
      const midY = a.y + (b.y - a.y) / 2 + (Math.abs(b.y - a.y) < 20 ? 60 : 0);
      return `M${a.x},${a.y} C${a.x + 50},${a.y} ${a.x + 50},${midY} ${a.x},${midY} L${b.x},${midY} C${b.x - 50},${midY} ${b.x - 50},${b.y} ${b.x},${b.y}`;
    }
    function drawEdges() {
      const s = els.svg; [...s.querySelectorAll("path.fl-e, path.fl-e-hit, path.fl-e-flow, circle.fl-dot")].forEach((x) => x.remove());
      s.setAttribute("width", els.canvas.style.width); s.setAttribute("height", els.canvas.style.height);
      for (const e of flow.edges) {
        const a = portPos(e.from, "out"), b = portPos(e.to, "in"); if (!a || !b) continue;
        const d = pathD(a, b);
        const from = flow.nodes.find((n) => n.id === e.from), to = flow.nodes.find((n) => n.id === e.to);
        const hot = (els.liveCount[from.who] || 0) > 0 || (els.liveCount[to.who] || 0) > 0;
        const isSel = selEdge && selEdge.from === e.from && selEdge.to === e.to;
        s.append(svgEl("path", { d, class: "fl-e" + (isSel ? " sel" : "") + (hot ? " hot" : ""), "marker-end": hot ? "url(#fl-arrow-hot)" : "url(#fl-arrow)" }));
        s.append(svgEl("path", { d, class: "fl-e-flow" + (hot ? " hot" : "") }));
        // 선 위를 지나가는 작은 점(작업이 흐르는 모습)
        const dot = svgEl("circle", { r: hot ? "4.5" : "3", class: "fl-dot" + (hot ? " hot" : "") });
        dot.append(svgEl("animateMotion", { dur: hot ? "1.4s" : "3.2s", repeatCount: "indefinite", path: d }));
        s.append(dot);
        const hit = svgEl("path", { d, class: "fl-e-hit" });
        hit.addEventListener("mousedown", (ev) => { selEdge = e; sel = null; ev.stopPropagation(); render(); });
        s.append(hit);
      }
      [...s.querySelectorAll("path.fl-temp")].forEach((x) => x.remove());
      if (link) { const a = portPos(link.from, "out"); const r = els.canvas.getBoundingClientRect(); s.append(svgEl("path", { d: pathD(a, { x: (link.x - r.left) / scale, y: (link.y - r.top) / scale }), class: "fl-temp" })); }
    }
    function onMove(e) {
      if (drag) { const n = flow.nodes.find((x) => x.id === drag.id); n.x = Math.max(0, Math.round(e.clientX / scale - drag.dx)); n.y = Math.max(0, Math.round(e.clientY / scale - drag.dy)); drag.moved = true; const d = els.canvas.querySelector(`[data-node="${n.id}"]`); if (d) { d.style.left = n.x + "px"; d.style.top = n.y + "px"; } drawEdges(); }
      else if (link) { link.x = e.clientX; link.y = e.clientY; drawEdges(); }
    }
    function onUp() { if (drag) { const moved = drag.moved; drag = null; if (moved) { markDirty(); render(); } } if (link) { link = null; drawEdges(); } }

    function renderProps() {
      const p = els.props; p.replaceChildren();
      const n = flow.nodes.find((x) => x.id === sel);
      p.append(el("div", { class: "fl-side-h" }, "속성"));
      if (!n) {
        p.append(el("div", { class: "small" }, selEdge ? "선이 선택됨 — Delete 키로 삭제" : "상자를 누르면 여기서 고칩니다."));
        const legend = el("div", { class: "fl-legend" });
        for (const [k, v] of Object.entries(KIND)) legend.append(el("div", { class: "fl-leg k-" + k }, el("span", { class: "fl-ic" }, v.icon), v.label));
        legend.append(el("div", { class: "small", style: "margin-top:6px" }, "빛나는 상자: 지금 실행 중 · 점선 상자: 예정(아직 연결 안 됨)"));
        p.append(legend);
        return;
      }
      const field = (label, key, multi) => {
        const input = multi ? el("textarea", { rows: 3 }) : el("input", { type: "text" });
        input.value = n[key] || ""; input.addEventListener("input", () => { n[key] = input.value; markDirty(); const d = els.canvas.querySelector(`[data-node="${n.id}"]`); if (d) { d.querySelector(".fl-title").textContent = n.label || "(이름 없음)"; } checkRules(); });
        return el("label", { class: "fl-field" }, label, input);
      };
      const kindSel = el("select", {});
      for (const [k, v] of Object.entries(KIND)) kindSel.append(el("option", { value: k, selected: n.kind === k }, v.label));
      kindSel.addEventListener("change", () => { n.kind = kindSel.value; markDirty(); render(); });
      const a = els.agentMap[n.who];
      p.append(field("단계 이름", "label"), field("담당(에이전트 이름 또는 사람)", "who"),
        el("label", { class: "fl-field" }, "종류", kindSel), field("메모", "note", true),
        a ? el("div", { class: "small", style: "margin-top:8px" }, el("b", {}, a.title), " — ", a.role) : null,
        el("button", { class: "fl-btn", style: "margin-top:10px", onclick: removeSelected }, "이 상자 삭제"));
    }
    function checkRules() {
      const old = els.wrap.querySelector(".fl-warn"); if (old) old.remove();
      const warns = [];
      if (flow.nodes.length && !flow.nodes.some((n) => n.kind === "human")) warns.push("사람이 하는 단계가 없습니다. 최종 버튼(게시·제출·커밋)은 사람이 눌러야 합니다.");
      const linked = new Set(flow.edges.flatMap((e) => [e.from, e.to]));
      const lonely = flow.nodes.filter((n) => flow.nodes.length > 1 && !linked.has(n.id) && n.kind !== "note");
      if (lonely.length) warns.push("연결 안 된 상자: " + lonely.map((n) => n.label).join(", "));
      const browserLast = flow.nodes.filter((n) => n.kind === "browser" && !flow.edges.some((e) => e.from === n.id));
      if (browserLast.length) warns.push("크롬 통제 단계 뒤에 사람 단계를 두세요: " + browserLast.map((n) => n.label).join(", "));
      if (warns.length) els.wrap.append(el("div", { class: "fl-warn" }, warns.map((w) => el("div", {}, "⚠ " + w))));
    }
  }
  window.FlowEditor = { mount, reset: () => { flow = null; } };
})();
