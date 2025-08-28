import { NextResponse } from 'next/server';
import type { ERPIncomingInvoiceItem } from '@/types/incoming-invoice';
import { mapPurchaseInvoice } from '@/lib/erpnext/mappers/invoice';
import { createPurchaseInvoice } from '@/lib/erpnext-api';
import { logError, logInfo } from '@/lib/logger';


export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'purchase';
  const mode = searchParams.get('mode') || 'api';
  const dryRun = searchParams.get('dryRun') === 'true' || mode === 'csv';

  if (type !== 'purchase') {
    return NextResponse.json({ error: 'Only purchase invoices are supported at this endpoint.' }, { status: 400 });
  }

  const isApiMode = mode === 'api' && !dryRun;

  if (isApiMode) {
    if (!process.env.ERPNEXT_BASE_URL || !process.env.ERPNEXT_API_KEY || !process.env.ERPNEXT_API_SECRET) {
      return NextResponse.json(
        { error: 'Server configuration error: ERPNext credentials not set.' },
        { status: 500 },
      );
    }
  }
  
  try {
    const { invoices } = (await request.json()) as { invoices: ERPIncomingInvoiceItem[] };
    
    if (!invoices || !Array.isArray(invoices) || invoices.length === 0) {
        return NextResponse.json({ error: 'No invoices provided.' }, { status: 400 });
    }

    const results = [];
    
    for (const invoice of invoices) {
        const { payload, csv } = await mapPurchaseInvoice(invoice, { dryRun });

        if (isApiMode) {
            try {
                const response = await createPurchaseInvoice(payload);
                results.push({ success: true, name: response.data?.name, csv, payload, original: invoice });
                logInfo({ workflow: 'erpnext-api', docType: 'Purchase Invoice', action: 'success' }, `Successfully created PI: ${response.data?.name}`);
            } catch (error: any) {
                results.push({ success: false, error: error.message, csv, payload, original: invoice });
                logError({ workflow: 'erpnext-api', docType: 'Purchase Invoice', action: 'item-error' }, error, `Failed to create PI for supplier: ${invoice.lieferantName}`);
            }
        } else { // CSV Mode
            results.push({ success: true, csv, payload, original: invoice });
        }
    }
    
    if (mode === 'csv') {
      const allCsvRows = results.map(r => r.csv).join('\n');
      return new Response(allCsvRows, {
        headers: { 'Content-Type': 'text/csv' },
      });
    }

    const successfulCreations = results.filter(r => r.success);
    if(successfulCreations.length === invoices.length) {
        return NextResponse.json({ ok: true, message: `Successfully processed ${successfulCreations.length} invoice(s).`, results });
    } else {
        return NextResponse.json({ ok: false, message: `Processed ${successfulCreations.length} of ${invoices.length} invoice(s).`, results }, { status: 207 });
    }

  } catch (e: any) {
    logError({ workflow: 'erpnext-api', docType: 'Purchase Invoice', action: 'batch-error' }, e, 'A critical error occurred while processing invoices.');
    return NextResponse.json(
      { error: e.message || 'Failed to process invoices.' },
      { status: 500 },
    );
  }
}
