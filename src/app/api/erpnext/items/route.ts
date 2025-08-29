
import { NextResponse } from 'next/server';
import { createItem, ensureItemExists } from '@/lib/erpnext-api';
import type { ItemPayload } from '@/lib/erpnext/types';
import { logError, logInfo } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { items } = await request.json() as { items: Array<Partial<ItemPayload>> };

    if (!items || !Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ ok: false, error: 'No items provided.' }, { status: 400 });
    }

    const results = [];
    for (const item of items) {
        if (!item.item_code) {
            results.push({ success: false, error: "Missing item_code", original: item });
            continue;
        }
        try {
            const result = await ensureItemExists(item.item_code, item);
            results.push({ success: true, status: (result as any).doc ? 'created' : 'exists', data: result, original: item });
        } catch (error: any) {
            results.push({ success: false, error: error.message, original: item });
            logError({ workflow: 'erpnext-api', docType: 'Item', action: 'ensure-error' }, error, `Failed to ensure item: ${item.item_code}`);
        }
    }

    const successfulEnsures = results.filter(r => r.success);
    const status = successfulEnsures.length === items.length ? 200 : 207;

    return NextResponse.json({ 
        ok: status === 200, 
        message: `Successfully ensured ${successfulEnsures.length} of ${items.length} items.`, 
        results 
    }, { status });

  } catch (e: any) {
    logError({ workflow: 'erpnext-api', docType: 'Item', action: 'batch-error' }, e, 'A critical error occurred while processing items.');
    return NextResponse.json(
      { ok: false, error: e.message || 'An unknown error occurred.' },
      { status: 500 }
    );
  }
}

    