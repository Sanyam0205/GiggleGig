import { useEffect, useState } from 'react';
import { api, formatPay, type MatchRow } from '../api';
import { useToast } from '../App';
import { platformName } from '../views/Matches';

const IN_FLIGHT = ['tailoring', 'awaiting-approval', 'approved', 'applied', 'referral-pending', 'referred', 'interviewing', 'offer', 'accepted'];

/** Each company gets a stable dark tint, so the wall reads as artwork without a single image. */
function tint(company: string) {
  let h = 0;
  for (const c of company) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  return { background: `linear-gradient(155deg, hsl(${hue} 32% 26%), hsl(${(hue + 28) % 360} 28% 15%))` };
}

const pay = (j: MatchRow) => formatPay(j.salary_min, j.salary_max, j.currency)
  ?? (j.salaryEst ? `${formatPay(j.salaryEst.min, j.salaryEst.max, j.salaryEst.currency)} est.` : null);

export interface WallRow { key: string; title: string; sub?: string; rows: MatchRow[]; more?: { label: string; href: string } }

/** Rows of company tiles. Focusing a tile expands it in place and dims every other row. Escape closes. */
export function Wall({ rows, base }: { rows: WallRow[]; base: string }) {
  const toast = useToast();
  const [focus, setFocus] = useState<{ row: string; id: string } | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFocus(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const visible = rows.filter((r) => r.rows.length);
  if (!visible.length) return null;

  async function tailor(id: string) {
    try { await api.tailor(id); toast('Tailoring. The job is now in Pipeline → Being worked on, then Waiting for you.'); }
    catch (e: any) { toast(e.message, true); }
  }
  const open = (id: string) => { window.location.hash = `${base}/job/${id}`; };

  return (
    <div className={`wall${focus ? ' has-focus' : ''}`}>
      {visible.map((r) => (
        <section key={r.key} className={`wall-row${focus?.row === r.key ? ' active' : ''}`} aria-label={r.title}>
          <h2>{r.title}{r.sub && <span>{r.sub}</span>}{r.more && <a href={r.more.href}>{r.more.label}</a>}</h2>
          <div className="tile-rail">
            {r.rows.slice(0, 14).map((j) => focus?.row === r.key && focus.id === j.id ? (
              <article key={j.id} className="tile-focus" aria-label={`${j.title} at ${j.company}`}>
                <div className="art" style={tint(j.company)}>
                  <span className="fitchip">{j.fit_score ?? '—'} fit</span>
                  <span className="co">{j.company}</span>
                </div>
                <div className="fx">
                  <div className="t">{j.title}</div>
                  <div className="s">{j.location ?? 'Location n/a'}{j.remote ? ' · remote' : ''}</div>
                  {pay(j) && <div className="pay">{pay(j)}</div>}
                  <div className="srcs">{[...new Set<string>(JSON.parse(j.sources).map(platformName))].map((p) => <span key={p} className="src">{p}</span>)}{j.warm ? <span className="tag green">you know {j.warm}</span> : null}</div>
                  {j.rationale && <div className="why">{j.rationale}</div>}
                  <div className="btns">
                    {!IN_FLIGHT.includes(j.status)
                      ? <button className="btn frank small" onClick={() => tailor(j.id)}>Tailor</button>
                      : <span className="tag violet">{j.status.replace(/-/g, ' ')}</span>}
                    <button className="btn ghost small" onClick={() => open(j.id)}>Open</button>
                    {j.apply_url && <a className="btn ghost small" href={j.apply_url} target="_blank" rel="noreferrer">Posting</a>}
                  </div>
                </div>
              </article>
            ) : (
              <button key={j.id} className="tile" onClick={() => setFocus({ row: r.key, id: j.id })} aria-label={`${j.company}: ${j.title}, fit ${j.fit_score ?? 'unscored'}`}>
                <div className="art" style={tint(j.company)}>
                  <span className="co">{j.company}</span>
                  <span className="fitchip">{j.fit_score ?? '—'} fit</span>
                </div>
                <div className="meta">
                  <div className="t">{j.title}</div>
                  <div className="s">{[j.location?.split(',')[0], pay(j), platformName(JSON.parse(j.sources)[0] ?? '')].filter(Boolean).join(' · ')}</div>
                </div>
              </button>
            ))}
            {r.rows.length > 14 && r.more && <a className="tile-more" href={r.more.href}>See all {r.rows.length}</a>}
          </div>
        </section>
      ))}
    </div>
  );
}

/** The standard grouping for matches: best first, then referral-first, then the freshest. */
export function matchRows(all: MatchRow[], thresholds: { skip: number; apply: number }): WallRow[] {
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString().replace('T', ' ').slice(0, 19);
  const scored = all.filter((j) => j.fit_score != null);
  const byPlatform = new Map<string, MatchRow[]>();
  for (const j of scored.filter((j) => (j.fit_score ?? 0) >= thresholds.skip)) {
    const p = platformName(JSON.parse(j.sources)[0] ?? '');
    byPlatform.set(p, [...(byPlatform.get(p) ?? []), j]);
  }
  return [
    { key: 'top', title: `For you · ${thresholds.apply}+`, sub: 'apply now; tailoring is one click', rows: scored.filter((j) => (j.fit_score ?? 0) >= thresholds.apply) },
    { key: 'ref', title: 'Need a referral first', sub: `${thresholds.skip}–${thresholds.apply - 1} fit`, rows: scored.filter((j) => (j.fit_score ?? 0) >= thresholds.skip && (j.fit_score ?? 0) < thresholds.apply) },
    { key: 'fresh', title: 'Fresh today', sub: 'found in the last 24 hours', rows: scored.filter((j) => j.first_seen >= dayAgo && (j.fit_score ?? 0) >= thresholds.skip) },
    { key: 'warm', title: 'You know someone there', sub: 'warm paths for a referral', rows: scored.filter((j) => (j.warm ?? 0) > 0 && (j.fit_score ?? 0) >= thresholds.skip) },
    ...[...byPlatform.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 4)
      .map(([p, rows]) => ({ key: `p:${p}`, title: `On ${p}`, sub: `${rows.length} matches`, rows })),
  ];
}
