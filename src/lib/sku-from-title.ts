
import crypto from 'crypto';

export function skuFromTitle(s: string) {
  const base = s.replace(/[^A-Za-z0-9]+/g,'-').replace(/^-|-$/g,'').toUpperCase().slice(0,28);
  const digest = crypto.createHash('md5').update(s).digest('hex').slice(0,6).toUpperCase();
  return (base || 'SKU') + '-' + digest;
}
