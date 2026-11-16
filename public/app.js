"use strict";
(() => {
  // ts/shared/model.ts
  var DEFAULT_ORIGIN = { lat: 22.7196, lng: 75.8577 };
  var LOCALITIES = [
    ["Rajwada", 22.7186, 75.8553],
    ["Palasia", 22.7244, 75.8839],
    ["Vijay Nagar", 22.7533, 75.8937],
    ["Bhawarkua", 22.6934, 75.8662],
    ["Geeta Bhawan", 22.7219, 75.8692],
    ["Khajrana", 22.736, 75.904],
    ["Airport Road", 22.7218, 75.8011],
    ["Rau", 22.641, 75.803],
    ["MR-10", 22.75, 75.88],
    ["Annapurna", 22.696, 75.825],
    ["Scheme 78", 22.746, 75.89],
    ["Sudama Nagar", 22.699, 75.8365]
  ];
  function mulberry32(seed) {
    let a = seed | 0;
    return () => {
      a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function buildAtms(seed = 2026) {
    const r = mulberry32(seed), out = [];
    let n = 1;
    for (const [name, lat, lng] of LOCALITIES) for (let k = 1; k <= 2; k++)
      out.push({ id: `ATM-${String(n++).padStart(2, "0")}`, name: `${name} #${k}`, lat: +(lat + (r() - 0.5) * 9e-3).toFixed(5), lng: +(lng + (r() - 0.5) * 9e-3).toFixed(5), history: +(0.35 + r() * 0.65).toFixed(2) });
    return out;
  }
  var ATMS = buildAtms();
  var sigmaKm = (hours) => 1.6 + hours * 0.9;
  function forecast(atms, o, hours, topN = 8) {
    const sg = sigmaKm(hours), kx = Math.cos(o.lat * Math.PI / 180) * 111;
    const raw = atms.map((a) => {
      const dx = (a.lng - o.lng) * kx, dy = (a.lat - o.lat) * 111;
      return { a, s: a.history * Math.exp(-(dx * dx + dy * dy) / (2 * sg * sg)) };
    });
    const tot = raw.reduce((t, x) => t + x.s, 0) || 1;
    const all = raw.map(({ a, s }) => ({ atm: a.id, name: a.name, lat: a.lat, lng: a.lng, prob: +(s / tot).toFixed(4) })).sort((x, y) => y.prob - x.prob);
    return { sigma_km: +sg.toFixed(2), top: all.slice(0, topN), all, engine: "ts" };
  }
  var coverage = (f) => f.top.slice(0, 3).reduce((t, x) => t + x.prob, 0);
  function risk(conf, hours) {
    const u = Math.min(1, Math.max(0, 0.35 + conf * 1.2 + (2 - hours) * 0.08));
    return { urgency: +u.toFixed(2), level: u > 0.7 ? "CRITICAL" : u > 0.45 ? "HIGH" : "MEDIUM", window_min: Math.max(5, Math.round((2 - hours) * 30 + 20)), engine: "ts" };
  }

  // ts/web/app.ts
  var q = (s) => document.querySelector(s);
  var reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
  var hhmm = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  function setMode(live) {
    document.querySelectorAll("[data-mode]").forEach((el) => {
      el.textContent = live ? "Live backend" : "Offline model";
      el.classList.toggle("on", live);
    });
  }
  async function post(url, body) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(2500) });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  }
  function toast(msg) {
    const box = q("#toasts");
    if (!box) return;
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.classList.add("out"), 3200);
    setTimeout(() => t.remove(), 3800);
  }
  var state = { origin: { ...DEFAULT_ORIGIN }, hours: 1.5, fc: null, rk: null, hover: null };
  async function compute() {
    const { origin: o, hours: h } = state;
    try {
      const r = await post("/api/forecast", { lat: o.lat, lng: o.lng, hours: h });
      state.fc = r.forecast;
      state.rk = r.risk;
      setMode(true);
    } catch {
      state.fc = forecast(ATMS, o, h);
      state.rk = risk(coverage(state.fc), h);
      setMode(false);
    }
    renderPanel();
  }
  function renderPanel() {
    const f = state.fc, r = state.rk;
    if (!f || !r) return;
    const set = (id, v) => {
      const el = q("#" + id);
      if (el) el.textContent = v;
    };
    set("k-sig", `${f.sigma_km} km`);
    set("k-cov", `${Math.round(coverage(f) * 100)}%`);
    set("k-urg", r.level);
    set("k-win", `${r.window_min} min`);
    const ur = q("#k-urg");
    if (ur) ur.dataset.level = r.level;
    const list = q("#rank");
    if (!list) return;
    const max = f.top[0]?.prob || 1;
    list.innerHTML = f.top.slice(0, 5).map((t, i) => `<li><span>${i + 1}</span><b>${t.name}</b><i style="--w:${t.prob / max * 100}%"></i><em>${(t.prob * 100).toFixed(1)}%</em></li>`).join("");
  }
  var cv = q("#map");
  var ctx = cv?.getContext("2d") ?? null;
  var lats = ATMS.map((a) => a.lat);
  var lngs = ATMS.map((a) => a.lng);
  var B = { a: Math.min(...lats) - 0.012, b: Math.max(...lats) + 0.012, c: Math.min(...lngs) - 0.012, d: Math.max(...lngs) + 0.012 };
  var W = 0;
  var H = 0;
  var vis = true;
  function resize() {
    if (!cv || !ctx) return;
    const r = cv.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width;
    H = r.height;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  var px = (lat, lng) => [(lng - B.c) / (B.d - B.c) * W, (B.b - lat) / (B.b - B.a) * H];
  var inv = (x, y) => ({ lat: B.b - y / H * (B.b - B.a), lng: B.c + x / W * (B.d - B.c) });
  function draw(t) {
    const c = ctx, f = state.fc;
    if (!c || !f || !W) return;
    c.clearRect(0, 0, W, H);
    c.fillStyle = "rgba(6,12,26,.9)";
    c.fillRect(0, 0, W, H);
    c.strokeStyle = "rgba(120,160,255,.07)";
    c.lineWidth = 1;
    for (let i = 1; i < 12; i++) {
      c.beginPath();
      c.moveTo(W / 12 * i, 0);
      c.lineTo(W / 12 * i, H);
      c.stroke();
      c.beginPath();
      c.moveTo(0, H / 7 * Math.min(i, 6));
      c.lineTo(W, H / 7 * Math.min(i, 6));
      c.stroke();
    }
    c.globalCompositeOperation = "lighter";
    for (const s of f.all) {
      const [x, y] = px(s.lat, s.lng), r = 14 + Math.sqrt(s.prob) * 150 * (W / 800), g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,77,109,${Math.min(0.75, s.prob * 5)})`);
      g.addColorStop(1, "rgba(255,77,109,0)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, r, 0, 6.283);
      c.fill();
    }
    c.globalCompositeOperation = "source-over";
    const [ox, oy] = px(state.origin.lat, state.origin.lng), kx = W / ((B.d - B.c) * 111 * Math.cos(state.origin.lat * Math.PI / 180)), ky = H / ((B.b - B.a) * 111);
    c.setLineDash([6, 6]);
    c.strokeStyle = "rgba(76,201,240,.7)";
    c.beginPath();
    c.ellipse(ox, oy, f.sigma_km * kx, f.sigma_km * ky, 0, 0, 6.283);
    c.stroke();
    const top3 = f.top.slice(0, 3);
    c.strokeStyle = "rgba(255,255,255,.18)";
    for (const s of top3) {
      const [x, y] = px(s.lat, s.lng);
      c.beginPath();
      c.moveTo(ox, oy);
      c.lineTo(x, y);
      c.stroke();
    }
    c.setLineDash([]);
    const pulse = reduce ? 0 : (Math.sin(t / 400) + 1) / 2;
    const rank = new Map(f.top.map((s, i) => [s.atm, i]));
    for (const a of ATMS) {
      const [x, y] = px(a.lat, a.lng), i = rank.get(a.id) ?? 99, hot = i < 3;
      c.fillStyle = hot ? "#ff4d6d" : "rgba(160,190,235,.85)";
      c.beginPath();
      c.arc(x, y, 3 + a.history * 2.2, 0, 6.283);
      c.fill();
      if (hot) {
        c.strokeStyle = `rgba(255,77,109,${0.9 - pulse * 0.7})`;
        c.beginPath();
        c.arc(x, y, 8 + pulse * 10, 0, 6.283);
        c.stroke();
        c.fillStyle = "#fff";
        c.font = "600 11px Inter,system-ui,sans-serif";
        c.fillText(`${i + 1} \xB7 ${f.all.find((s) => s.atm === a.id)?.name ?? ""}`, x + 12, y + 4);
      }
    }
    c.strokeStyle = "#ffb454";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(ox - 9, oy);
    c.lineTo(ox + 9, oy);
    c.moveTo(ox, oy - 9);
    c.lineTo(ox, oy + 9);
    c.stroke();
    c.lineWidth = 1;
    c.fillStyle = "#ffb454";
    c.font = "600 11px Inter,system-ui,sans-serif";
    c.fillText("Last mule account", ox + 12, oy - 10);
    const hv = state.hover;
    if (hv) {
      const [x, y] = px(hv.lat, hv.lng), txt = `${hv.name} \xB7 ${(hv.prob * 100).toFixed(1)}%`, w = c.measureText(txt).width + 16;
      c.fillStyle = "rgba(0,0,0,.85)";
      c.fillRect(Math.min(x + 10, W - w - 4), y - 34, w, 22);
      c.fillStyle = "#fff";
      c.fillText(txt, Math.min(x + 18, W - w + 4), y - 19);
    }
  }
  function loop(t) {
    if (vis) draw(t);
    requestAnimationFrame(loop);
  }
  function pointer(e) {
    const r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  if (cv) {
    new ResizeObserver(() => {
      resize();
    }).observe(cv);
    new IntersectionObserver((e) => {
      vis = e[0].isIntersecting;
    }).observe(cv);
    cv.addEventListener("pointermove", (e) => {
      const { x, y } = pointer(e);
      let best = null, bd = 18;
      for (const s of state.fc?.all ?? []) {
        const [sx, sy] = px(s.lat, s.lng), d = Math.hypot(sx - x, sy - y);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      state.hover = best;
      cv.style.cursor = best ? "help" : "crosshair";
    });
    cv.addEventListener("pointerleave", () => {
      state.hover = null;
    });
    cv.addEventListener("click", (e) => {
      const { x, y } = pointer(e);
      state.origin = inv(x, y);
      void compute();
    });
    cv.addEventListener("keydown", (e) => {
      const step = 4e-3, k = e.key;
      if (!k.startsWith("Arrow")) return;
      e.preventDefault();
      state.origin = { lat: state.origin.lat + (k === "ArrowUp" ? step : k === "ArrowDown" ? -step : 0), lng: state.origin.lng + (k === "ArrowRight" ? step : k === "ArrowLeft" ? -step : 0) };
      void compute();
    });
    resize();
    requestAnimationFrame(loop);
  }
  var slider = q("#hrs");
  var deb = 0;
  slider?.addEventListener("input", () => {
    state.hours = Number(slider.value);
    const o = q("#hrsv");
    if (o) o.textContent = `${state.hours} h`;
    clearTimeout(deb);
    deb = window.setTimeout(() => void compute(), 120);
  });
  q("#reset")?.addEventListener("click", () => {
    state.origin = { ...DEFAULT_ORIGIN };
    state.hours = 1.5;
    if (slider) slider.value = "1.5";
    const o = q("#hrsv");
    if (o) o.textContent = "1.5 h";
    void compute();
  });
  async function dispatch() {
    const f = state.fc, r = state.rk;
    if (!f || !r) return;
    const atms = f.top.slice(0, 3).map((x) => x.atm), sev = r.level === "MEDIUM" ? "medium" : "high";
    let a;
    try {
      a = await post("/api/alerts", { atms, window: r.window_min, severity: sev });
    } catch {
      a = { id: `AL-${Math.floor(Math.random() * 1e6)}`, case_id: "DEMO", severity: sev, atms, window_min: r.window_min, created: (/* @__PURE__ */ new Date()).toISOString(), engine: "browser", message: `Notify Cyber Cell and beat units near ${atms.join(", ")} within ${r.window_min} min.` };
      pushFeed({ type: "alert", ts: a.created, text: `${a.id} \xB7 ${a.message}`, simulated: true });
    }
    toast(`Alert ${a.id} dispatched \xB7 ${a.window_min} min window`);
  }
  q("#dispatch")?.addEventListener("click", () => void dispatch());
  var feed = q("#feed");
  function pushFeed(e) {
    if (!feed) return;
    const li = document.createElement("li"), k = document.createElement("span"), tx = document.createElement("span"), tm = document.createElement("time");
    k.className = `k ${e.type}`;
    k.textContent = e.type;
    tx.textContent = e.text;
    tm.textContent = hhmm(e.ts);
    li.append(tm, k, tx);
    if (e.simulated) {
      const s = document.createElement("small");
      s.textContent = "simulated";
      li.append(s);
    }
    feed.prepend(li);
    while (feed.children.length > 7) feed.lastElementChild?.remove();
  }
  var sim = 0;
  function startSim() {
    if (sim) return;
    const msgs = ["Complaint received \xB7 4 hops traced", "Cash-out risk rising near Rajwada #1", "Mule chain velocity above threshold", "Account freeze request queued"];
    sim = window.setInterval(() => {
      const i = Math.floor(Math.random() * msgs.length);
      pushFeed({ type: i === 1 ? "alert" : "complaint", ts: (/* @__PURE__ */ new Date()).toISOString(), text: msgs[i], simulated: true });
    }, 8e3);
    pushFeed({ type: "system", ts: (/* @__PURE__ */ new Date()).toISOString(), text: "Offline mode: showing simulated activity", simulated: true });
  }
  if (location.protocol.startsWith("http")) {
    const es = new EventSource("/api/stream");
    es.addEventListener("feed", (ev) => pushFeed(JSON.parse(ev.data)));
    es.onerror = () => {
      es.close();
      startSim();
    };
  } else startSim();
  var ITEMS = [["Problem", "#problem"], ["Simulator", "#sim"], ["Engines", "#engines"], ["Command center", "#center"], ["Architecture", "#arch"], ["Live API", "#api"], ["Impact", "#impact"], ["Dispatch alert", "act:dispatch"], ["Reset forecast", "act:reset"]];
  var pal = document.createElement("div");
  pal.id = "pal";
  pal.hidden = true;
  pal.innerHTML = '<div class="pbox" role="dialog" aria-modal="true" aria-label="Command palette"><input id="pin" placeholder="Jump to a section or run an action\u2026" autocomplete="off"><ul id="plist"></ul></div>';
  document.body.appendChild(pal);
  var pin = pal.querySelector("#pin");
  var plist = pal.querySelector("#plist");
  var sel = 0;
  var shown = ITEMS;
  function paint() {
    shown = ITEMS.filter(([n]) => n.toLowerCase().includes(pin.value.toLowerCase()));
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    plist.innerHTML = shown.map(([n], i) => `<li class="${i === sel ? "on" : ""}">${n}</li>`).join("");
  }
  function openPal(open) {
    pal.hidden = !open;
    if (open) {
      pin.value = "";
      sel = 0;
      paint();
      pin.focus();
    }
  }
  function run(i) {
    const it = shown[i];
    if (!it) return;
    openPal(false);
    if (it[1] === "act:dispatch") void dispatch();
    else if (it[1] === "act:reset") q("#reset")?.click();
    else document.querySelector(it[1])?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  }
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openPal(pal.hidden);
      return;
    }
    if (pal.hidden) return;
    if (e.key === "Escape") openPal(false);
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      sel = (sel + 1) % Math.max(1, shown.length);
      paint();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      sel = (sel - 1 + shown.length) % Math.max(1, shown.length);
      paint();
    } else if (e.key === "Enter") run(sel);
  });
  pin.addEventListener("input", () => {
    sel = 0;
    paint();
  });
  plist.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (li) run(Array.from(plist.children).indexOf(li));
  });
  pal.addEventListener("click", (e) => {
    if (e.target === pal) openPal(false);
  });
  q("#pbtn")?.addEventListener("click", () => openPal(true));
  document.querySelectorAll(".gc,.panel,.kp>div,.pair,.ccp").forEach((el) => el.classList.add("spot"));
  document.addEventListener("pointermove", (e) => {
    const t = e.target.closest(".spot");
    if (t) {
      const r = t.getBoundingClientRect();
      t.style.setProperty("--mx", `${e.clientX - r.left}px`);
      t.style.setProperty("--my", `${e.clientY - r.top}px`);
    }
  }, { passive: true });
  void compute();
})();
