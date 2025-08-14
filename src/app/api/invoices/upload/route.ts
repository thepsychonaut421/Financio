
import { NextResponse } from 'next/server';
export const runtime = 'nodejs';

import * as admin from 'firebase-admin';
import { createHash } from 'crypto';

import { adminDb, adminStorage } from '@/lib/firebase-admin';

import { extractIncomingInvoiceData } from '@/ai/flows/extract-incoming-invoice-data';

import { enqueueExtractionJob } from '@/lib/extraction-queue';
import type { ParsedHeader, ParsedItem } from '@/types/incoming-invoice';

type Claims = {
  orgId?: string;
  role?: 'Owner' | 'Admin' | 'Accountant' | 'Viewer';
};

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME = new Set(['application/pdf']);

async function requireUserAndOrg(req: Request): Promise<{ uid: string; orgId: string; role: Claims['role'] }> {
  // Hardcoded for prototyping environment. In a real app, this would verify a JWT.
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

    // Tolerant magic bytes check to ensure it's a real PDF
    const header = buffer.subarray(0, 32).toString();
    if (!/\s*%PDF-/.test(header)) {
        return NextResponse.json({ error: 'Invalid file format. Not a valid PDF.' }, { status: 400 });
    }


    const digest = sha256(buffer);
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');

    const storagePath = `invoices/${orgId}/${yyyy}/${mm}/${digest}.pdf`;
    const bucket = adminStorage.bucket();
    const storageFile = bucket.file(storagePath);

    await storageFile.save(buffer, {
      metadata: {
        contentType: 'application/pdf', // Enforce correct content type
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

    // Idempotent Firestore write using a transaction
    await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        if (!snap.exists) {
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
            tx.set(docRef, baseDoc);
        }
        tx.update(docRef, { status: 'extracting', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    });
    
    // Deduplication check: if file already existed and was processed, exit gracefully.
    const currentSnap = await docRef.get();
    const existingData = currentSnap.data();
    if (existingData?.status === 'extracted' && existingData.createdAt.toDate() < now) {
         return NextResponse.json({
            ok: true,
            orgId,
            invoiceId: digest,
            path: storagePath,
            status: 'extracted',
            note: 'Already processed (deduplicated by sha256).',
        }, { status: 200 });
    }


    let extractedOk = false;
    let extractionError: string | null = null;
    let firestoreUpdatePayload: Record<string, any> = {};

    try {
      const dataUri = `data:${file.type};base64,${buffer.toString('base64')}`;
      const extractionResult = await Promise.race([
        extractIncomingInvoiceData({ invoiceDataUri: dataUri }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('EXTRACTION_TIMEOUT')), 28_000)),
      ]) as any;

      if (extractionResult?.error) {
        extractionError = extractionResult.error;
      } else {
          const toNum = (v: any) => (v == null || v === '' ? null : Number(String(v).replace(',', '.')));
          const toISO = (d: any) => {
              if (!d) return null;
              try {
                  const date = new Date(d);
                  if(isNaN(date.getTime())) return null;
                  return date.toISOString().slice(0, 10);
              } catch (e) {
                  return null;
              }
          };

          const header: ParsedHeader = {
            supplier: extractionResult?.lieferantName ?? null,
            supplier_invoice_no: extractionResult?.rechnungsnummer ?? null,
            invoice_date: toISO(extractionResult?.datum),
            currency: extractionResult?.waehrung ?? 'EUR',
            net_total: toNum(extractionResult?.nettoBetrag),
            tax_total: toNum(extractionResult?.mwstBetrag),
            grand_total: toNum(extractionResult?.gesamtbetrag),
          };

          const items: ParsedItem[] = (extractionResult?.rechnungspositionen ?? []).map((it: any, idx: number) => ({
            row: idx + 1,
            item_code: it.productCode ?? null,
            name: it.productName ?? '',
            qty: toNum(it.quantity) ?? 1,
            uom: it.uom ?? 'Stk',
            rate: toNum(it.unitPrice) ?? null,
            amount: toNum(it.totalPrice) ?? null,
            pos: it.pos ?? it.SKU ?? null,
            expense_account: it.expense_account ?? null,
          }));

          firestoreUpdatePayload = {
            status: 'extracted',
            'parse.model': 'googleai/gemini-1.5-flash-latest', 
            'parse.raw': extractionResult ?? null,
            'parse.error': null,
            'parse.header': header,
            'parse.items': items,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
          await docRef.update(firestoreUpdatePayload);
          extractedOk = true;
      }
    } catch (err: any) {
      extractionError = err?.message || 'EXTRACTION_FAILED';
    }

    if (!extractedOk) {
      await enqueueExtractionJob({
        orgId,
        invoiceId: digest,
        storagePath,
      }).catch(() => {});

      await docRef.update({
          status: 'uploaded',
          'parse.error': extractionError,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return NextResponse.json(
      {
        ok: true,
        orgId,
        invoiceId: digest,
        path: storagePath,
        status: extractedOk ? 'extracted' : 'queued',
        note: extractedOk ? 'Sync extraction completed.' : `Queued for async extraction. Reason: ${extractionError}`,
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
