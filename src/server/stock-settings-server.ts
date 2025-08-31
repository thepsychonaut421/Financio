'use server';

import { getAdminDbSafe } from '@/lib/firebase-admin';
import type { StockSettings } from '@/types/stock-settings';

export async function getStockSettingsServer(uid: string): Promise<StockSettings> {
  const db = await getAdminDbSafe(); if (!db) throw new Error('No DB');
  const snap = await db.collection('settings').doc(uid).get();
  const s = (snap.exists ? snap.data()?.stock : null) as StockSettings | null;
  return s ?? {
    defaultWarehouse: '',
    shippingKeywords: ['versand','porto','versandkosten','versandkostenpauschale','lieferkosten','shipping','postage','paketmarke','dhl','hermes','dpd','gls','ups']
  };
}
