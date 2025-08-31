
import { getAdminDbSafe } from '@/lib/firebase-admin';
import type { ErpPaymentPrefs } from '@/types/erp-settings';

export async function getErpSettingsServer(uid: string): Promise<ErpPaymentPrefs|null> {
  const db = await getAdminDbSafe(); if (!db) return null;
  const docRef = db.collection('settings').doc(uid);
  const snap = await docRef.get();
  return (snap.exists ? (snap.data()?.erp as ErpPaymentPrefs) : null);
}
