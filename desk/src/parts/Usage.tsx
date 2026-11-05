// Plan limits and quotas, so a run is never started blind.

const pct = (n?: number) => (n == null ? '—' : `${Math.round(n * 100)}%`);
const when = (s?: number) => (s ? new Date(s * 1000).toLocaleString('en-IN', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '');

export function UsagePanel({ l }: { l: any }) {
  const w = l.claude?.windows ?? {};
  const row = (name: string, v: string, note: string, warn = false) => (
    <tr><td><div className="t">{name}</div></td><td className={`r num${warn ? ' err' : ''}`}>{v}</td><td className="sub">{note}</td></tr>
  );
  return (
    <section className="source" style={{ marginBottom: 18 }}>
      <h3>Usage and limits</h3>
      <table className="ledger compact" style={{ marginTop: 6 }}>
        <tbody>
          {row('Claude session (5 h)', pct(w.five_hour?.utilization), w.five_hour ? `resets ${when(w.five_hour.resetsAt)}` : 'shown after the first agent run', (w.five_hour?.utilization ?? 0) >= 0.9)}
          {row('Claude week (7 days)', pct(w.seven_day?.utilization), w.seven_day ? `resets ${when(w.seven_day.resetsAt)}` : '', (w.seven_day?.utilization ?? 0) >= 0.9)}
          {l.claude?.status === 'rejected' && row('Claude', 'limit hit', 'new runs are refused until it resets', true)}
          {row('Codex', l.codex?.status === 'rejected' ? 'limit hit' : l.codex ? 'ok' : '—', l.codex?.message ?? 'used only by roles routed to Codex', l.codex?.status === 'rejected')}
          {row('JSearch (month)', `${l.jsearch.used}/${l.jsearch.limit}`, 'free-tier requests; stops at the limit', l.jsearch.used >= l.jsearch.limit)}
          {row('Firecrawl calls today', String(l.firecrawl.callsToday), 'each uses Firecrawl credits')}
          {row('Agent runs today', String(l.runsToday.n ?? 0), `${l.runsToday.failed ?? 0} failed · ${l.runsToday.running ?? 0} running${l.runsToday.usd ? ` · ≈$${l.runsToday.usd} at API prices` : ''}`)}
        </tbody>
      </table>
    </section>
  );
}
