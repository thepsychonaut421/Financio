
// src/app/api/erp/sync/route.ts
import { NextResponse } from 'next/server';
export const runtime = 'nodejs';

import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebase-admin';

// ---- ENV necesare (set in .env/.env.local) ----
// ERP_BASE_URL=https://erp.example.com
// ERP_API_KEY=xxx
// ERP_API_SECRET=yyy

type ParsedHeader = {
  supplier: string|null; supplier_invoice_no: string|null; invoice_date: string|null;
  currency: string|null; net_total: number|null; tax_total: number|null; grand_total: number|null;
};
type ParsedItem = {
  row: number; item_code: string|null; name: string; qty: number|null; uom: string|null;
  rate: number|null; amount: number|null; expense_account?: string|null;
};

function erpHeaders() {
  const { ERP_API_KEY, ERP_API_SECRET } = process.env;
  if (!ERP_API_KEY || !ERP_API_SECRET) throw new Error('ERP credentials missing');
  return { 'Content-Type': 'application/json', Authorization: `token ${ERP_API_KEY}:${ERP_API_SECRET}` };
}

function withTimeout(ms: number) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ms);
    return { signal: controller.signal, cancel: () => clearTimeout(timeoutId) };
}


async function erpGetByUid(uid: string) {
  const base = process.env.ERP_BASE_URL!;
   if (!base || !/^https:\/\//i.test(base)) throw new Error('ERP_BASE_URL must be a valid HTTPS URL');
  const url = `${base}/api/resource/Purchase%20Invoice?fields=["name"]&filters=[["Purchase Invoice","custom_financio_uid","=","${uid}"]]`;
  const { signal, cancel } = withTimeout(30000);
  try {
    const res = await fetch(url, { headers: erpHeaders(), cache: 'no-store', signal });
    if (!res.ok) throw new Error(`ERP lookup failed ${res.status}`);
    const j = await res.json();
    return (j.data && j.data[0]?.name) || null;
  } finally {
      cancel();
  }
}

function buildPiPayload(header: ParsedHeader, items: ParsedItem[], invoiceId: string) {
  return {
    doctype: 'Purchase Invoice',
    supplier: header.supplier,
    bill_no: header.supplier_invoice_no,
    bill_date: header.invoice_date,
    posting_date: header.invoice_date,
    currency: header.currency ?? 'EUR',
    update_stock: 1,
    set_posting_time: 1,
    items: items.map(it => ({
      item_code: it.item_code,
      item_name: it.name,
      description: it.name,
      qty: it.qty ?? 1,
      uom: it.uom ?? 'Stk',
      rate: it.rate ?? 0,
      expense_account: it.expense_account ?? undefined,
    })),
    custom_financio_uid: invoiceId, // idempotency key
  };
}

export async function POST(req: Request) {
  try {
    const { orgId, invoiceId } = await req.json() as { orgId: string; invoiceId: string };
    if (!orgId || !invoiceId) return NextResponse.json({ error: 'orgId & invoiceId required' }, { status: 400 });

    const docRef = adminDb.doc(`orgs/${orgId}/invoices/${invoiceId}`);
    const snap = await docRef.get();
    if (!snap.exists) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    const inv = snap.data()!;
    const attempts = (inv.erpSync?.attempts ?? 0) + 1;

    if (inv.erpSync?.status === 'done' && inv.erpSync?.docName) {
      return NextResponse.json({ ok: true, status: 'done', docName: inv.erpSync.docName }, { status: 200 });
    }

    const header = inv.parse?.header as ParsedHeader;
    const items = inv.parse?.items as ParsedItem[];

    // --- Business Validation ---
    if (!header || !items?.length) {
      return NextResponse.json({ error: 'Parsed data (header or items) missing from invoice document.' }, { status: 409 });
    }
    if (!header.supplier || !header.supplier_invoice_no || !header.invoice_date) {
        await docRef.update({
            'erpSync.status': 'failed',
            'erpSync.error': 'Missing supplier, invoice number, or invoice date.',
            'erpSync.lastAttemptAt': admin.firestore.FieldValue.serverTimestamp(),
            'erpSync.attempts': attempts,
        });
        return NextResponse.json({ error: 'supplier, supplier_invoice_no, and invoice_date are required fields.' }, { status: 422 });
    }


    // 1) Idempotency check in ERP
    const existingName = await erpGetByUid(invoiceId);
    if (existingName) {
      await docRef.update({ erpSync: { status: 'done', docType: 'Purchase Invoice', docName: existingName, lastAttemptAt: new Date(), attempts } });
      return NextResponse.json({ ok: true, status: 'done', docName: existingName }, { status: 200 });
    }

    // 2) Create PI
    const payload = buildPiPayload(header, items, invoiceId);
    const { signal, cancel } = withTimeout(30000);
    let res: Response;
    try {
        res = await fetch(`${process.env.ERP_BASE_URL}/api/resource/Purchase%20Invoice`, {
            method: 'POST',
            headers: erpHeaders(),
            body: JSON.stringify(payload),
            signal,
        });
    } finally {
        cancel();
    }
    
    if (!res.ok) {
      let errorDetails = await res.text();
      try {
        const jsonError = JSON.parse(errorDetails);
        errorDetails = jsonError?.exception || jsonError?._server_messages || errorDetails;
      } catch {}
      
      const isRetriable = res.status === 429 || res.status >= 500;
      await docRef.update({ 
        'erpSync.status': isRetriable ? 'retry' : 'failed', 
        'erpSync.error': String(errorDetails), 
        'erpSync.lastAttemptAt': admin.firestore.FieldValue.serverTimestamp(),
        'erpSync.attempts': attempts,
      });
      return NextResponse.json({ error: 'ERP create failed', details: String(errorDetails) }, { status: res.status });
    }

    const data = await res.json();
    const name = data?.data?.name ?? data?.data?.docname ?? 'UNKNOWN';

    await docRef.update({
      erpSync: { status: 'done', docType: 'Purchase Invoice', docName: name, lastAttemptAt: new Date(), attempts },
    });

    return NextResponse.json({ ok: true, status: 'done', docName: name }, { status: 201 });
  } catch (e: any) {
    const status = e.name === 'AbortError' ? 408 : 500;
    return NextResponse.json({ error: e?.message ?? 'sync-failed' }, { status });
  }
}
