import type { ReactNode } from 'react';

// Small, dependency-free renderer for evaluation reports: headings, paragraphs, lists, tables, code fences, **bold**, links.
function inline(s: string, key = 0): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0, m: RegExpExecArray | null, k = key;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[1]) out.push(<strong key={k++}>{m[1]}</strong>);
    else if (m[2]) out.push(<code key={k++}>{m[2]}</code>);
    else out.push(<a key={k++} href={m[4]} target="_blank" rel="noreferrer">{m[3]}</a>);
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++;
      blocks.push(<pre key={blocks.length}><code>{body.join('\n')}</code></pre>);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { const L = `h${Math.min(h[1].length + 1, 5)}` as 'h2'; blocks.push(<L key={blocks.length}>{inline(h[2])}</L>); i++; continue; }
    if (/^\|/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        if (!/^\|\s*:?-{2,}/.test(lines[i])) rows.push(lines[i].replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={blocks.length} className="md-table"><table className="ledger compact">
          <thead><tr>{head.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead>
          <tbody>{body.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{inline(c)}</td>)}</tr>)}</tbody>
        </table></div>,
      );
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''));
      blocks.push(<ul key={blocks.length}>{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>);
      continue;
    }
    if (/^>\s?/.test(line)) { blocks.push(<blockquote key={blocks.length}>{inline(line.replace(/^>\s?/, ''))}</blockquote>); i++; continue; }
    if (/^---+$/.test(line.trim())) { blocks.push(<hr key={blocks.length} />); i++; continue; }
    if (!line.trim()) { i++; continue; }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\||```|\s*([-*]|\d+\.)\s|>)/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={blocks.length}>{inline(para.join(' '))}</p>);
  }
  return <div className="md">{blocks}</div>;
}
