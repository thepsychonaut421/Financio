
import { NextResponse } from 'next/server';
import { getAdminDbSafe } from '@/lib/firebase-admin';
import { getStockSettingsServer } from '@/server/stock-settings-server';
import { isShippingFee } from '@/lib/is-shipping-fee';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { uid } = await req.json() as { uid: string };
    if (!uid) {
        return NextResponse.json({ ok: false, error: 'User ID is missing.' }, { status: 400 });
    }

    const db = await getAdminDbSafe(); 
    if (!db) {
        return NextResponse.json({ ok:false, error:'Database service is unavailable.' }, { status:500 });
    }

    const settings = await getStockSettingsServer(uid);
    const snap = await db.collection('processed_invoices').where('userId','==',uid).get();

    // key: productCode || name
    const agg = new Map<string, { code:string; name:string; qty:number; source:string[] }>();
    let shippingFeesExcluded = 0;

    snap.forEach(doc=>{
        const inv = doc.data() as any;
        const items = inv?.payload?.rechnungspositionen || [];
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

            const qty = Number(it.quantity || 0);
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
        sourceInvoices: [...new Set(r.source)].slice(0,5), // Unique sources
    }));

    return NextResponse.json({ ok:true, rows, warehouse: settings.defaultWarehouse, skippedShippingItems: shippingFeesExcluded });

  } catch (error: any) {
    console.error("[API /stock/aggregate Error]", error);
    return NextResponse.json({ ok: false, error: error.message || 'An unknown error occurred.' }, { status: 500 });
  }
}
