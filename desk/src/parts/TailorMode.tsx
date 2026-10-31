import { useEffect, useState } from 'react';
import { api } from '../api';
import { useToast } from '../App';

/** Automatic: the briefing tailors every shortlisted role at or above the bar. Manual: only what you press Tailor on. */
export function TailorMode() {
  const toast = useToast();
  const [mode, setMode] = useState<{ tailor: 'auto' | 'manual'; autoTailorMin: number } | null>(null);
  useEffect(() => { api.sources().then((s) => setMode(s.automation)); }, []);
  if (!mode) return null;

  async function set(patch: Partial<typeof mode>) {
    const next = { ...mode!, ...patch };
    setMode(next);
    try {
      await api.settings({ automation: patch });
      toast(next.tailor === 'auto' ? `Automatic: the briefing tailors roles at ${next.autoTailorMin}+ fit.` : 'Manual: nothing is tailored until you press Tailor.');
    } catch (e: any) { toast(e.message, true); }
  }

  return (
    <div className="mode" role="radiogroup" aria-label="Resume tailoring">
      <span className="label muted">Tailoring</span>
      <button role="radio" aria-checked={mode.tailor === 'auto'} onClick={() => set({ tailor: 'auto' })}>Automatic</button>
      <button role="radio" aria-checked={mode.tailor === 'manual'} onClick={() => set({ tailor: 'manual' })}>Manual</button>
      {mode.tailor === 'auto' && (
        <label className="bar-at">
          at
          <select className="field" value={mode.autoTailorMin} onChange={(e) => set({ autoTailorMin: Number(e.target.value) })} aria-label="Minimum fit to auto-tailor">
            {[60, 65, 70, 75, 80, 85, 90].map((v) => <option key={v} value={v}>{v}+ fit</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
