// The whole search: find roles and score them as they arrive, so a slow source (JobSpy takes many minutes) doesn't hold back the matches.
import { db } from '../db.ts';
import { engineScore } from '../engine/index.ts';
import { triage } from '../engine/triage.ts';
import { scout } from './scout.ts';

const EVERY_MS = 90_000;

export async function search(only?: string[]) {
  let finished = false;
  const found = scout(only).finally(() => { finished = true; });
  while (!finished) {
    await Promise.race([found, new Promise((done) => setTimeout(done, EVERY_MS))]);
    const waiting = db.prepare(`SELECT 1 FROM jobs WHERE status = 'sourced' AND triage IS NULL AND report_num IS NULL LIMIT 1`).get();
    if (!finished && waiting) await triage();
  }
  const stats = await found;
  return { ...stats, ...(await engineScore()) };
}
