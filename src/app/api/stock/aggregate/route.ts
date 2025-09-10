

import { NextResponse } from 'next/server';
import { getAdminDbSafe } from '@/lib/firebase-admin';
import { getStockSettingsServer } from '@/server/stock-settings-server';
import { isShippingFee } from '@/lib/is-shipping-fee';
import { getUidFromRequest, AuthError } from '@/lib/get-uid-from-request';


export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Firebase-Token, X-ID-Token',
};

export async function OPTIONS(req: Request) {
    return NextResponse.json({}, { headers: CORS_HEADERS });
}


export async function POST(req: Request) {
  let uid: string;
  try {
    uid = await getUidFromRequest(req);
  } catch (error: any) {
    console.error("[API /stock/aggregate Auth Error]", error);
    // Ensure a JSON response is sent on authentication failure
    return NextResponse.json(
        { ok: false, error: error.message || 'Authentication failed.' },
        { status: 401, headers: CORS_HEADERS }
    );
  }

  try {
    const db = await getAdminDbSafe(); 
    if (!db) {
        return NextResponse.json({ ok:false, error:'Database service is unavailable.' }, { status:500, headers: CORS_HEADERS });
    }

    const settings = await getStockSettingsServer(uid);
    const snap = await db.collection('processed_invoices')
        .where('userId','==',uid)
        .select('payload.rechnungspositionen','payload.rechnungsnummer')
        .get();

    const agg = new Map<string, { code:string; name:string; qty:number; source:string[] }>();
    let shippingFeesExcluded = 0;

    snap.forEach(doc=>{
        const inv = doc.data() as any;
        // Defensive coding: ensure rechnungspositionen is a valid array
        const items = Array.isArray(inv?.payload?.rechnungspositionen) ? inv.payload.rechnungspositionen : [];
        
        for (const it of items) {
            const code = (it.productCode || '').toString().trim();
            const name = (it.productName || '').toString().trim();

            if (isShippingFee(name, code, settings.shippingKeywords)) {
                shippingFeesExcluded++;
                continue; 
            }

            const codeNorm = code.toUpperCase();
            const nameNorm = name.toUpperCase();
            const key = codeNorm || nameNorm;
            if (!key) continue;

            const qty = Number(it.quantity || 0) || 0; // Guard against NaN
            const rec = agg.get(key) || { code: code || name, name: name, qty:0, source: [] };
            rec.qty += qty;
            if (inv?.payload?.rechnungsnummer) rec.source.push(inv.payload.rechnungsnummer);
            agg.set(key, rec);
        }
    });

    const rows = Array.from(agg.values()).map(r => ({
        productCode: r.code,
        productName: r.name,
        totalQuantity: r.qty,
        sourceInvoices: [...new Set(r.source)].slice(0,5),
    }));
    
    console.log(JSON.stringify({
        tag:'stock.aggregate',
        uid, rows: rows.length,
        skippedShippingItems: shippingFeesExcluded,
        defaultWarehouse: settings.defaultWarehouse || null
    }));

    return NextResponse.json({ ok:true, rows, warehouse: settings.defaultWarehouse, company: settings.company, skippedShippingItems: shippingFeesExcluded }, {
        headers: {
            ...CORS_HEADERS,
            'Cache-Control': 'no-store',
            'Content-Type': 'application/json; charset=utf-8',
        }
    });

  } catch (error: any) {
    console.error("[API /stock/aggregate Error]", error);
    if (error instanceof AuthError) {
        return NextResponse.json({ ok: false, error: error.message }, { status: error.status, headers: CORS_HEADERS });
    }
    return NextResponse.json({ ok: false, error: 'An unknown server error occurred.' }, { status: 500, headers: CORS_HEADERS });
  }
}
