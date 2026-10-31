import type { ReactNode } from 'react';
// Mirrors os/render.ts so the desk preview matches the PDF the agent rendered.
function inline(s: string) {
  const parts: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[(.+?)\]\((.+?)\)/g;
  let last = 0; let m: RegExpExecArray | null; let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push(s.slice(last, m.index));
    parts.push(m[1] ? <strong key={k++}>{m[1]}</strong> : <a key={k++} href={m[3]} target="_blank" rel="noreferrer">{m[2]}</a>);
    last = re.lastIndex;
  }
  if (last < s.length) parts.push(s.slice(last));
  return parts;
}

export function Resume({ md }: { md: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    if (line.startsWith('# ')) { flush(); blocks.push(<h1 key={blocks.length}>{inline(line.slice(2))}</h1>); continue; }
    if (line.startsWith('## ')) { flush(); blocks.push(<h2 key={blocks.length}>{inline(line.slice(3))}</h2>); continue; }
    if (/^\s*[-•]\s+/.test(line)) { list.push(line.replace(/^\s*[-•]\s+/, '')); continue; }
    flush();
    blocks.push(<p key={blocks.length}>{inline(line)}</p>);
  }
  flush();
  return <article className="paper">{blocks}</article>;
}
