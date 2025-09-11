// src/app/api/erpnext/stock/route.ts
import { NextResponse } from 'next/server';
import { getAdminDbSafe } from '@/lib/firebase-admin';
import { getUidFromRequest } from '@/lib/get-uid-from-request';
import { AuthError } from '@/lib/auth-error';
import { getStockSettingsServer } from '@/server/stock-settings-server';
import { getErpSettingsServer } from '@/server/erp-settings-server';
import { createResource, findResource } from '@/lib/erpnext/client';
import { logError, logInfo } from '@/lib/logger';


interface StockItem {
    productCode: string;
    productName: string;
    totalQuantity: number;
}

interface StockEntryItem {
    doctype: "Stock Entry Detail";
    item_code: string;
    qty: number;
    t_warehouse: string;
}

interface StockEntry {
    doctype: "Stock Entry";
    stock_entry_type: "Material Receipt";
    company: string;
    posting_date: string;
    items: StockEntryItem[];
}


export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Helper: normalizează headers indiferent de formă (Headers sau obiect)
function getHeader(req: any, name: string): string | undefined {
  const h = req?.headers;
  if (!h) return undefined;
  if (typeof h.get === 'function') return h.get(name) || undefined;               // NextRequest / Edge
  const key = name.toLowerCase();
  // NextApiRequest / Node / proxy objects
  return (h[key] as string) || (h[name] as string) || 
         (typeof h.getHeader === 'function' ? (h.getHeader(name) as string) : undefined);
}


export async function OPTIONS(req: Request) {
    const origin = getHeader(req, 'origin') || '*';
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Authorization, X-Firebase-Token, X-ID-Token, Content-Type',
        },
    });
}


async function createStockEntry(doc: StockEntry) {
    return await createResource("Stock Entry", doc);
}


export async function POST(req: Request) {
    let uid: string;
    let body;
    const origin = getHeader(req, 'origin') || '*';
    const CORS_HEADERS = {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
    };

    try {
        body = await req.json();
        if (!body?.idToken) {
            throw new AuthError('Missing ID token in request body.');
        }
        uid = await getUidFromRequest(body.idToken);
    } catch (error: any) {
        logError({ workflow: 'erpnext-api', docType: 'Stock Entry', action: 'auth-error' }, error, 'Authentication failed');
        return NextResponse.json({ ok: false, error: error.message }, { status: 401, headers: CORS_HEADERS });
    }

    try {
        const { items } = body as { items: StockItem[] };
        
        if (!items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ ok: false, error: 'No stock items provided.' }, { status: 400, headers: CORS_HEADERS });
        }
        
        const erpSettings = await getErpSettingsServer(uid);
        const stockSettings = await getStockSettingsServer(uid);

        if (!erpSettings?.company) {
            return NextResponse.json({ ok: false, error: 'ERPNext Company is not configured in settings.' }, { status: 400, headers: CORS_HEADERS });
        }
        if (!stockSettings?.defaultWarehouse) {
            return NextResponse.json({ ok: false, error: 'Default Warehouse is not configured in stock settings.' }, { status: 400, headers: CORS_HEADERS });
        }

        const stockEntryItems: StockEntryItem[] = items.map(item => ({
            doctype: "Stock Entry Detail",
            item_code: item.productCode,
            qty: item.totalQuantity,
            t_warehouse: stockSettings.defaultWarehouse,
        }));
        
        const stockEntryDoc: StockEntry = {
            doctype: "Stock Entry",
            stock_entry_type: "Material Receipt",
            company: erpSettings.company,
            posting_date: new Date().toISOString().slice(0, 10),
            items: stockEntryItems,
        };

        const result = await createStockEntry(stockEntryDoc);
        logInfo({ workflow: 'erpnext-api', docType: 'Stock Entry', action: 'success' }, `Successfully created Stock Entry: ${(result as any)?.name}`);

        return NextResponse.json({ ok: true, data: result }, { headers: CORS_HEADERS });

    } catch (e: any) {
        logError({ workflow: 'erpnext-api', docType: 'Stock Entry', action: 'batch-error' }, e, 'A critical error occurred while creating Stock Entry.');
        const errorMessage = e.message || 'An unknown server error occurred.';
        try {
            const parsedError = JSON.parse(errorMessage);
            return NextResponse.json({ ok: false, error: parsedError.details || parsedError.message || "Failed to create Stock Entry." }, { status: parsedError.status || 500, headers: CORS_HEADERS });
        } catch {
             return NextResponse.json({ ok: false, error: "Failed to create Stock Entry." }, { status: 500, headers: CORS_HEADERS });
        }
    }
}
