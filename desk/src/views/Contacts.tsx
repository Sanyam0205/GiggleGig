import { useRef, useState } from 'react';
import { api, ago, useLive } from '../api';
import { useToast } from '../App';

const REL_TAG: Record<string, string> = { cold: 'ink', requested: 'violet', connected: 'violet', warm: 'green', referrer: 'green' };

export function Contacts({ embedded = false }: { embedded?: boolean }) {
  const toast = useToast();
  const { data, refresh } = useLive(api.contacts, [], (m) => Boolean(m.queueChanged));
  const [q, setQ] = useState('');
  const file = useRef<HTMLInputElement>(null);

  async function onFile(f: File | undefined) {
    if (!f) return;
    try {
      const r = await api.importContacts(await f.text());
      toast(`Imported ${r.total} connections (${r.added} new, ${r.updated} updated). Warm paths now show on every match.`);
      refresh();
    } catch (e: any) { toast(e.message, true); }
    if (file.current) file.current.value = '';
  }

  const rows = (data ?? []).filter((c) => !q || `${c.name} ${c.company} ${c.role ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <header className="head">
        {!embedded && <h1>Contacts</h1>}
        <span className="meta">{data?.length ?? 0} people · warm paths into the companies you're applying to.</span>
        <span className="sp" />
        <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <button className="btn" onClick={() => file.current?.click()}>Import LinkedIn connections</button>
      </header>
      <details className="how">
        <summary>How to export your connections (2 minutes)</summary>
        <ol>
          <li>LinkedIn → <b>Me</b> → <b>Settings &amp; Privacy</b> → <b>Data privacy</b> → <b>Get a copy of your data</b>.</li>
          <li>Pick <b>Connections</b> only → <b>Request archive</b>. LinkedIn emails a link, usually within 10 minutes.</li>
          <li>Unzip it and import <span className="mono">Connections.csv</span> here. Re-import any time; nobody is duplicated.</li>
        </ol>
      </details>
      {data && data.length === 0 && (
        <div className="counter-empty">
          <h3>No contacts yet.</h3>
          <p>Import your LinkedIn connections to see who you already know at every company you match. <span className="mono">/connection-request</span> adds new people as it drafts notes.</p>
        </div>
      )}
      {data && data.length > 0 && (
        <>
          <div className="toolbar"><label className="search"><input placeholder="Name, company or role" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search contacts" /></label></div>
          <table className="ledger">
            <thead><tr><th>Name</th><th>Company</th><th>Relationship</th><th className="hide-sm">Last contact</th></tr></thead>
            <tbody>
              {rows.slice(0, 500).map((c) => (
                <tr key={c.id}>
                  <td><div className="t">{c.linkedin ? <a href={c.linkedin} target="_blank" rel="noreferrer">{c.name}</a> : c.name}</div><div className="sub">{c.role}</div></td>
                  <td><a href={`#/companies/${encodeURIComponent(c.company)}`}>{c.company}</a></td>
                  <td><span className={`tag ${REL_TAG[c.relationship] ?? 'ink'}`}>{c.relationship}</span></td>
                  <td className="hide-sm mono sub">{c.last_contact_at ? ago(c.last_contact_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
