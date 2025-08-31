// src/app/api/dedupe/scan/route.ts
import { NextResponse } from 'next/server';
import { getAdminDbSafe } from '@/lib/firebase-admin';
import { makeFingerprint, itemsHash } from '@/lib/dedupe';
import type { ERPIncomingInvoiceItem } from '@/types/incoming-invoice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const db = await getAdminDbSafe();
  if (!db) {
    return NextResponse.json({ ok: false, error: 'Firestore not available' }, { status: 500 });
  }

  try {
    const snap = await db.collection('processed_invoices').get();
    if (snap.empty) {
        return NextResponse.json({ ok: true, updated: 0, message: "No documents to scan." });
    }

    const batch = db.batch();
    snap.forEach(doc => {
      const iv = doc.data()?.payload as ERPIncomingInvoiceItem;
      if (!iv) return; 

      const fingerprint = makeFingerprint(iv);
      const iHash = itemsHash(iv.rechnungspositionen);

      batch.update(doc.ref, {
        'dedupe.fingerprint': fingerprint,
        'dedupe.itemsHash': iHash,
        'dedupe.status': doc.data()?.dedupe?.status || 'suspect',
      });
    });

    await batch.commit();
    return NextResponse.json({ ok: true, updated: snap.size });

  } catch (error: any) {
    console.error("Error during dedupe scan:", error);
    return NextResponse.json({ ok: false, error: error.message || "Failed to scan documents." }, { status: 500 });
  }
}
