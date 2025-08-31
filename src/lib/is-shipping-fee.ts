

export function isShippingFee(name?: string, code?: string, keywords: string[] = []) {
  const text = ((name || '') + ' ' + (code || '')).toLowerCase();
  const base = ['versand','porto','versandkosten','versandkostenpauschale','lieferkosten','portokosten','paketmarke','shipping','postage','dhl','hermes','dpd','gls','ups'];
  const bag = new Set(base.concat(keywords.map(k => k.toLowerCase())));
  
  for (const k of bag) {
    if (!k) continue;
    const re = new RegExp(`\\b${k}\\b`, 'i'); // Search for whole word
    if (re.test(text)) return true;
  }
  
  if ((code || '').toUpperCase() === 'VERSAND') return true;
  
  return false;
}
