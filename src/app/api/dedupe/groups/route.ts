// src/app/api/dedupe/groups/route.ts
import { NextResponse } from 'next/server';
import { getAdminDbSafe } from '@/lib/firebase-admin';
import { collection, query, where, getDocs } from 'firebase/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const db = await getAdminDbSafe();
  if (!db) {
     return NextResponse.json({ ok: false, error: 'Firestore not available' }, { status: 500 });
  }
  
  try {
    const q = query(collection(db, "processed_invoices"), where('dedupe.fingerprint', '!=', null));
    const snap = await getDocs(q);

    const groups: Record<string, any[]> = {};
    snap.forEach(doc => {
        const d = doc.data();
        const fp = d?.dedupe?.fingerprint;
        if (!fp) return;
        (groups[fp] ||= []).push({ id: doc.id, ...d });
    });

    const result = Object.entries(groups)
        .filter(([, arr]) => arr.length > 1)
        .map(([fingerprint, docs]) => ({
        fingerprint,
        count: docs.length,
        supplier: docs[0]?.payload?.lieferantName,
        invoiceNo: docs[0]?.payload?.rechnungsnummer,
        invoiceDate: docs[0]?.payload?.datum,
        total: docs[0]?.payload?.gesamtbetrag,
        docs: docs
            .sort((a,b)=> (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
            .map(d => ({ 
                id: d.id, 
                status: d.status, 
                createdAt: d.createdAt,
                filename: d.filename
             }))
        }));

    return NextResponse.json({ ok: true, groups: result });
  } catch (error: any) {
    console.error("Error fetching dedupe groups:", error);
    return NextResponse.json({ ok: false, error: error.message || "Failed to fetch groups." }, { status: 500 });
  }
}
