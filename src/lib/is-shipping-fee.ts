
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
  
  const makeWordRE = (w: string) => {
    // Unicode-aware word boundary. Checks that the character before and after are not letters, numbers, or underscore.
    // (?<!...) is a negative lookbehind, (?!=...) is a negative lookahead.
    // \p{L} matches any Unicode letter, \p{N} any number.
    return new RegExp(`(?<![\\p{L}\\p{N}_])${w}(?![\\p{L}\\p{N}_])`, 'iu');
  }

  for (const k of bag) {
    if (!k) continue;
    // Use the Unicode-aware regex to test for the keyword as a whole word.
    if (makeWordRE(k).test(text)) return true;
  }
  
  if ((code || '').toUpperCase() === 'VERSAND') return true;
  
  return false;
}
