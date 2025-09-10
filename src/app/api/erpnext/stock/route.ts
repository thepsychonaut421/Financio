
// src/app/api/erpnext/stock/route.ts
import { NextResponse } from 'next/server';
import { getAdminDbSafe } from '@/lib/firebase-admin';
import { getUidFromRequest } from '@/lib/get-uid-from-request';
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
    // valuation_rate could be added if available from product catalog
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

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Firebase-Token, X-ID-Token',
};

export async function OPTIONS(req: Request) {
    return NextResponse.json({}, { headers: CORS_HEADERS });
}


async function createStockEntry(doc: StockEntry) {
    // Basic deduplication check could be added here if needed,
    // e.g., based on a hash of items, date, and purpose.
    return await createResource("Stock Entry", doc);
}


export async function POST(req: Request) {
    let uid: string;
    try {
        uid = await getUidFromRequest(req);
    } catch (error: any) {
        logError({ workflow: 'erpnext-api', docType: 'Stock Entry', action: 'auth-error' }, error, 'Authentication failed');
        return NextResponse.json({ ok: false, error: error.message }, { status: 401, headers: CORS_HEADERS });
    }

    try {
        const body = await req.json();
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
            t_warehouse: stockSettings.defaultWarehouse, // Target warehouse for Material Receipt
        }));
        
        const stockEntryDoc: StockEntry = {
            doctype: "Stock Entry",
            stock_entry_type: "Material Receipt",
            company: erpSettings.company,
            posting_date: new Date().toISOString().slice(0, 10), // Use today's date for posting
            items: stockEntryItems,
        };

        const result = await createStockEntry(stockEntryDoc);
        logInfo({ workflow: 'erpnext-api', docType: 'Stock Entry', action: 'success' }, `Successfully created Stock Entry: ${(result as any)?.name}`);

        return NextResponse.json({ ok: true, data: result }, { headers: CORS_HEADERS });

    } catch (e: any) {
        logError({ workflow: 'erpnext-api', docType: 'Stock Entry', action: 'batch-error' }, e, 'A critical error occurred while creating Stock Entry.');
        const errorMessage = e.message || 'An unknown server error occurred.';
        // Attempt to parse JSON from error message if it's a stringified object
        try {
            const parsedError = JSON.parse(errorMessage);
            return NextResponse.json({ ok: false, error: parsedError.details || parsedError.message || "Failed to create Stock Entry." }, { status: parsedError.status || 500, headers: CORS_HEADERS });
        } catch {
             return NextResponse.json({ ok: false, error: "Failed to create Stock Entry." }, { status: 500, headers: CORS_HEADERS });
        }
    }
}
