// src/app/api/dedupe/resolve/route.ts
import { NextResponse } from 'next/server';
import { getAdminDbSafe } from '@/lib/firebase-admin';
import { doc, writeBatch } from 'firebase/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { keepId, deleteIds = [], markOkIds = [] } = body as {
      keepId?: string;
      deleteIds?: string[];
      markOkIds?: string[];
    };
    
    if (!keepId && deleteIds.length === 0 && markOkIds.length === 0) {
        return NextResponse.json({ ok: false, error: 'No actions provided.' }, { status: 400 });
    }

    const db = await getAdminDbSafe();
    if (!db) {
        return NextResponse.json({ ok: false, error: 'Firestore not available' }, { status: 500 });
    }
    
    const batch = writeBatch(db);

    if (keepId) {
      const ref = doc(db, 'processed_invoices', keepId);
      batch.update(ref, { 'dedupe.status': 'ok' });
    }

    deleteIds.forEach(id => {
      if(id !== keepId) { // Safety check
        batch.delete(doc(db, 'processed_invoices', id));
      }
    });

    markOkIds.forEach(id => {
      if (id !== keepId) { // Safety check
        batch.update(doc(db, 'processed_invoices', id), { 'dedupe.status': 'ok' });
      }
    });

    await batch.commit();
    return NextResponse.json({ ok: true });

  } catch (error: any) {
    console.error("Error resolving duplicates:", error);
    return NextResponse.json({ ok: false, error: error.message || 'Failed to resolve duplicates.' }, { status: 500 });
  }
}
