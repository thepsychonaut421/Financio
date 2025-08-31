

const BASE = [
  'versand','porto','versandkosten','versandkostenpauschale',
  'lieferkosten','portokosten','paketmarke','shipping','postage',
  'fracht','speditionskosten','transportkosten',
  'dhl','hermes','dpd','gls','ups'
];

function normalize(s = '') {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '') // remove diacritics
    .replace(/[_\-./]+/g, ' ')                       // separators -> space
    .replace(/\s+/g, ' ')                            // multiple spaces -> one
    .trim();
}

export function isShippingFee(name?: string, code?: string, keywords: string[] = []) {
  const text = normalize(`${name||''} ${code||''}`);
  if (!text) return false;

  const bag = new Set([...BASE, ...keywords.map(k => normalize(k))].filter(Boolean));

  // simple tokenization
  const tokens = new Set(text.split(' '));
  for (const k of bag) {
    if (tokens.has(k)) return true;         // exact token match
    if (text.includes(` ${k} `)) return true; // fallback boundary
  }

  if ((code||'').toUpperCase() === 'VERSAND') return true;
  return false;
}
