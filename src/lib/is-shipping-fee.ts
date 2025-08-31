
export function isShippingFee(name?: string, code?: string, keywords: string[] = []) {
  const text = ((name || '') + ' ' + (code || '')).toLowerCase();
  
  // Base keywords
  const base = [
    'versand','porto','versandkosten','versandkostenpauschale',
    'lieferkosten','portokosten','paketmarke','shipping','postage',
    'fracht', 'speditionskosten', 'transportkosten',
    'dhl','hermes','dpd','gls','ups'
  ];
  
  const bag = new Set(base.concat(keywords.map(k => k.toLowerCase())));
  
  for (const k of bag) {
    if (!k) continue;
    // \b is a word boundary. This prevents "transport" matching "transporteur".
    const re = new RegExp(`\\b${k}\\b`, 'i');
    if (re.test(text)) return true;
  }
  
  if ((code || '').toUpperCase() === 'VERSAND') return true;
  
  return false;
}
