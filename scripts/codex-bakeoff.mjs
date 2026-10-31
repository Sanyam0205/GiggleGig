#!/usr/bin/env node
// Triage bake-off before moving the role to another model: each variant against the stored reference answers (data/bakeoff/fixtures.json).
//   node scripts/codex-bakeoff.mjs [--limit 10] codex:gpt-5.6-terra:medium claude:haiku
// Include the reference model itself: its rerun is the noise floor. Read the disagreements too, a missed hard disqualifier counts more than a percentage.
// Each Codex call starts around 28k input tokens: a free plan's allowance is gone within a couple of hundred calls.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const at = argv.indexOf('--limit');
const limit = at === -1 ? 10 : Number(argv.splice(at, 2)[1]);
const variants = argv;
const fx = JSON.parse(readFileSync('data/bakeoff/fixtures.json', 'utf8'));
fx.items = fx.items.slice(0, limit);
const CODEX = process.env.CODEX_BIN ?? (existsSync('/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex') ? '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex' : 'codex');
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['verdict', 'score', 'reason'],
  properties: { verdict: { type: 'string', enum: ['PASS', 'MARGINAL', 'FAIL', 'SKIP'] }, score: { type: 'number' }, reason: { type: 'string' } },
};
const dir = mkdtempSync(join(tmpdir(), 'bake-'));
const schemaFile = join(dir, 'schema.json');
writeFileSync(schemaFile, JSON.stringify(SCHEMA));

function run(cmd, args, input) {
  return new Promise((resolve) => {
    const c = spawn(cmd, args, { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    const t = setTimeout(() => c.kill('SIGTERM'), 240_000);
    c.stdout.on('data', (d) => { out += d; });
    c.stderr.on('data', (d) => { err += d; });
    c.stdin.end(input);
    c.on('close', (code) => { clearTimeout(t); resolve({ code, out, err }); });
  });
}

async function callCodex(model, effort, it) {
  const r = await run(CODEX, ['exec', '--json', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config', '-s', 'read-only',
    '-m', model, '-c', `model_reasoning_effort=${effort}`, '-C', dir, '--output-schema', schemaFile, '-'],
    `${fx.system}\n\n---\n\n${it.user}\n\nDo not use any tools. Respond with the JSON only.`);
  let text = '', usage = null;
  for (const l of r.out.split('\n')) {
    try { const m = JSON.parse(l); if (m.item?.type === 'agent_message') text = m.item.text; if (m.usage) usage = m.usage; } catch { /* not JSON */ }
  }
  if (!text) throw new Error(r.out.match(/"message":"([^"]+)/)?.[1] ?? r.err.slice(-200) ?? 'no answer');
  return { out: JSON.parse(text), usage };
}

async function callClaude(model, it) {
  const r = await run('claude', ['-p', '--output-format', 'json', '--no-session-persistence', '--tools=', '--strict-mcp-config', '--model', model,
    '--json-schema', JSON.stringify(SCHEMA), '--append-system-prompt', fx.system], it.user);
  const j = JSON.parse(r.out);
  return { out: j.structured_output ?? JSON.parse(j.result), usage: j.usage, cost: j.total_cost_usd };
}

const gate = (v) => (v === 'PASS' || v === 'MARGINAL' ? 'go' : 'no');
const results = {};
await Promise.all(variants.map(async (v) => {
  const [provider, model, effort] = v.split(':');
  const rows = [];
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < fx.items.length) {
      const it = fx.items[next++];
      const t0 = Date.now();
      try {
        const r = provider === 'codex' ? await callCodex(model, effort, it) : await callClaude(model, it);
        rows.push({ id: it.id, ref: it.reference, got: r.out, ms: Date.now() - t0, cost: r.cost ?? null });
      } catch (e) { rows.push({ id: it.id, ref: it.reference, error: String(e.message).slice(0, 200), ms: Date.now() - t0 }); }
    }
  }));
  results[v] = rows;
}));

console.log('variant                      ok   gate-agree  exact  |Δscore|  p50s  p95s  false-go  false-no');
for (const [v, rows] of Object.entries(results)) {
  const ok = rows.filter((r) => r.got);
  const lat = rows.map((r) => r.ms / 1000).sort((a, b) => a - b);
  const pct = (n) => `${Math.round((n / (ok.length || 1)) * 100)}%`;
  const falseGo = ok.filter((r) => gate(r.got.verdict) === 'go' && gate(r.ref.verdict) === 'no').length;
  const falseNo = ok.filter((r) => gate(r.got.verdict) === 'no' && gate(r.ref.verdict) === 'go').length;
  console.log(`${v.padEnd(28)} ${String(ok.length).padStart(2)}/${rows.length}  ${pct(ok.filter((r) => gate(r.got.verdict) === gate(r.ref.verdict)).length).padStart(9)}  ${pct(ok.filter((r) => r.got.verdict === r.ref.verdict).length).padStart(5)}  ${(ok.reduce((s, r) => s + Math.abs(r.got.score - r.ref.score), 0) / (ok.length || 1)).toFixed(2).padStart(7)}  ${lat[Math.floor(lat.length / 2)].toFixed(0).padStart(4)}  ${lat[Math.floor(lat.length * 0.95)].toFixed(0).padStart(4)}  ${String(falseGo).padStart(8)}  ${String(falseNo).padStart(8)}`);
}
for (const [v, rows] of Object.entries(results)) for (const r of rows) if (r.error) { console.log(`${v}: ${r.error}`); break; }
