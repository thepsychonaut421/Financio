
export function isShippingFee(name?: string, code?: string, keywords: string[] = []) {
  const s = ((name || '') + ' ' + (code || '')).toLowerCase();
  const base = ['versand','porto','versandkosten','versandkostenpauschale','lieferkosten','portokosten','paketmarke','shipping','postage','dhl','hermes','dpd','gls','ups'];
  const bag = new Set(base.concat(keywords.map(k=>k.toLowerCase())));
  
  // Heuristics: exact token sau substring clar
  for (const k of bag) {
    if (!k) continue;
    if (s.includes(k)) return true;
  }
  
  // coduri generice observate în screenshot
  if (/^versand\b/i.test(code || '')) return true;
  // This was too broad and could exclude valid auto-generated SKUs
  // if (/^auto-[a-z0-9]+$/i.test(code || '')) return true; 
  if ((code || '').toUpperCase()==='VERSAND') return true;
  
  return false;
}
