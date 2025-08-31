
const BASE = [
  'versand','porto','versandkosten','versandkostenpauschale',
  'lieferkosten','portokosten','paketmarke','shipping','postage',
  'fracht','speditionskosten','transportkosten',
  'dhl','hermes','dpd','gls','ups'
];

const esc = (s:string) => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const mkRE = (w:string) => new RegExp(`(?<![\\p{L}\\p{N}_])${esc(w)}(?![\\p{L}\\p{N}_])`, 'iu');

export function isShippingFee(name?: string, code?: string, keywords: string[] = []) {
  const text = ((name||'')+' '+(code||'')).toLowerCase();
  const bag = new Set([...BASE, ...keywords.map(k=>k.toLowerCase())].filter(Boolean));
  for (const k of bag) if (k && mkRE(k).test(text)) return true;
  if ((code||'').toUpperCase() === 'VERSAND') return true;
  return false;
}
