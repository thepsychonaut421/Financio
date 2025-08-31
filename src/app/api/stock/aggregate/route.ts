
import { NextResponse } from 'next/server';
import { getAdminDbSafe } from '@/lib/firebase-admin';
import { getStockSettingsServer } from '@/server/stock-settings-server';
import { isShippingFee } from '@/lib/is-shipping-fee';

async function getUidFromRequest(req: Request): Promise<string> {
    const idToken = req.headers.get('x-fb-idtoken');
    if (!idToken) {
        throw new Error('Missing or invalid Firebase ID token.');
    }
    // Dynamically import to keep cold-start times low for other scenarios
    const { auth } = await import('firebase-admin');
    const decodedToken = await auth().verifyIdToken(idToken);
    return decodedToken.uid;
}


export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const uid = await getUidFromRequest(req);

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
            const nameNorm = name; // keep original name for display
            const key = codeNorm || nameNorm.toUpperCase();
            if (!key) continue;

            const qty = Number(it.quantity || 0);
            const rec = agg.get(key) || { code: code || name, name: nameNorm, qty:0, source: [] };
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
    
    console.log(`[stock aggregate] uid=${uid} rows=${rows.length} skipped=${shippingFeesExcluded} wh="${settings.defaultWarehouse}"`);

    return NextResponse.json({ ok:true, rows, warehouse: settings.defaultWarehouse, skippedShippingItems: shippingFeesExcluded });

  } catch (error: any) {
    console.error("[API /stock/aggregate Error]", error);
    // Differentiate between auth errors and other errors
    if (error.message.includes('ID token')) {
         return NextResponse.json({ ok: false, error: 'Authentication failed. Please log in again.' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: error.message || 'An unknown error occurred.' }, { status: 500 });
  }
}
