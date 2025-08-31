'use client';

import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { StockSettings } from '@/types/stock-settings';

export async function getStockSettings(uid: string): Promise<StockSettings> {
  const ref = doc(db, 'settings', uid);
  const snap = await getDoc(ref);
  const s = (snap.exists() ? snap.data()?.stock : null) as StockSettings | null;
  return s ?? {
    defaultWarehouse: '',
    shippingKeywords: ['versand','porto','versandkosten','versandkostenpauschale','lieferkosten','shipping','postage','paketmarke','dhl','hermes','dpd','gls','ups']
  };
}

export async function saveStockSettings(uid: string, stock: StockSettings) {
  const ref = doc(db, 'settings', uid);
  await setDoc(ref, { stock }, { merge: true });
}
