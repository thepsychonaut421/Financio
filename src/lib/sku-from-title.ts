
export function skuFromTitle(s: string) {
  return s.replace(/[^A-Za-z0-9]+/g,'-').replace(/^-|-$/g,'').toUpperCase().slice(0,40) || 'SKU-' + Math.random().toString(36).slice(2,8).toUpperCase();
}
