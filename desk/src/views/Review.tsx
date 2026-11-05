import { useEffect, useMemo, useState } from 'react';
import { api, ago, useLive, useStream, type MatchRow } from '../api';
import { useToast } from '../App';
import { Classified, JdText, fitOf, isRemote, payOf, placeOf, quickChecks, weightOf, yearsAsked, yearsLabel } from '../parts/Classified';
import { Eligibility } from '../parts/Notice';
import { Icon } from '../parts/Icon';

type View = 'worth' | 'passed' | 'evaluated' | 'all';
const VIEWS: { key: View; label: string }[] = [
  { key: 'worth', label: 'Worth a look' }, { key: 'passed', label: 'Passed review' }, { key: 'evaluated', label: 'Evaluated' }, { key: 'all', label: 'Everything' },
];
const DONE = ['applied', 'referral-pending', 'referred', 'interviewing', 'offer', 'accepted', 'rejected', 'withdrawn', 'skipped', 'filtered'];
const narrow = () => window.matchMedia('(max-width: 1180px)').matches;
const BANDS = [
  { key: 'w5', title: 'Strong fits', sub: '4.5 and up' }, { key: 'w4', title: 'Good fits', sub: '4.0 to 4.4' }, { key: 'w3', title: 'Possible', sub: 'under 4.0, or not reviewed' },
];

/** Review: the classifieds on the left, the selected role's full read on the right, every decision one key away. */
export function Review({ openId }: { openId?: string }) {
  const toast = useToast();
  const [view, setView] = useState<View>('worth');
  const [only, setOnly] = useState({ remote: false, onsite: false, pay: false, jd: false });
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const { data, error } = useLive(() => api.matches({ minFit: view === 'all' ? undefined : 60, q }), [view, q], (m) => Boolean(m.jobsChanged));

  const rows = useMemo(() => (data ?? [])
    .filter((j) => (view === 'all' ? j.status !== 'filtered' : !DONE.includes(j.status)))
    .filter((j) => view !== 'passed' || j.triage?.verdict === 'PASS' || (j.score5 ?? 0) >= 3.5)
    .filter((j) => view !== 'evaluated' || Boolean(j.report_num))
    .filter((j) => (!only.remote || isRemote(j)) && (!only.onsite || !isRemote(j)) && (!only.pay || Boolean(payOf(j))) && (!only.jd || (j as any).jd_status === 'full'))
    .sort((a, b) => (fitOf(b) ?? 0) - (fitOf(a) ?? 0)), [data, view, only]);
  const current = rows.find((j) => j.id === (sel ?? openId)) ?? rows[0] ?? null;
  // On a phone a role opens as its own page (#/review/<id>), so the back button closes it.
  const phoneRole = openId && narrow() ? (data ?? []).find((j) => j.id === openId) ?? null : null;

  function open(j: MatchRow) {
    if (narrow()) window.location.hash = `#/review/${j.id}`;
    else setSel(j.id);
  }
  async function run(label: string, fn: () => Promise<unknown>) {
    try { await fn(); toast(label); } catch (e: any) { toast(e.message, true); }
  }
  const tailor = (j: MatchRow) => run(j.report_num ? 'Tailoring the CV: about 6 minutes. It lands under Today when ready.' : 'Evaluating first, then tailoring: about 10 minutes.', () => api.tailor(j.id));
  const evaluate = (j: MatchRow) => run('Evaluating in depth: about 3 minutes.', () => api.evaluate(j.id));
  const skip = (j: MatchRow) => run(`Skipped ${j.company}. It stays under Everything.`, () => api.setStatus(j.id, 'skipped', 'skipped on review'));
  const rescreen = (j: MatchRow) => run('Fetching the full description and reviewing again.', () => api.rescreen(j.id));

  // j/k move, t tailor, e evaluate, s skip, o open posting, x pick.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!current || e.metaKey || e.ctrlKey || e.altKey || /input|textarea|select/i.test((e.target as HTMLElement).tagName)) return;
      const i = rows.findIndex((j) => j.id === current.id);
      const move = (d: number) => { const n = rows[Math.max(0, Math.min(rows.length - 1, i + d))]; if (n) { setSel(n.id); document.querySelector(`[data-id="${n.id}"]`)?.scrollIntoView({ block: 'nearest' }); } };
      if (e.key === 'j') move(1);
      else if (e.key === 'k') move(-1);
      else if (e.key === 't') tailor(current);
      else if (e.key === 'e' && !current.report_num) evaluate(current);
      else if (e.key === 's') { skip(current); move(1); }
      else if (e.key === 'o' && current.apply_url) window.open(current.apply_url, '_blank', 'noopener');
      else if (e.key === 'x') setPicked((p) => { const n = new Set(p); n.has(current.id) ? n.delete(current.id) : n.add(current.id); return n; });
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rows, current]);

  const toggle = (k: keyof typeof only) => setOnly((o) => ({ ...o, [k]: !o[k], ...(k === 'remote' ? { onsite: false } : k === 'onsite' ? { remote: false } : {}) }));
  return (
    <>
      <header className="head">
        <h1>Situations Vacant</h1>
        <span className="meta">{rows.length} role{rows.length === 1 ? '' : 's'} · heaviest boxes fit best</span>
        <span className="sp" />
        <button className="btn frank" onClick={() => run('Searching every source. Roles appear as each finishes and get a quick review.', () => api.start('scout'))}>Search now</button>
      </header>
      <div className="toolbar">
        <div className="chips" role="tablist" aria-label="Which roles">
          {VIEWS.map((v) => <button key={v.key} role="tab" aria-selected={view === v.key} onClick={() => setView(v.key)}>{v.label}</button>)}
        </div>
        <div className="filters" aria-label="Filters">
          <button aria-pressed={only.remote} onClick={() => toggle('remote')}>Remote</button>
          <button aria-pressed={only.onsite} onClick={() => toggle('onsite')}>Office in India</button>
          <button aria-pressed={only.pay} onClick={() => toggle('pay')}>Pay stated</button>
          <button aria-pressed={only.jd} onClick={() => toggle('jd')}>Full JD</button>
        </div>
        <span className="sp" />
        <label className="search"><Icon name="search" size={16} /><input placeholder="Company or role" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search roles" /></label>
      </div>
      {error && <p className="notice">{error}</p>}
      {data && rows.length === 0 && (
        <div className="counter-empty">
          <h3>Nothing here yet.</h3>
          <p>{view === 'worth' ? 'Press Search now: roles appear as each source finishes, and each gets a quick review against your profile.' : 'Try Worth a look or Everything, or clear the filters.'}</p>
        </div>
      )}
      <div className="review-split">
        <div>
          {BANDS.map((b) => {
            const band = rows.filter((j) => weightOf(fitOf(j)) === b.key);
            if (!band.length) return null;
            return (
              <section key={b.key} className="band" aria-label={b.title}>
                <h2 className="band-head">{b.title}<span>{b.sub} · {band.length}</span></h2>
                <div className="cols" role="listbox" aria-label={b.title}>
                  {band.map((j) => (
                    <Classified key={j.id} j={j} selected={!narrow() && current?.id === j.id} onOpen={() => open(j)}
                      picked={picked.has(j.id)} onPick={(on) => setPicked((p) => { const n = new Set(p); on ? n.add(j.id) : n.delete(j.id); return n; })} />
                  ))}
                </div>
              </section>
            );
          })}
          {picked.size > 0 && (
            <div className="bulk" role="region" aria-label="Picked roles">
              <b>{picked.size} picked</b>
              <span className="sp" style={{ flex: 1 }} />
              <button className="btn ghost small" onClick={() => { run(`Evaluating ${picked.size} roles: about 3 minutes each.`, () => api.evaluateMany([...picked])); setPicked(new Set()); }}>Evaluate</button>
              <button className="btn frank small" onClick={() => { run(`Tailoring ${picked.size} CVs.`, () => api.tailorMany([...picked])); setPicked(new Set()); }}>Tailor CVs</button>
              <button className="btn ghost small" onClick={() => setPicked(new Set())}>Clear</button>
            </div>
          )}
        </div>
        {current && !phoneRole && <Reader j={current} onTailor={tailor} onEvaluate={evaluate} onSkip={skip} onRescreen={rescreen} />}
      </div>
      {phoneRole && (
        <div className="sheet-wrap phone-read" role="dialog" aria-modal="true" aria-label={phoneRole.title}>
          <a className="scrim" href="#/review" aria-label="Back to the list" />
          <div className="sheet">
            <div className="top"><a className="btn ghost small" href="#/review">Back to the list</a><span className="sp" style={{ flex: 1 }} /></div>
            <Reader j={phoneRole} onTailor={tailor} onEvaluate={evaluate} onSkip={(j) => { skip(j); window.location.hash = '#/review'; }} onRescreen={rescreen} />
          </div>
        </div>
      )}
    </>
  );
}

/** The full read of one role: the numbers, the checks, why it is here, the whole description and what to do next. */
function Reader({ j, onTailor, onEvaluate, onSkip, onRescreen }: {
  j: MatchRow; onTailor: (j: MatchRow) => void; onEvaluate: (j: MatchRow) => void; onSkip: (j: MatchRow) => void; onRescreen: (j: MatchRow) => void;
}) {
  const [full, setFull] = useState<any>(null);
  const { data: cfg } = useLive(api.config, [], () => false);
  useEffect(() => { setFull(null); api.job(j.id).then(setFull).catch(() => setFull(null)); }, [j.id]);
  useStream((m) => { if (m.jobsChanged) api.job(j.id).then(setFull).catch(() => {}); });
  const fit = fitOf(j);
  const jd = (full?.jd_status ?? (j as any).jd_status) as string | undefined;
  const summary = full?.engine?.summary;
  const pref = cfg?.search?.preferences ?? {};
  const years = yearsAsked(full?.description);
  const engineChecks = Boolean(j.eligibility?.length || (j as any).dimensions);
  return (
    <aside className="reader" aria-label={`${j.title} at ${j.company}`}>
      <h2>{j.title}</h2>
      <div className="meta"><b>{j.company}</b> · {placeOf(j) ?? 'Location not stated'} · found {ago(j.first_seen)}</div>
      <div className="q">
        <div>{j.report_num ? 'Evaluation' : 'Quick review'}<b>{fit != null ? fit.toFixed(1) : '—'}</b></div>
        <div>Pay<b>{payOf(j) ?? 'Not stated'}</b></div>
        <div>Experience<b>{full ? yearsLabel(years) : '…'}</b></div>
        <div>Description<b>{jd === 'full' ? 'Full' : jd === 'missing' ? 'Not found' : jd === 'partial' ? 'Partial' : 'Not checked'}</b></div>
        {j.decision && <div>Verdict<b>{j.decision}</b></div>}
      </div>
      {engineChecks ? <Eligibility j={j} /> : full && <Eligibility j={{ eligibility: quickChecks(j, full.description, { floor: pref.minAnnualSalary, experience: pref.experience }), dimensions: null } as any} />}
      <h3>Why it is here</h3>
      <p className="proof">{summary?.top_strengths?.[0] ?? j.triage?.reason ?? j.rationale ?? 'Not reviewed yet.'}</p>
      {summary?.hard_stops?.length > 0 && <p className="notice small" style={{ marginTop: 6 }}><b>Hard stop:</b> {summary.hard_stops[0]}</p>}
      <h3>Job description</h3>
      {jd !== 'full' && <p className="small muted">{jd ? 'Only part of the description could be read' : 'Not yet checked against the full posting'}{j.apply_url ? '; the posting has the rest' : ''}. <button className="link" onClick={() => onRescreen(j)}>Fetch it and review again</button></p>}
      {full ? <JdText text={full.description || 'No description stored for this role.'} /> : <div className="jd"><p>Loading…</p></div>}
      <div className="acts">
        <button className="btn frank" onClick={() => onTailor(j)}>{j.report_num ? 'Tailor CV' : 'Evaluate & tailor'}</button>
        {!j.report_num && <button className="btn ghost" onClick={() => onEvaluate(j)}>Evaluate</button>}
        {j.apply_url && <a className="btn ghost" href={j.apply_url} target="_blank" rel="noreferrer">Posting <Icon name="open" size={14} /></a>}
        <button className="btn reject" onClick={() => onSkip(j)}>Skip</button>
      </div>
      <p className="keys"><kbd>j</kbd><kbd>k</kbd> move · <kbd>t</kbd> tailor · <kbd>e</kbd> evaluate · <kbd>s</kbd> skip · <kbd>o</kbd> posting · <kbd>x</kbd> pick · <a href={`#/review/job/${j.id}`}>History, contacts and notes</a></p>
    </aside>
  );
}
