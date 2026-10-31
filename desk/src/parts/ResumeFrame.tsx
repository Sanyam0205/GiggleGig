import { useEffect, useRef, useState } from 'react';
import { Resume } from './Resume';

/** The rendered resume.html at true A4 proportions, scaled to the column. Falls back to the markdown twin for older resumes. */
export function ResumeFrame({ html, md, stamp }: { html?: string | null; md?: string | null; stamp?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.7);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / 794)); // 210mm at 96dpi
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (!html) return md ? <Resume md={md} /> : <div className="notice">No resume for this job yet.</div>;
  return (
    <div className="a4" ref={wrap} style={{ height: 1123 * scale }}>
      <iframe title="Tailored resume" src={`${html}${stamp ? `?v=${encodeURIComponent(stamp)}` : ''}`}
        style={{ transform: `scale(${scale})`, width: 794, height: 1123 }} />
    </div>
  );
}
