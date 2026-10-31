// Warm paths: your LinkedIn connections, matched to the companies you're applying to.
// Export: LinkedIn → Settings → Data privacy → Get a copy of your data → Connections → Connections.csv
import { db } from './db.ts';
import { normCompany } from './pipeline/ingest.ts';

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** Imports LinkedIn's Connections.csv (it starts with a few "Notes" lines before the header). Existing contacts are updated, not duplicated. */
export function importConnections(csv: string) {
  const rows = parseCsv(csv.replace(/^﻿/, ''));
  const headerAt = rows.findIndex((r) => r.includes('First Name') && r.includes('Company'));
  if (headerAt === -1) throw new Error('Not a LinkedIn Connections.csv (no "First Name … Company" header found)');
  const h = rows[headerAt];
  const col = (name: string) => h.indexOf(name);
  const [fn, ln, url, email, company, position, connected] =
    ['First Name', 'Last Name', 'URL', 'Email Address', 'Company', 'Position', 'Connected On'].map(col);

  const find = db.prepare('SELECT id, relationship FROM contacts WHERE linkedin = ? OR (company = ? AND name = ?)');
  const insert = db.prepare(`INSERT INTO contacts (company, name, role, linkedin, email, relationship, notes) VALUES (?, ?, ?, ?, ?, 'connected', ?)`);
  const update = db.prepare(`UPDATE contacts SET company = ?, role = ?, linkedin = COALESCE(?, linkedin), email = COALESCE(?, email),
    relationship = CASE WHEN relationship IN ('cold', 'requested') THEN 'connected' ELSE relationship END WHERE id = ?`);
  let added = 0, updated = 0;
  db.exec('BEGIN');
  try {
    for (const r of rows.slice(headerAt + 1)) {
      const name = `${r[fn] ?? ''} ${r[ln] ?? ''}`.trim();
      const co = (r[company] ?? '').trim();
      if (!name || !co) continue;
      const existing = find.get(r[url] || '', co, name) as any;
      if (existing) { update.run(co, r[position] || null, r[url] || null, r[email] || null, existing.id); updated++; }
      else { insert.run(co, name, r[position] || null, r[url] || null, r[email] || null, r[connected] ? `Connected ${r[connected]}` : null); added++; }
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { added, updated, total: added + updated };
}

const WARMTH: Record<string, number> = { referrer: 0, warm: 1, connected: 2, requested: 3, cold: 4 };

/** People at this company, warmest first. Engineers outrank recruiters outrank everyone else for referral asks. */
export function warmPaths(company: string) {
  const key = normCompany(company);
  const rows = (db.prepare('SELECT * FROM contacts').all() as any[]).filter((c) => {
    const k = normCompany(c.company);
    return k === key || (k.length > 3 && key.length > 3 && (k.startsWith(key) || key.startsWith(k)));
  });
  const roleRank = (r = '') => (/engineer|developer|sde|swe|architect|tech lead/i.test(r) ? 0 : /recruit|talent|hr\b|people/i.test(r) ? 1 : 2);
  return rows.sort((a, b) => (WARMTH[a.relationship] ?? 5) - (WARMTH[b.relationship] ?? 5) || roleRank(a.role) - roleRank(b.role));
}

/** Count of warm contacts per normalized company, for list views. */
export function warmCounts(): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of db.prepare(`SELECT company FROM contacts WHERE relationship != 'cold'`).all() as any[]) {
    const k = normCompany(c.company);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}
