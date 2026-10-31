#!/usr/bin/env node
// Model bake-off for the demo tier: how well does a local model do the triage step, compared with the Haiku answers?
// Zero dependencies (Node 20+). Run it where it can reach Ollama:
//   node scripts/ollama-bakeoff.mjs --fixtures fixtures.json --models qwen3:8b,qwen3:14b --ctx 16384 [--url http://127.0.0.1:11434] [--limit 30]
// Checks the triage thresholds from PLAN.md §7.4 and reports whether the model fits in GPU memory (a CPU spill is the usual slowdown).
import { readFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]]] : a), []));
const URL_ = String(args.url ?? process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
const models = String(args.models ?? 'qwen3:8b').split(',').map((s) => s.trim());
const ctx = Number(args.ctx ?? 16384);
const fx = JSON.parse(readFileSync(String(args.fixtures ?? 'data/bakeoff/fixtures.json'), 'utf8'));
const items = fx.items.slice(0, Number(args.limit ?? fx.items.length));

const SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'MARGINAL', 'FAIL', 'SKIP'] },
    score: { type: 'number', minimum: 0, maximum: 5 },
    reason: { type: 'string' },
  },
  required: ['verdict', 'score', 'reason'],
};

async function call(model, user) {
  const body = { model, stream: false, think: false, format: SCHEMA, keep_alive: '10m',
    options: { num_ctx: ctx, temperature: 0 }, messages: [{ role: 'system', content: fx.system }, { role: 'user', content: user }] };
  const t0 = performance.now();
  let res = await fetch(`${URL_}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (res.status === 400) { delete body.think; res = await fetch(`${URL_}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const j = await res.json();
  return { ms: performance.now() - t0, j };
}

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const gate = (v) => (v === 'PASS' || v === 'MARGINAL' ? 'go' : 'no'); // what matters downstream: does it move on to full evaluation?

const version = await fetch(`${URL_}/api/version`).then((r) => r.json()).catch((e) => { console.error(`Cannot reach Ollama at ${URL_}: ${e.message}`); process.exit(2); });
console.log(`Ollama ${version.version} at ${URL_} · ${items.length} postings · context ${ctx}\n`);

const summary = [];
for (const model of models) {
  const r = { model, n: 0, json: 0, exact: 0, gateOk: 0, scoreErr: 0, lat: [], tps: [], errors: 0, vram: null };
  process.stdout.write(`${model}: `);
  for (const it of items) {
    r.n++;
    try {
      const { ms, j } = await call(model, it.user);
      r.lat.push(ms / 1000);
      if (j.eval_count && j.eval_duration) r.tps.push(j.eval_count / (j.eval_duration / 1e9));
      let out;
      try { out = JSON.parse(j.message?.content ?? ''); } catch { out = null; }
      if (out && SCHEMA.required.every((k) => k in out) && SCHEMA.properties.verdict.enum.includes(out.verdict) && Number.isFinite(out.score)) {
        r.json++;
        if (out.verdict === it.reference.verdict) r.exact++;
        if (gate(out.verdict) === gate(it.reference.verdict)) r.gateOk++;
        r.scoreErr += Math.abs(out.score - it.reference.score);
      }
    } catch (e) { r.errors++; if (r.errors === 1) process.stdout.write(`(error: ${String(e.message).slice(0, 90)}) `); }
    process.stdout.write('.');
    if (r.n === 1) {
      const ps = await fetch(`${URL_}/api/ps`).then((x) => x.json()).catch(() => null);
      const m = ps?.models?.find((x) => x.name === model || x.model === model) ?? ps?.models?.[0];
      if (m?.size) r.vram = Math.round((m.size_vram / m.size) * 100);
    }
  }
  process.stdout.write('\n');
  summary.push(r);
}

console.log('\nModel            valid-JSON  agree(go/no)  exact  |score err|  p50 s   p95 s   tok/s  in-GPU');
for (const r of summary) {
  const v = r.json;
  console.log(
    `${r.model.padEnd(16)} ${String(pct(v, r.n) + '%').padStart(9)}  ${String(pct(r.gateOk, r.n) + '%').padStart(11)}  ${String(pct(r.exact, r.n) + '%').padStart(5)}  ` +
    `${(v ? r.scoreErr / v : NaN).toFixed(2).padStart(10)}  ${q(r.lat, 0.5).toFixed(1).padStart(5)}  ${q(r.lat, 0.95).toFixed(1).padStart(6)}  ${(r.tps.length ? r.tps.reduce((a, b) => a + b, 0) / r.tps.length : 0).toFixed(0).padStart(5)}  ${r.vram == null ? '  n/a' : r.vram + '%'}`,
  );
}
console.log('\nPass bars (triage step): valid JSON ≥ 95%, go/no agreement ≥ 85%, p95 well under 5 min. "in-GPU" below ~95% means the model spilled to CPU/RAM: lower --ctx or pick a smaller model.');
for (const r of summary) {
  const ok = pct(r.json, r.n) >= 95 && pct(r.gateOk, r.n) >= 85;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${r.model}`);
}
