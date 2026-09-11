// CsvExporter: idea を CSV に書き出す

function esc(v) {
  if (v === null || v === undefined) return '';
  const s = Array.isArray(v) ? v.join(' / ') : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function ideasToCsv(ideas) {
  const headers = [
    'id','title','objective','target','hook','angle','structure',
    'key_points','personal_experience_needed','reference_patterns',
    'status','tags','platform','created_at'
  ];
  const lines = [headers.join(',')];
  for (const idea of ideas) {
    lines.push(headers.map(h => esc(idea[h])).join(','));
  }
  return lines.join('\n');
}
