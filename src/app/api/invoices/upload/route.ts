
import { NextResponse } from 'next/server';
export const runtime = 'nodejs';

import * as admin from 'firebase-admin';
import { createHash } from 'crypto';

// Asigură-te că ai inițializat o singură dată firebase-admin în lib/firebase.ts
import { adminDb, adminStorage } from '@/lib/firebase';

// Genkit/AI flow
import { extractIncomingInvoiceData } from '@/ai/flows/extract-incoming-invoice-data';

// client către un Cloud Function/Run care creează un task în Cloud Tasks
import { enqueueExtractionJob } from '@/lib/extraction-queue';

type Claims = {
  orgId?: string;
  role?: 'Owner' | 'Admin' | 'Accountant' | 'Viewer';
};

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB
const ALLOWED_MIME = new Set(['application/pdf']);

async function requireUserAndOrg(req: Request): Promise<{ uid: string; orgId: string; role: Claims['role'] }> {
  // Simplified for prototype: In a real app, this would verify a JWT.
  // const authHeader = req.headers.get('Authorization') || '';
  // const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  // if (!token) throw new Error('UNAUTHENTICATED');
  // const decoded = await getAuth().verifyIdToken(token);
  // const claims = (decoded as any) as Claims;
  // if (!claims.orgId) throw new Error('NO_ORG');
  // if (!claims.role || !['Owner', 'Admin', 'Accountant'].includes(claims.role)) {
  //   throw new Error('FORBIDDEN');
  // }
  // return { uid: decoded.uid, orgId: claims.orgId, role: claims.role };
  
  // Hardcoded for prototyping environment
  return { uid: 'test-user-id', orgId: 'test-org-id', role: 'Admin' };
}

function sha256(buf: Buffer) {
  const h = createHash('sha256');
  h.update(buf);
  return h.digest('hex');
}

export async function POST(request: Request) {
  try {
    const { uid, orgId } = await requireUserAndOrg(request);

    const formData = await request.formData();
    const file = formData.get('file') as unknown as File | null;
    if (!file) return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });

    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Only PDFs are allowed.' }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `Invalid file size (max ${MAX_FILE_BYTES} bytes).` }, { status: 400 });
    }

    const ab = await file.arrayBuffer();
    const buffer = Buffer.from(ab);

    const digest = sha256(buffer);
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');

    const storagePath = `invoices/${orgId}/${yyyy}/${mm}/${digest}.pdf`;
    const bucket = adminStorage.bucket();
    const storageFile = bucket.file(storagePath);

    await storageFile.save(buffer, {
      metadata: {
        contentType: file.type,
        metadata: {
          sha256: digest,
          originalFilename: file.name,
          uploaderUid: uid,
          orgId,
        },
      },
      resumable: false,
      validation: false, 
    });

    const docRef = adminDb
      .collection('orgs')
      .doc(orgId)
      .collection('invoices')
      .doc(digest);

    const baseDoc = {
      id: digest,
      status: 'uploaded' as const,
      originalFilename: file.name,
      mimeType: file.type,
      size: file.size,
      fileRef: storagePath,
      sha256: digest,
      uploadedBy: uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      parse: null as any,
      erpSync: { status: 'pending', mode: 'PI:update_stock', attempts: 0, lastAttemptAt: null as any },
    };

    await docRef.set(baseDoc, { merge: true });

    await docRef.update({
      status: 'extracting',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // ===== SYNC EXTRACT (încercare rapidă) =====
    let extractedOk = false;
    let extractionError: string | null = null;
    try {
      const dataUri = `data:${file.type};base64,${buffer.toString('base64')}`;
      const extractionResult = await Promise.race([
        extractIncomingInvoiceData({ invoiceDataUri: dataUri }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('EXTRACTION_TIMEOUT')), 28_000)),
      ]) as any; // Cast to any to handle potential promise rejection type

      const firestoreUpdatePayload: Record<string, any> = {
          status: extractionResult?.error ? 'error' : 'extracted',
          'parse.model': 'googleai/gemini-1.5-flash-latest', // Hardcoding model for now
          'parse.raw': extractionResult ?? null,
          'parse.error': extractionResult?.error ?? null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      
      if(!extractionResult?.error && extractionResult) {
         firestoreUpdatePayload['parse.header'] = {
            supplier: extractionResult?.lieferantName ?? null,
            supplier_invoice_no: extractionResult?.rechnungsnummer ?? null,
            invoice_date: extractionResult?.datum ?? null,
            currency: extractionResult?.waehrung ?? null,
            net_total: extractionResult?.nettoBetrag ?? null,
            tax_total: extractionResult?.mwstBetrag ?? null,
            grand_total: extractionResult?.gesamtbetrag ?? null,
          };
          firestoreUpdatePayload['parse.items'] = extractionResult?.rechnungspositionen ?? [];
      }

      await docRef.update(firestoreUpdatePayload);

      extractedOk = !extractionResult?.error;
      extractionError = extractionResult?.error ?? null;

    } catch (err: any) {
      extractionError = err?.message || 'EXTRACTION_FAILED';
      await docRef.update({
          status: 'error',
          'parse.error': extractionError,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    if (!extractedOk) {
      await enqueueExtractionJob({
        orgId,
        invoiceId: digest,
        storagePath,
      }).catch(() => {/* swallow queue errors, endpoint rămâne success pe upload */});

      // Don't revert status to 'uploaded', keep it as 'error' from the sync attempt.
      // The worker can pick it up if it's in an 'error' or 'uploaded' state.
    }

    return NextResponse.json(
      {
        ok: true,
        orgId,
        invoiceId: digest,
        path: storagePath,
        status: extractedOk ? 'extracted' : 'error',
        note: extractedOk ? 'Sync extraction completed.' : `Sync extraction failed: ${extractionError}`,
      },
      { status: 201 },
    );
  } catch (error: any) {
    const code = String(error?.message || '');
    if (code === 'UNAUTHENTICATED') return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    if (code === 'NO_ORG' || code === 'FORBIDDEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    console.error('Upload & extraction error:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error?.message ?? String(error) }, { status: 500 });
  }
}
