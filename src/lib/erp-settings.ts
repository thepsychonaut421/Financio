
'use client';

import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { ErpPaymentPrefs } from '@/types/erp-settings';

export async function getErpSettings(uid: string): Promise<ErpPaymentPrefs|null> {
  const ref = doc(db, 'settings', uid);
  const snap = await getDoc(ref);
  return (snap.exists() ? (snap.data()?.erp as ErpPaymentPrefs) : null);
}

export async function saveErpSettings(uid: string, erp: ErpPaymentPrefs) {
  const ref = doc(db, 'settings', uid);
  await setDoc(ref, { erp }, { merge: true });
}
