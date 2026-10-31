// One stroke family (1.6px on a 20px grid) for every icon on the desk.
const PATHS: Record<string, string> = {
  today: 'M3 4h14v13H3zM3 8h14M7 2.5v3M13 2.5v3',
  pipeline: 'M3 5h14M3 10h10M3 15h6',
  agents: 'M10 3.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM10 6.5V10l3 2',
  contacts: 'M10 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM4 17c.8-3.2 3.2-5 6-5s5.2 1.8 6 5',
  interviews: 'M4 4h12v9H9l-4 3v-3H4z',
  mail: 'M2.5 5h15v10.5h-15zM2.5 6l7.5 5.5L17.5 6',
  copy: 'M7 7h9v10H7zM4 13V3h9',
  open: 'M11 3h6v6M17 3l-8 8M14 12v5H3V6h5',
  play: 'M6 4l10 6-10 6z',
  close: 'M5 5l10 10M15 5L5 15',
  back: 'M12 4l-6 6 6 6',
  check: 'M4 10.5l4 4 8-9',
  doc: 'M5 2.5h7l3 3v12H5zM12 2.5v3h3M7.5 10h5M7.5 13h5',
  match: 'M4 10.5l3.5 3.5L16 5.5M4 4.5h6M4 16h12',
  sources: 'M10 3c3.9 0 7 1.3 7 3s-3.1 3-7 3-7-1.3-7-3 3.1-3 7-3zM3 6v8c0 1.7 3.1 3 7 3s7-1.3 7-3V6M3 10c0 1.7 3.1 3 7 3s7-1.3 7-3',
  company: 'M3 17V6l5-2.5V17M8 8h9v9M11 11h1.5M14 11h1.5M11 14h1.5M14 14h1.5M2 17h16',
  chevronDown: 'M5 8l5 5 5-5',
  chevronRight: 'M8 5l5 5-5 5',
  arrowRight: 'M4 10h12M11 5l5 5-5 5',
  search: 'M8.5 3.5a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM12.5 12.5L17 17',
};

export function Icon({ name, size = 20 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}
