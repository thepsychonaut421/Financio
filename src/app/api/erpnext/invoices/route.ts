
import { NextResponse } from 'next/server';
import type { ERPIncomingInvoiceItem } from '@/types/incoming-invoice';
import { mapPurchaseInvoice } from '@/lib/erpnext/mappers/invoice';
import { createPurchaseInvoice, ensureSupplierExists, ensureItemExists } from '@/lib/erpnext-api';
import { logError, logInfo } from '@/lib/logger';
import { ItemPayloadSchema } from '@/lib/erpnext/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  
  if (!process.env.ERPNEXT_BASE_URL || !process.env.ERPNEXT_API_KEY || !process.env.ERPNEXT_API_SECRET) {
    logError({ workflow: 'erpnext-api', docType: 'Purchase Invoice', action: 'batch-error' }, new Error('ERPNext credentials not set'), 'Server configuration error');
    return NextResponse.json(
      { ok: false, error: 'Server configuration error: ERPNext credentials not set.' },
      { status: 500 },
    );
  }
  
  try {
    const { invoices } = (await request.json()) as { invoices: ERPIncomingInvoiceItem[] };
    
    if (!invoices || !Array.isArray(invoices) || invoices.length === 0) {
        return NextResponse.json({ ok: false, error: 'No invoices provided.' }, { status: 400 });
    }

    const results = [];
    
    for (const invoice of invoices) {
        try {
            // Step 1: Ensure supplier exists
            if(invoice.lieferantName){
                await ensureSupplierExists(invoice.lieferantName);
            }
            
            // Step 2: Ensure all items exist
            for (const item of invoice.rechnungspositionen) {
                const itemPayload = { 
                    item_code: item.productCode || item.productName || `MISSING-${Date.now()}`,
                    item_name: item.productName || item.productCode,
                    stock_uom: 'Stk', // Default Unit
                };
                await ensureItemExists(itemPayload.item_code, itemPayload);
            }

            // Step 3: Map to ERPNext Purchase Invoice format
            const { payload } = await mapPurchaseInvoice(invoice, { dryRun: false });

            // Step 4: Create the Purchase Invoice
            const response = await createPurchaseInvoice(payload);
            results.push({ success: true, name: response.data?.name, original: invoice });
            logInfo({ workflow: 'erpnext-api', docType: 'Purchase Invoice', action: 'success' }, `Successfully created PI: ${response.data?.name}`);
        
        } catch (error: any) {
            results.push({ success: false, error: error.message, original: invoice });
            logError({ workflow: 'erpnext-api', docType: 'Purchase Invoice', action: 'item-error' }, error, `Failed to create PI for supplier: ${invoice.lieferantName}`);
        }
    }

    const successfulCreations = results.filter(r => r.success);
    const status = successfulCreations.length === invoices.length ? 200 : 207;
    
    return NextResponse.json({ 
        ok: status === 200, 
        message: `Processed ${successfulCreations.length} of ${invoices.length} invoice(s). See results for details.`, 
        results 
    }, { status });

  } catch (e: any) {
    logError({ workflow: 'erpnext-api', docType: 'Purchase Invoice', action: 'batch-error' }, e, 'A critical error occurred while processing invoices.');
    return NextResponse.json(
      { ok: false, error: e.message || 'Failed to process invoices.' },
      { status: 500 },
    );
  }
}
