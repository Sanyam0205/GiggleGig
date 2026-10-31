import { useState } from 'react';
import { useToast } from '../App';
import { Icon } from './Icon';

export interface KitField { label: string; answer: string; kind?: string; source?: string; flag?: string }

/** Every answer the application form will ask for, one copy button each. */
export function Kit({ kit }: { kit: { fields?: KitField[]; ats?: string; notes?: string; sources?: string[] } }) {
  const toast = useToast();
  const [copied, setCopied] = useState<number | null>(null);
  async function copy(i: number, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(i); window.setTimeout(() => setCopied(null), 1500); }
    catch { toast('Copy blocked by the browser — select the text instead.', true); }
  }
  const flagged = (kit.fields ?? []).filter((f) => f.flag).length;
  return (
    <div className="kit">
      {flagged > 0 && <p className="notice small">{flagged} field{flagged > 1 ? 's need' : ' needs'} your input before you apply.</p>}
      {(kit.fields ?? []).map((f, i) => (
        <div key={i} className={`kit-row${f.flag ? ' flagged' : ''}`}>
          <div className="kit-q"><span className="t">{f.label}</span>{f.source && <span className="label muted">{f.source}</span>}</div>
          <div className="kit-a">{f.answer || <span className="muted">{f.flag ?? 'blank'}</span>}</div>
          {f.answer && (
            <button className="iconbtn" onClick={() => copy(i, f.answer)} aria-label={`Copy answer for ${f.label}`}>
              <Icon name={copied === i ? 'check' : 'copy'} size={16} />
            </button>
          )}
        </div>
      ))}
      {kit.notes && <p className="muted small" style={{ marginTop: 8 }}>{kit.notes}</p>}
    </div>
  );
}
