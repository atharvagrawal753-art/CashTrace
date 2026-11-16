"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.coverage = exports.sigmaKm = exports.ATMS = exports.DEFAULT_ORIGIN = void 0;
exports.buildAtms = buildAtms;
exports.forecast = forecast;
exports.risk = risk;
exports.graph = graph;
exports.DEFAULT_ORIGIN = { lat: 22.7196, lng: 75.8577 };
// Synthetic ATMs are placed near well-known Indore localities (coordinates approximate).
const LOCALITIES = [
    ['Rajwada', 22.7186, 75.8553], ['Palasia', 22.7244, 75.8839], ['Vijay Nagar', 22.7533, 75.8937],
    ['Bhawarkua', 22.6934, 75.8662], ['Geeta Bhawan', 22.7219, 75.8692], ['Khajrana', 22.7360, 75.9040],
    ['Airport Road', 22.7218, 75.8011], ['Rau', 22.6410, 75.8030], ['MR-10', 22.7500, 75.8800],
    ['Annapurna', 22.6960, 75.8250], ['Scheme 78', 22.7460, 75.8900], ['Sudama Nagar', 22.6990, 75.8365],
];
function mulberry32(seed) {
    let a = seed | 0;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function buildAtms(seed = 2026) {
    const r = mulberry32(seed), out = [];
    let n = 1;
    for (const [name, lat, lng] of LOCALITIES)
        for (let k = 1; k <= 2; k++)
            out.push({ id: `ATM-${String(n++).padStart(2, '0')}`, name: `${name} #${k}`, lat: +(lat + (r() - 0.5) * 0.009).toFixed(5), lng: +(lng + (r() - 0.5) * 0.009).toFixed(5), history: +(0.35 + r() * 0.65).toFixed(2) });
    return out;
}
exports.ATMS = buildAtms();
const sigmaKm = (hours) => 1.6 + hours * 0.9;
exports.sigmaKm = sigmaKm;
/** score = history * exp(-d^2 / 2*sigma(t)^2), normalised to probabilities. */
function forecast(atms, o, hours, topN = 8) {
    const sg = (0, exports.sigmaKm)(hours), kx = Math.cos((o.lat * Math.PI) / 180) * 111;
    const raw = atms.map((a) => { const dx = (a.lng - o.lng) * kx, dy = (a.lat - o.lat) * 111; return { a, s: a.history * Math.exp(-(dx * dx + dy * dy) / (2 * sg * sg)) }; });
    const tot = raw.reduce((t, x) => t + x.s, 0) || 1;
    const all = raw.map(({ a, s }) => ({ atm: a.id, name: a.name, lat: a.lat, lng: a.lng, prob: +(s / tot).toFixed(4) })).sort((x, y) => y.prob - x.prob);
    return { sigma_km: +sg.toFixed(2), top: all.slice(0, topN), all, engine: 'ts' };
}
const coverage = (f) => f.top.slice(0, 3).reduce((t, x) => t + x.prob, 0);
exports.coverage = coverage;
function risk(conf, hours) {
    const u = Math.min(1, Math.max(0, 0.35 + conf * 1.2 + (2 - hours) * 0.08));
    return { urgency: +u.toFixed(2), level: u > 0.7 ? 'CRITICAL' : u > 0.45 ? 'HIGH' : 'MEDIUM', window_min: Math.max(5, Math.round((2 - hours) * 30 + 20)), engine: 'ts' };
}
function graph(h) {
    const n = h.length, span = n ? Math.max(...h.map((x) => x.minute)) - Math.min(...h.map((x) => x.minute)) : 0;
    const vel = span > 0 ? +((n / span) * 60).toFixed(2) : 0;
    return { hops: n, accounts: new Set(h.map((x) => x.to)).size, span_min: span, hops_per_hour: vel, mule_risk: +Math.min(1, 0.2 + n * 0.12 + vel * 0.05).toFixed(2), last_hop: n ? h[n - 1].from : null, engine: 'ts' };
}
