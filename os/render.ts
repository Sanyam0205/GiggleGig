// resume.json → print-grade, ATS-safe HTML → one-page PDF via a headless Chromium.
// The layout mirrors a classic engineering resume: centred name, ruled small-caps sections, dates flush right.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';

export interface ResumeEntry {
  title: string;               // role or degree
  org: string;                 // company or institution
  location?: string;
  start?: string;              // "Jul 2025"
  end?: string;                // "Present"
  meta?: string;               // e.g. "CGPA 8.04/10" or a stack line for projects
  link?: string;
  bullets?: string[];          // **bold** marks the outcome phrase; nothing else is formatted
}

export interface Resume {
  name: string;
  contact: { phone?: string; email?: string; location?: string; links?: { label: string; url: string }[] };
  headline?: string;           // optional one-line target title under the name
  summary?: string;
  sections: { title: string; kind: 'entries' | 'skills' | 'list'; entries?: ResumeEntry[]; skills?: { label: string; items: string[] }[]; items?: string[] }[];
}

const BROWSERS = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean) as string[];

const esc = (s = '') => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rich = (s = '') => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const dates = (e: ResumeEntry) => [e.start, e.end].filter(Boolean).join(' – ');

function entry(e: ResumeEntry) {
  const title = e.link ? `<a href="${esc(e.link)}">${esc(e.title)}</a>` : esc(e.title);
  return `<div class="entry">
  <div class="row"><span class="t">${title}${e.meta ? ` <span class="meta">| ${rich(e.meta)}</span>` : ''}</span><span class="d">${esc(dates(e))}</span></div>
  ${e.org || e.location ? `<div class="row sub"><span>${esc(e.org)}</span><span>${esc(e.location ?? '')}</span></div>` : ''}
  ${e.bullets?.length ? `<ul>${e.bullets.map((b) => `<li>${rich(b)}</li>`).join('')}</ul>` : ''}
</div>`;
}

export function resumeHtml(r: Resume, scale = 1): string {
  const c = r.contact;
  const contact = [c.phone, c.email && `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`,
    ...(c.links ?? []).map((l) => `<a href="${esc(l.url)}">${esc(l.label)}</a>`), c.location].filter(Boolean).join('<span class="sep">|</span>');
  const sections = r.sections.map((s) => {
    const body = s.kind === 'entries' ? (s.entries ?? []).map(entry).join('')
      : s.kind === 'skills' ? `<div class="skills">${(s.skills ?? []).map((g) => `<div><b>${esc(g.label)}:</b> ${esc(g.items.join(', '))}</div>`).join('')}</div>`
      : `<ul class="plain">${(s.items ?? []).map((i) => `<li>${rich(i)}</li>`).join('')}</ul>`;
    return `<section><h2>${esc(s.title)}</h2>${body}</section>`;
  }).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(r.name)} — Resume</title><style>
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: ${(10.4 * scale).toFixed(2)}pt; }
body { font-family: "Charter", "Bitstream Charter", "Georgia", "Times New Roman", serif; color: #111; line-height: 1.28;
  padding: ${(11 * scale).toFixed(1)}mm ${(13 * scale).toFixed(1)}mm; -webkit-print-color-adjust: exact; }
a { color: inherit; text-decoration: none; }
header { text-align: center; margin-bottom: .55rem; }
h1 { font-size: 1.95rem; font-weight: 700; letter-spacing: .01em; line-height: 1.1; }
.headline { font-size: 1rem; margin-top: .12rem; color: #222; }
.contact { margin-top: .22rem; font-size: .93rem; color: #222; }
.contact .sep { margin: 0 .45em; color: #777; }
.summary { margin-bottom: .2rem; text-align: justify; hyphens: auto; }
section { margin-top: .5rem; }
h2 { font-size: 1.03rem; font-variant: small-caps; letter-spacing: .06em; font-weight: 700; color: #1d3557;
  border-bottom: .7pt solid #1d3557; padding-bottom: .06rem; margin-bottom: .28rem; }
.entry { margin-bottom: .34rem; break-inside: avoid; }
.row { display: flex; justify-content: space-between; gap: 1rem; align-items: baseline; }
.row .t { font-weight: 700; }
.row .meta { font-weight: 400; font-style: italic; font-size: .95rem; }
.row .d { white-space: nowrap; font-style: italic; font-size: .95rem; }
.row.sub { font-style: italic; font-size: .95rem; color: #222; }
ul { margin: .12rem 0 0 1.05rem; }
li { margin-bottom: .1rem; padding-left: .1rem; text-align: justify; hyphens: auto; }
ul.plain { margin-left: 1.05rem; }
.skills div { margin-bottom: .08rem; }
</style></head><body>
<header><h1>${esc(r.name)}</h1>${r.headline ? `<div class="headline">${esc(r.headline)}</div>` : ''}<div class="contact">${contact}</div></header>
${r.summary ? `<section><h2>Summary</h2><p class="summary">${rich(r.summary)}</p></section>` : ''}
${sections}
</body></html>`;
}

/** Plain-text twin for ATS checks and reviewers; same content, no layout. */
export function resumeMarkdown(r: Resume): string {
  const c = r.contact;
  const out = [`# ${r.name}`, [c.email, c.phone, c.location, ...(c.links ?? []).map((l) => l.url)].filter(Boolean).join(' · ')];
  if (r.headline) out.push(r.headline);
  if (r.summary) out.push('', '## Summary', r.summary);
  for (const s of r.sections) {
    out.push('', `## ${s.title}`);
    if (s.kind === 'entries') for (const e of s.entries ?? []) {
      out.push(`**${e.title}** — ${e.org}${e.location ? ` · ${e.location}` : ''}${dates(e) ? ` · ${dates(e)}` : ''}${e.meta ? ` · ${e.meta}` : ''}`);
      for (const b of e.bullets ?? []) out.push(`- ${b}`);
    }
    if (s.kind === 'skills') out.push((s.skills ?? []).map((g) => `**${g.label}:** ${g.items.join(', ')}`).join(' · '));
    if (s.kind === 'list') for (const i of s.items ?? []) out.push(`- ${i}`);
  }
  return out.join('\n') + '\n';
}

const pages = (pdf: string) => (readFileSync(pdf, 'latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length;

/**
 * Renders resume.json next to it: resume.html, resume.md, and (when a Chromium browser exists) a one-page resume.pdf.
 * Tightens the scale in small steps until the PDF is a single page; reports the result so the tailor can cut content instead.
 */
export function renderResume(jsonPath: string): { pdf: string | null; pages: number | null; scale: number } {
  const dir = dirname(jsonPath);
  const resume = JSON.parse(readFileSync(jsonPath, 'utf8')) as Resume;
  writeFileSync(join(dir, 'resume.md'), resumeMarkdown(resume));
  const htmlPath = join(dir, 'resume.html');
  const browser = BROWSERS.find((b) => existsSync(b));
  let scale = 1;
  writeFileSync(htmlPath, resumeHtml(resume, scale));
  if (!browser) return { pdf: null, pages: null, scale };
  const pdfPath = join(dir, 'resume.pdf');
  let n = 0;
  for (const s of [1, 0.97, 0.94, 0.91, 0.88]) {
    scale = s;
    writeFileSync(htmlPath, resumeHtml(resume, scale));
    execFileSync(browser, ['--headless', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`],
      { stdio: 'ignore', timeout: 60_000 });
    n = existsSync(pdfPath) ? pages(pdfPath) : 0;
    if (n <= 1) break;
  }
  return { pdf: existsSync(pdfPath) ? pdfPath : null, pages: n || null, scale };
}
