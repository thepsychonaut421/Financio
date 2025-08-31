// src/lib/dedupe.ts
import crypto from 'crypto';
import type { ERPIncomingInvoiceItem } from '@/types/incoming-invoice';


export function normalizeSupplier(s?: string) {
  return (s || '').trim().toLowerCase().replace(/\s+/g,' ');
}

export function round2(n?: number) {
  return n==null ? 0 : Math.round(n * 100) / 100;
}

export function hash(s: string) {
  return crypto.createHash('sha1').update(s, 'utf8').digest('hex');
}

export function itemsHash(items?: ERPIncomingInvoiceItem['rechnungspositionen']) {
  if (!items?.length) return '';
  const canon = items
    .map(i => `${(i.productCode||'').trim().toLowerCase()}|${i.quantity||0}|${round2(i.unitPrice)}`)
    .sort()
    .join('||');
  return hash(canon);
}

export function makeFingerprint(iv: ERPIncomingInvoiceItem) {
  const supplier = normalizeSupplier(iv.lieferantName);
  const invNo   = (iv.rechnungsnummer || '').trim().toLowerCase();
  const date    = (iv.datum || '').slice(0,10);
  const total   = round2(iv.gesamtbetrag || 0);
  const base    = `${supplier}|${invNo}|${date}|${total}`;
  return hash(base);
}
