// Reads engine evaluation reports (reports/NNN-company-date.md) into the fields the desk shows.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../db.ts';
import { ENGINE_FILES, yaml } from './paths.ts';

export interface MachineSummary {
  company: string; role: string; score: number; legitimacy_tier: string; archetype: string;
  final_decision: 'Apply' | 'Consider' | 'Research first' | 'Skip'; confidence: string; risk_level: string;
  hard_stops: string[]; soft_gaps: string[]; top_strengths: string[]; next_action: string; work_auth: string;
  advertised_comp: string | null; posting_location: string | null; discard_reasons: string[];
  requirement_importance: { requirement: string; jd_signal: string | null; evidence: string; importance: string; match: string }[];
  score_evidence: Record<string, string>;
  [k: string]: unknown;
}

export interface ParsedReport { num: string; path: string; header: Record<string, string>; summary: MachineSummary | null; verdict: string | null; markdown: string }

export function reportPath(num: string) {
  if (!existsSync(ENGINE_FILES.reports)) return null;
  const padded = num.padStart(3, '0');
  const f = readdirSync(ENGINE_FILES.reports).find((n) => n.startsWith(`${padded}-`) && n.endsWith('.md') && !n.includes('RESERVED'));
  return f ? join(ENGINE_FILES.reports, f) : null;
}

export function parseReport(path: string): ParsedReport {
  const markdown = readFileSync(path, 'utf8');
  const num = (/(\d{3,})-/.exec(path.split('/').pop() ?? '')?.[1]) ?? '';
  const header: Record<string, string> = {};
  for (const m of markdown.slice(0, 3000).matchAll(/^\*\*([A-Za-z ]+):\*\*\s*(.+)$/gm)) header[m[1].trim().toLowerCase()] = m[2].trim();
  const block = /## Machine Summary\s+```ya?ml\n([\s\S]*?)```/.exec(markdown)?.[1];
  let summary: MachineSummary | null = null;
  if (block) { try { summary = yaml.load(block) as MachineSummary; } catch { summary = null; } }
  const verdict = /## Verdict \(lead\)\s+([\s\S]*?)(?=\n## |\n---|$)/.exec(markdown)?.[1]?.trim().split('\n')[0] ?? null;
  return { num, path, header, summary, verdict, markdown };
}

/** Score 1–5 → the 0–100 field older desk code sorts and thresholds on (4.0 → 80). */
export const to100 = (s: number) => Math.round(s * 20);

/** Our pipeline bucket for an Evaluated row, from the engine's decision. */
export function bucketFor(decision?: string, score?: number) {
  if (decision === 'Skip') return 'skipped';
  if (decision === 'Apply' || (score ?? 0) >= 4.0) return 'shortlisted';
  if ((score ?? 0) < 3.5) return 'skipped';
  return 'needs-referral';                                  // Consider / Research first: get a referral first
}

/** Copies a report's verdict into the job row. */
export function applyReport(jobId: string, r: ParsedReport) {
  const s = r.summary;
  const score = s?.score ?? Number(/([\d.]+)\s*\/\s*5/.exec(r.header.score ?? '')?.[1] ?? NaN);
  db.prepare(`UPDATE jobs SET report_num = ?, report_path = ?, score5 = ?, fit_score = ?, decision = ?, confidence = ?, legitimacy = ?,
      archetype = ?, summary = ?, engine_status = COALESCE(engine_status, 'Evaluated'), updated_at = datetime('now') WHERE id = ?`)
    .run(r.num, r.path, Number.isFinite(score) ? score : null, Number.isFinite(score) ? to100(score) : null,
      s?.final_decision ?? r.header.decision ?? null, s?.confidence ?? null, s?.legitimacy_tier ?? r.header.legitimacy ?? null,
      s?.archetype ?? r.header.archetype ?? null, s ? JSON.stringify(s) : null, jobId);
  return { score, decision: s?.final_decision ?? r.header.decision };
}
