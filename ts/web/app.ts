// CashTrace browser app (TypeScript): live forecast map, alert dispatch, live feed, command palette.
import { ATMS, DEFAULT_ORIGIN, forecast, coverage, risk } from '../shared/model';
import type { AtmScore, Forecast, Risk, Origin, FeedEvent, AlertRecord } from '../shared/types';

const q = <T extends HTMLElement>(s: string): T | null => document.querySelector<T>(s);
const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
const hhmm = (iso: string): string => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// ---------- backend mode ----------
function setMode(live: boolean): void {
  document.querySelectorAll<HTMLElement>('[data-mode]').forEach((el) => { el.textContent = live ? 'Live backend' : 'Offline model'; el.classList.toggle('on', live); });
}
async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(2500) });
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as T;
}
function toast(msg: string): void {
  const box = q('#toasts'); if (!box) return;
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; box.appendChild(t);
  setTimeout(() => t.classList.add('out'), 3200); setTimeout(() => t.remove(), 3800);
}

// ---------- state ----------
const state = { origin: { ...DEFAULT_ORIGIN } as Origin, hours: 1.5, fc: null as Forecast | null, rk: null as Risk | null, hover: null as AtmScore | null };
async function compute(): Promise<void> {
  const { origin: o, hours: h } = state;
  try { const r = await post<{ forecast: Forecast; risk: Risk }>('/api/forecast', { lat: o.lat, lng: o.lng, hours: h }); state.fc = r.forecast; state.rk = r.risk; setMode(true); }
  catch { state.fc = forecast(ATMS, o, h); state.rk = risk(coverage(state.fc), h); setMode(false); }
  renderPanel();
}
function renderPanel(): void {
  const f = state.fc, r = state.rk; if (!f || !r) return;
  const set = (id: string, v: string): void => { const el = q('#' + id); if (el) el.textContent = v; };
  set('k-sig', `${f.sigma_km} km`); set('k-cov', `${Math.round(coverage(f) * 100)}%`); set('k-urg', r.level); set('k-win', `${r.window_min} min`);
  const ur = q('#k-urg'); if (ur) ur.dataset.level = r.level;
  const list = q<HTMLOListElement>('#rank'); if (!list) return;
  const max = f.top[0]?.prob || 1;
  list.innerHTML = f.top.slice(0, 5).map((t, i) => `<li><span>${i + 1}</span><b>${t.name}</b><i style="--w:${(t.prob / max) * 100}%"></i><em>${(t.prob * 100).toFixed(1)}%</em></li>`).join('');
}

// ---------- map ----------
const cv = q<HTMLCanvasElement>('#map'), ctx = cv?.getContext('2d') ?? null;
const lats = ATMS.map((a) => a.lat), lngs = ATMS.map((a) => a.lng);
const B = { a: Math.min(...lats) - 0.012, b: Math.max(...lats) + 0.012, c: Math.min(...lngs) - 0.012, d: Math.max(...lngs) + 0.012 };
let W = 0, H = 0, vis = true;
function resize(): void {
  if (!cv || !ctx) return;
  const r = cv.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
  W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
const px = (lat: number, lng: number): [number, number] => [((lng - B.c) / (B.d - B.c)) * W, ((B.b - lat) / (B.b - B.a)) * H];
const inv = (x: number, y: number): Origin => ({ lat: B.b - (y / H) * (B.b - B.a), lng: B.c + (x / W) * (B.d - B.c) });
function draw(t: number): void {
  const c = ctx, f = state.fc; if (!c || !f || !W) return;
  c.clearRect(0, 0, W, H);
  c.fillStyle = 'rgba(6,12,26,.9)'; c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(120,160,255,.07)'; c.lineWidth = 1;
  for (let i = 1; i < 12; i++) { c.beginPath(); c.moveTo((W / 12) * i, 0); c.lineTo((W / 12) * i, H); c.stroke(); c.beginPath(); c.moveTo(0, (H / 7) * Math.min(i, 6)); c.lineTo(W, (H / 7) * Math.min(i, 6)); c.stroke(); }
  c.globalCompositeOperation = 'lighter';
  for (const s of f.all) { const [x, y] = px(s.lat, s.lng), r = 14 + Math.sqrt(s.prob) * 150 * (W / 800), g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(255,77,109,${Math.min(0.75, s.prob * 5)})`); g.addColorStop(1, 'rgba(255,77,109,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill(); }
  c.globalCompositeOperation = 'source-over';
  const [ox, oy] = px(state.origin.lat, state.origin.lng), kx = W / ((B.d - B.c) * 111 * Math.cos((state.origin.lat * Math.PI) / 180)), ky = H / ((B.b - B.a) * 111);
  c.setLineDash([6, 6]); c.strokeStyle = 'rgba(76,201,240,.7)'; c.beginPath(); c.ellipse(ox, oy, f.sigma_km * kx, f.sigma_km * ky, 0, 0, 6.283); c.stroke();
  const top3 = f.top.slice(0, 3); c.strokeStyle = 'rgba(255,255,255,.18)';
  for (const s of top3) { const [x, y] = px(s.lat, s.lng); c.beginPath(); c.moveTo(ox, oy); c.lineTo(x, y); c.stroke(); }
  c.setLineDash([]);
  const pulse = reduce ? 0 : (Math.sin(t / 400) + 1) / 2;
  const rank = new Map(f.top.map((s, i) => [s.atm, i]));
  for (const a of ATMS) {
    const [x, y] = px(a.lat, a.lng), i = rank.get(a.id) ?? 99, hot = i < 3;
    c.fillStyle = hot ? '#ff4d6d' : 'rgba(160,190,235,.85)'; c.beginPath(); c.arc(x, y, 3 + a.history * 2.2, 0, 6.283); c.fill();
    if (hot) { c.strokeStyle = `rgba(255,77,109,${0.9 - pulse * 0.7})`; c.beginPath(); c.arc(x, y, 8 + pulse * 10, 0, 6.283); c.stroke(); c.fillStyle = '#fff'; c.font = '600 11px Inter,system-ui,sans-serif'; c.fillText(`${i + 1} · ${f.all.find((s) => s.atm === a.id)?.name ?? ''}`, x + 12, y + 4); }
  }
  c.strokeStyle = '#ffb454'; c.lineWidth = 2; c.beginPath(); c.moveTo(ox - 9, oy); c.lineTo(ox + 9, oy); c.moveTo(ox, oy - 9); c.lineTo(ox, oy + 9); c.stroke(); c.lineWidth = 1;
  c.fillStyle = '#ffb454'; c.font = '600 11px Inter,system-ui,sans-serif'; c.fillText('Last mule account', ox + 12, oy - 10);
  const hv = state.hover;
  if (hv) { const [x, y] = px(hv.lat, hv.lng), txt = `${hv.name} · ${(hv.prob * 100).toFixed(1)}%`, w = c.measureText(txt).width + 16; c.fillStyle = 'rgba(0,0,0,.85)'; c.fillRect(Math.min(x + 10, W - w - 4), y - 34, w, 22); c.fillStyle = '#fff'; c.fillText(txt, Math.min(x + 18, W - w + 4), y - 19); }
}
function loop(t: number): void { if (vis) draw(t); requestAnimationFrame(loop); }
function pointer(e: PointerEvent): { x: number; y: number } { const r = cv!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
if (cv) {
  new ResizeObserver(() => { resize(); }).observe(cv);
  new IntersectionObserver((e) => { vis = e[0].isIntersecting; }).observe(cv);
  cv.addEventListener('pointermove', (e) => {
    const { x, y } = pointer(e); let best: AtmScore | null = null, bd = 18;
    for (const s of state.fc?.all ?? []) { const [sx, sy] = px(s.lat, s.lng), d = Math.hypot(sx - x, sy - y); if (d < bd) { bd = d; best = s; } }
    state.hover = best; cv.style.cursor = best ? 'help' : 'crosshair';
  });
  cv.addEventListener('pointerleave', () => { state.hover = null; });
  cv.addEventListener('click', (e) => { const { x, y } = pointer(e); state.origin = inv(x, y); void compute(); });
  cv.addEventListener('keydown', (e) => {
    const step = 0.004, k = e.key; if (!k.startsWith('Arrow')) return; e.preventDefault();
    state.origin = { lat: state.origin.lat + (k === 'ArrowUp' ? step : k === 'ArrowDown' ? -step : 0), lng: state.origin.lng + (k === 'ArrowRight' ? step : k === 'ArrowLeft' ? -step : 0) }; void compute();
  });
  resize(); requestAnimationFrame(loop);
}

// ---------- controls ----------
const slider = q<HTMLInputElement>('#hrs');
let deb = 0;
slider?.addEventListener('input', () => { state.hours = Number(slider.value); const o = q('#hrsv'); if (o) o.textContent = `${state.hours} h`; clearTimeout(deb); deb = window.setTimeout(() => void compute(), 120); });
q('#reset')?.addEventListener('click', () => { state.origin = { ...DEFAULT_ORIGIN }; state.hours = 1.5; if (slider) slider.value = '1.5'; const o = q('#hrsv'); if (o) o.textContent = '1.5 h'; void compute(); });
async function dispatch(): Promise<void> {
  const f = state.fc, r = state.rk; if (!f || !r) return;
  const atms = f.top.slice(0, 3).map((x) => x.atm), sev = r.level === 'MEDIUM' ? 'medium' : 'high';
  let a: AlertRecord;
  try { a = await post<AlertRecord>('/api/alerts', { atms, window: r.window_min, severity: sev }); }
  catch {
    a = { id: `AL-${Math.floor(Math.random() * 1e6)}`, case_id: 'DEMO', severity: sev, atms, window_min: r.window_min, created: new Date().toISOString(), engine: 'browser', message: `Notify Cyber Cell and beat units near ${atms.join(', ')} within ${r.window_min} min.` };
    pushFeed({ type: 'alert', ts: a.created, text: `${a.id} · ${a.message}`, simulated: true });
  }
  toast(`Alert ${a.id} dispatched · ${a.window_min} min window`);
}
q('#dispatch')?.addEventListener('click', () => void dispatch());

// ---------- live feed ----------
const feed = q<HTMLUListElement>('#feed');
function pushFeed(e: FeedEvent): void {
  if (!feed) return;
  const li = document.createElement('li'), k = document.createElement('span'), tx = document.createElement('span'), tm = document.createElement('time');
  k.className = `k ${e.type}`; k.textContent = e.type; tx.textContent = e.text; tm.textContent = hhmm(e.ts);
  li.append(tm, k, tx); if (e.simulated) { const s = document.createElement('small'); s.textContent = 'simulated'; li.append(s); }
  feed.prepend(li); while (feed.children.length > 7) feed.lastElementChild?.remove();
}
let sim = 0;
function startSim(): void {
  if (sim) return;
  const msgs = ['Complaint received · 4 hops traced', 'Cash-out risk rising near Rajwada #1', 'Mule chain velocity above threshold', 'Account freeze request queued'];
  sim = window.setInterval(() => { const i = Math.floor(Math.random() * msgs.length); pushFeed({ type: i === 1 ? 'alert' : 'complaint', ts: new Date().toISOString(), text: msgs[i], simulated: true }); }, 8000);
  pushFeed({ type: 'system', ts: new Date().toISOString(), text: 'Offline mode: showing simulated activity', simulated: true });
}
if (location.protocol.startsWith('http')) {
  const es = new EventSource('/api/stream');
  es.addEventListener('feed', (ev) => pushFeed(JSON.parse((ev as MessageEvent<string>).data) as FeedEvent));
  es.onerror = () => { es.close(); startSim(); };
} else startSim();

// ---------- command palette (Ctrl/Cmd + K) ----------
const ITEMS: ReadonlyArray<readonly [string, string]> = [['Problem', '#problem'], ['Simulator', '#sim'], ['Engines', '#engines'], ['Command center', '#center'], ['Architecture', '#arch'], ['Live API', '#api'], ['Impact', '#impact'], ['Dispatch alert', 'act:dispatch'], ['Reset forecast', 'act:reset']];
const pal = document.createElement('div'); pal.id = 'pal'; pal.hidden = true;
pal.innerHTML = '<div class="pbox" role="dialog" aria-modal="true" aria-label="Command palette"><input id="pin" placeholder="Jump to a section or run an action…" autocomplete="off"><ul id="plist"></ul></div>';
document.body.appendChild(pal);
const pin = pal.querySelector<HTMLInputElement>('#pin')!, plist = pal.querySelector<HTMLUListElement>('#plist')!;
let sel = 0, shown: ReadonlyArray<readonly [string, string]> = ITEMS;
function paint(): void { shown = ITEMS.filter(([n]) => n.toLowerCase().includes(pin.value.toLowerCase())); sel = Math.min(sel, Math.max(0, shown.length - 1)); plist.innerHTML = shown.map(([n], i) => `<li class="${i === sel ? 'on' : ''}">${n}</li>`).join(''); }
function openPal(open: boolean): void { pal.hidden = !open; if (open) { pin.value = ''; sel = 0; paint(); pin.focus(); } }
function run(i: number): void { const it = shown[i]; if (!it) return; openPal(false); if (it[1] === 'act:dispatch') void dispatch(); else if (it[1] === 'act:reset') q('#reset')?.click(); else document.querySelector(it[1])?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); }
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPal(pal.hidden); return; }
  if (pal.hidden) return;
  if (e.key === 'Escape') openPal(false);
  else if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, shown.length); paint(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + shown.length) % Math.max(1, shown.length); paint(); }
  else if (e.key === 'Enter') run(sel);
});
pin.addEventListener('input', () => { sel = 0; paint(); });
plist.addEventListener('click', (e) => { const li = (e.target as HTMLElement).closest('li'); if (li) run(Array.from(plist.children).indexOf(li)); });
pal.addEventListener('click', (e) => { if (e.target === pal) openPal(false); });
q('#pbtn')?.addEventListener('click', () => openPal(true));

// ---------- spotlight hover on glass cards ----------
document.querySelectorAll<HTMLElement>('.gc,.panel,.kp>div,.pair,.ccp').forEach((el) => el.classList.add('spot'));
document.addEventListener('pointermove', (e) => { const t = (e.target as HTMLElement).closest<HTMLElement>('.spot'); if (t) { const r = t.getBoundingClientRect(); t.style.setProperty('--mx', `${e.clientX - r.left}px`); t.style.setProperty('--my', `${e.clientY - r.top}px`); } }, { passive: true });

void compute();
