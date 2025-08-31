
import { NextResponse } from 'next/server';
import type { ERPIncomingInvoiceItem } from '@/types/incoming-invoice';
import { mapPurchaseInvoice } from '@/lib/erpnext/mappers/invoice';
import { createPurchaseInvoice, ensureSupplierExists, ensureItemExists } from '@/lib/erpnext-api';
import { logError, logInfo } from '@/lib/logger';
import { ItemPayloadSchema } from '@/lib/erpnext/types';
import { getErpSettingsServer } from '@/server/erp-settings-server';
import type { ErpPaymentPrefs } from '@/types/erp-settings';


export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function buildPaymentsBlock(iv: ERPIncomingInvoiceItem, prefs: ErpPaymentPrefs) {
  const paid = iv.isPaidByAI === true || iv.istBezahlt === 1;
  if (!paid) return [];
  const amount = iv.gesamtbetrag ?? 0;
  if (amount <= 0) return [];
  
  return [{
    mode_of_payment: prefs.defaultModeOfPayment,
    account: prefs.defaultBankGLAccount,
    amount: amount
  }];
}

function toPurchaseInvoice(iv: ERPIncomingInvoiceItem, prefs: ErpPaymentPrefs) {
  const payload: any = {
    doctype: 'Purchase Invoice',
    company: prefs.company,
    posting_date: iv.datum?.slice(0, 10),
    due_date: iv.dueDate?.slice(0, 10),
    bill_date: iv.billDate?.slice(0,10) || iv.datum?.slice(0,10),
    bill_no: iv.rechnungsnummer,
    currency: iv.wahrung || prefs.defaultCurrency || 'EUR',
    supplier: iv.lieferantName,
    items: (iv.rechnungspositionen || []).map((p: any) => ({
      item_code: p.productCode || p.sku || p.name,
      qty: p.quantity,
      rate: p.unitPrice,
      description: p.productName
    })),
    is_paid: iv.istBezahlt,
  };
  
  const payments = buildPaymentsBlock(iv, prefs);
  if (payments.length > 0) {
      payload.payments = payments;
  }
  
  return payload;
}


export async function POST(request: Request) {
  
  if (!process.env.ERPNEXT_BASE_URL || !process.env.ERPNEXT_API_KEY || !process.env.ERPNEXT_API_SECRET) {
    logError({ workflow: 'erpnext-api', docType: 'Purchase Invoice', action: 'batch-error' }, new Error('ERPNext credentials not set'), 'Server configuration error');
    return NextResponse.json(
      { ok: false, error: 'Server configuration error: ERPNext credentials not set.' },
      { status: 500 },
    );
  }
  
  try {
    const { invoices, uid } = await request.json() as { invoices: ERPIncomingInvoiceItem[], uid: string };
    
    if (!invoices || !Array.isArray(invoices) || invoices.length === 0) {
        return NextResponse.json({ ok: false, error: 'No invoices provided.' }, { status: 400 });
    }
    if (!uid) {
        return NextResponse.json({ ok: false, error: 'User ID (uid) is missing.' }, { status: 400 });
    }
    
    const prefs = await getErpSettingsServer(uid);
    if (!prefs?.company || !prefs.defaultModeOfPayment || !prefs.defaultBankGLAccount) {
        return NextResponse.json({ ok:false, error:'Missing ERP payment settings for user. Please configure them in the Settings page.' }, { status: 400 });
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

            // Step 3: Map to ERPNext Purchase Invoice format using settings
            const erpPayload = toPurchaseInvoice(invoice, prefs);

            // Step 4: Create the Purchase Invoice
            const response = await createPurchaseInvoice(erpPayload);
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
