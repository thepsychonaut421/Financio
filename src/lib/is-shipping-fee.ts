
const BASE = [
  'versand','porto','versandkosten','versandkostenpauschale',
  'lieferkosten','portokosten','paketmarke','shipping','postage',
  'fracht','speditionskosten','transportkosten',
  'dhl','hermes','dpd','gls','ups'
];

const esc = (s:string) => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

// Pre-compile regexes for base keywords for performance
const BASE_REGEX_CACHE = new Map<string, RegExp>();
BASE.forEach(k => {
    BASE_REGEX_CACHE.set(k, new RegExp(`(?<![\\p{L}\\p{N}_])${esc(k)}(?![\\p{L}\\p{N}_])`, 'iu'));
});


export function isShippingFee(name?: string, code?: string, keywords: string[] = []) {
  const text = ((name||'')+' '+(code||'')).toLowerCase();
  if (!text.trim()) return false;

  // Check against pre-compiled base keywords
  for (const re of BASE_REGEX_CACHE.values()) {
      if (re.test(text)) return true;
  }
  
  // Check against custom keywords (compile them on the fly, as they can change)
  const customKeywords = keywords.map(k=>k.toLowerCase()).filter(Boolean);
  if (customKeywords.length > 0) {
      for (const k of customKeywords) {
          const customRe = new RegExp(`(?<![\\p{L}\\p{N}_])${esc(k)}(?![\\p{L}\\p{N}_])`, 'iu');
          if (customRe.test(text)) return true;
      }
  }
  
  if ((code||'').toUpperCase() === 'VERSAND') return true;
  
  return false;
}
