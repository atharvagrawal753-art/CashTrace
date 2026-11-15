"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// CashTrace gateway (TypeScript): typed API, validation, SSE live feed, polyglot orchestration with TS fallbacks.
const node_http_1 = __importDefault(require("node:http"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const model_1 = require("../shared/model");
const PORT = Number(process.env.PORT) || 8000;
const SV = { python: 'http://127.0.0.1:8001', go: 'http://127.0.0.1:8002', java: 'http://127.0.0.1:8003', php: 'http://127.0.0.1:8004', csharp: 'http://127.0.0.1:8005' };
const PUB = node_path_1.default.resolve(__dirname, '../../public');
const DATA = node_path_1.default.resolve(__dirname, '../../data');
node_fs_1.default.mkdirSync(DATA, { recursive: true });
const CF = node_path_1.default.join(DATA, 'complaints.json');
const DEMO_HOPS = [
    { from: 'VICTIM', to: 'M1', amount: 50000, minute: 0 }, { from: 'M1', to: 'M2', amount: 48000, minute: 6 },
    { from: 'M2', to: 'M3', amount: 47000, minute: 15 }, { from: 'M3', to: 'CASH', amount: 46000, minute: 40 },
];
// ---------- helpers ----------
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isHop = (x) => { const h = x; return !!h && typeof h.from === 'string' && typeof h.to === 'string' && isNum(h.amount) && isNum(h.minute); };
const rid = (p) => `${p}-${node_crypto_1.default.randomInt(100000, 999999)}`;
async function call(svc, p, body) {
    try {
        const r = await fetch(SV[svc] + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(2500) });
        return r.ok ? (await r.json()) : null;
    }
    catch {
        return null;
    }
}
class HttpError extends Error {
    status;
    constructor(status, msg) {
        super(msg);
        this.status = status;
    }
}
function readBody(req) {
    return new Promise((ok, no) => {
        let d = '', n = 0;
        req.on('data', (c) => { n += c.length; if (n > 1e6) {
            no(new HttpError(413, 'Payload too large'));
            req.destroy();
        }
        else
            d += c; });
        req.on('end', () => { try {
            ok(d ? JSON.parse(d) : {});
        }
        catch {
            no(new HttpError(400, 'Invalid JSON'));
        } });
    });
}
function parseQuery(b) {
    const lat = b.lat === undefined ? model_1.DEFAULT_ORIGIN.lat : b.lat, lng = b.lng === undefined ? model_1.DEFAULT_ORIGIN.lng : b.lng, hours = b.hours === undefined ? 1.5 : b.hours;
    if (!isNum(lat) || !isNum(lng) || !isNum(hours))
        throw new HttpError(400, 'lat, lng, hours must be numbers');
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180 || hours < 0.1 || hours > 24)
        throw new HttpError(422, 'values out of range');
    return { o: { lat, lng }, hours };
}
const send = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(o)); };
// ---------- state ----------
let complaints = node_fs_1.default.existsSync(CF) ? JSON.parse(node_fs_1.default.readFileSync(CF, 'utf8')) : [];
const saveComplaints = () => node_fs_1.default.writeFileSync(CF, JSON.stringify(complaints.slice(-500), null, 1));
const clients = new Set();
const emit = (e) => { const m = `event: feed\ndata: ${JSON.stringify(e)}\n\n`; for (const c of clients)
    c.write(m); };
const rate = new Map();
const limited = (ip) => { const now = Date.now(), r = rate.get(ip) ?? { n: 0, t: now }; if (now - r.t > 60000) {
    r.n = 0;
    r.t = now;
} r.n++; rate.set(ip, r); return r.n > 180; };
async function doForecast(o, hours) {
    let f = (0, model_1.forecast)(model_1.ATMS, o, hours);
    const py = await call('python', '/predict', { lat: o.lat, lng: o.lng, hours, atms: model_1.ATMS, top: 8 });
    if (py && Array.isArray(py.all) && py.all.length === model_1.ATMS.length) {
        const by = new Map(model_1.ATMS.map((a) => [a.id, a]));
        const all = py.all.map((x) => { const a = by.get(x.atm); return { atm: a.id, name: a.name, lat: a.lat, lng: a.lng, prob: x.prob }; });
        f = { sigma_km: py.sigma_km, top: all.slice(0, 8), all, engine: 'python' };
    }
    const q = (0, model_1.coverage)(f);
    const jr = await call('java', `/risk?conf=${q}&hours=${hours}`);
    return { forecast: f, risk: jr ? { ...jr, engine: 'java' } : (0, model_1.risk)(q, hours) };
}
async function doAlert(caseId, severity, atms, windowMin) {
    const g = await call('go', '/alert', { complaint_id: caseId, atms, window: windowMin });
    const rec = {
        id: g?.alert_id ?? rid('AL'), case_id: caseId, severity, atms, window_min: windowMin, created: new Date().toISOString(), engine: g ? 'go' : 'ts',
        message: g?.message ?? `Notify Cyber Cell and beat units near ${atms.join(', ')} within ${windowMin} min. Request account freeze.`,
    };
    emit({ type: 'alert', ts: rec.created, text: `${rec.id} · ${rec.message}`, simulated: false });
    return rec;
}
async function pipeline(b) {
    const { o, hours } = parseQuery(b);
    const hops = Array.isArray(b.hops) && b.hops.length && b.hops.every(isHop) ? b.hops : DEMO_HOPS;
    const php = await call('php', '/intake', { victim_city: 'Indore', amount: hops[0].amount, hops });
    const complaint = { id: php?.id ?? rid('NCRP'), city: 'Indore', amount: hops[0].amount, hops, created: new Date().toISOString() };
    complaints.push(complaint);
    saveComplaints();
    const cs = await call('csharp', '/graph', { hops });
    const g = cs ? { ...cs, engine: 'csharp' } : (0, model_1.graph)(hops);
    const { forecast: f, risk: r } = await doForecast(o, hours);
    const alert = await doAlert(complaint.id, r.level === 'MEDIUM' ? 'medium' : 'high', f.top.slice(0, 3).map((t) => t.atm), r.window_min);
    return { complaint, graph: g, forecast: f, risk: r, alert, services: { php: !!php, csharp: !!cs, python: f.engine === 'python', java: r.engine === 'java', go: alert.engine === 'go' }, engines: { intake: php ? 'php' : 'ts', graph: g.engine, forecast: f.engine, risk: r.engine, alert: alert.engine } };
}
// ---------- routes ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
function serveStatic(res, url) {
    const f = node_path_1.default.resolve(PUB, url === '/' ? 'index.html' : decodeURIComponent(url.slice(1)));
    if (!f.startsWith(PUB + node_path_1.default.sep))
        return send(res, 403, { error: 'Forbidden' });
    node_fs_1.default.readFile(f, (e, buf) => {
        if (e)
            return send(res, 404, { error: 'Not found' });
        res.writeHead(200, { 'Content-Type': MIME[node_path_1.default.extname(f)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
        res.end(buf);
    });
}
const server = node_http_1.default.createServer(async (req, res) => {
    try {
        const url = (req.url ?? '/').split('?')[0], ip = req.socket.remoteAddress ?? '?';
        if (url.startsWith('/api/') && limited(ip))
            throw new HttpError(429, 'Too many requests');
        if (url === '/api/health') {
            const out = { node: true, ts: true, uptime_s: Math.round(process.uptime()) };
            await Promise.all(Object.keys(SV).map(async (k) => { out[k] = (await call(k, '/health')) !== null; }));
            return send(res, 200, out);
        }
        if (url === '/api/atms' && req.method === 'GET')
            return send(res, 200, model_1.ATMS);
        if (url === '/api/forecast' && req.method === 'POST') {
            const { o, hours } = parseQuery(await readBody(req));
            return send(res, 200, await doForecast(o, hours));
        }
        if (url === '/api/pipeline' && req.method === 'POST')
            return send(res, 200, await pipeline(await readBody(req)));
        if (url === '/api/alerts' && req.method === 'POST') {
            const b = await readBody(req);
            if (!Array.isArray(b.atms) || !b.atms.length || !b.atms.every((x) => typeof x === 'string') || !isNum(b.window))
                throw new HttpError(400, 'atms[] and window required');
            const sev = b.severity === 'high' || b.severity === 'low' ? b.severity : 'medium';
            return send(res, 201, await doAlert(typeof b.case_id === 'string' ? b.case_id : 'MANUAL', sev, b.atms, Math.max(5, Math.round(b.window))));
        }
        if (url === '/api/complaints' && req.method === 'GET')
            return send(res, 200, complaints.slice(-50).reverse());
        if (url === '/api/stream' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
            res.write(`event: feed\ndata: ${JSON.stringify({ type: 'system', ts: new Date().toISOString(), text: 'Connected to live feed', simulated: false })}\n\n`);
            clients.add(res);
            req.on('close', () => clients.delete(res));
            return;
        }
        if (url.startsWith('/api/'))
            throw new HttpError(404, 'Not found');
        serveStatic(res, url);
    }
    catch (e) {
        const err = e instanceof HttpError ? e : new HttpError(500, 'Internal error');
        send(res, err.status, { error: err.message });
    }
});
// Simulated background activity so the dashboard feels alive (clearly flagged simulated:true).
setInterval(() => {
    if (!clients.size)
        return;
    const a = model_1.ATMS[node_crypto_1.default.randomInt(model_1.ATMS.length)], amt = node_crypto_1.default.randomInt(8, 120) * 1000, alert = node_crypto_1.default.randomInt(3) === 0;
    emit({ type: alert ? 'alert' : 'complaint', ts: new Date().toISOString(), simulated: true,
        text: alert ? `Cash-out risk rising near ${a.name} (${a.id})` : `Complaint received · ₹${amt.toLocaleString('en-IN')} · ${node_crypto_1.default.randomInt(2, 6)} hops traced` });
}, 7000).unref();
setInterval(() => { for (const c of clients)
    c.write(': ping\n\n'); }, 20000).unref();
server.listen(PORT, () => console.log(`CashTrace gateway (TypeScript) -> http://localhost:${PORT}`));
process.on('SIGINT', () => server.close(() => process.exit(0)));
