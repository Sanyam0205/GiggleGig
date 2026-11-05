// The fast lane: a light scout every ~90 minutes for postings from the last few hours, scored at once and alerted.
// Applying in the first day is the single biggest lever on callbacks, so this trades breadth for freshness.
import { loadSearch, loadTargets } from '../config.ts';
import { alertNewMatches } from '../notify.ts';
import { scout } from './scout.ts';
import { engineScore } from '../engine/index.ts';
import { tailor } from './tailor.ts';
import { db } from '../db.ts';

export async function fastlane() {
  const base = loadSearch();
  if (!base.fastlane.enabled) return { skipped: 'fast lane is off' };
  const f = base.fastlane;
  const cfg = structuredClone(base);
  const widest = base.sources.jobspy.locations[0];   // the candidate's broadest location: this lane trades breadth for freshness
  cfg.queries = base.queries.slice(0, f.queries);
  cfg.sources.jobspy = { ...base.sources.jobspy, hoursOld: f.hoursOld, locations: widest ? [widest] : [], resultsPerQuery: 25 };
  cfg.sources.apis = { ...base.sources.apis, places: base.sources.apis.places.slice(0, 1), jsearchPerRun: f.jsearchCalls, adzunaPerRun: 3, jooblePerRun: 3 };
  const targets = loadTargets().filter((t) => (t.tier ?? 3) <= f.tier);

  await scout(['ats', 'jobspy', 'jsearch', 'adzuna', 'jooble', 'startups'], { cfg, targets, label: 'fastlane' });
  await engineScore(base.engine?.evaluateFastlane ?? 3);
  const alerted = await alertNewMatches();

  // Automatic tailoring only for the very best fresh roles, and only when you've switched tailoring to automatic.
  let tailored = 0;
  if (base.automation.tailor === 'auto') {
    const ids = (db.prepare(`SELECT id FROM jobs WHERE status = 'shortlisted' AND fit_score >= ? AND first_seen >= datetime('now', '-6 hours')
      ORDER BY fit_score DESC LIMIT 2`).all(base.automation.autoTailorMin) as any[]).map((r) => r.id);
    if (ids.length) tailored = (await tailor(ids)).tailored;
  }
  return { alerted, tailored };
}
