
// To enable server-side logic for Next.js, you must add 'use server'
// in the BROWSER module that IMPORTS this module.
// In this case, it's src/components/incoming-invoices/IncomingInvoicesPageContent.tsx
// (However, for API routes in the app router, 'use server' is not needed in this file itself)

import { NextResponse } from 'next/server';
import type { ERPIncomingInvoiceItem } from '@/types/incoming-invoice';

// These should be loaded from environment variables
// const ERPNEXT_API_URL = process.env.ERNEXT_API_URL;
// const ERPNEXT_API_KEY = process.env.ERNEXT_API_KEY;
// const ERPNEXT_API_SECRET = process.env.ERNEXT_API_SECRET;

export async function POST(request: Request) {
  // Log environment variables for debugging
  console.log('[ExportERP API] Route /api/erpnext/export-invoice called.');
  // console.log('[ExportERP API] ERNEXT_API_URL:', process.env.ERNEXT_API_URL);
  // console.log('[ExportERP API] ERNEXT_API_KEY:', process.env.ERNEXT_API_KEY);
  // console.log('[ExportERP API] ERNEXT_API_SECRET:', process.env.ERNEXT_API_SECRET);


  // THIS BLOCK IS INTENTIONALLY COMMENTED OUT FOR TESTING WITHOUT REAL CREDENTIALS
  // OR WHEN CREDENTIALS ARE NOT YET SET UP.
  /*
  if (!process.env.ERNEXT_API_URL || !process.env.ERNEXT_API_KEY || !process.env.ERNEXT_API_SECRET) {
    console.error('[ExportERP API] ERPNext API credentials missing or not configured. Ensure .env variables are set and server is restarted.');
    console.log('[ExportERP API] Attempting to return JSON error for missing credentials (this check is currently COMMENTED OUT).');
    return NextResponse.json(
      { error: 'ERPNext API credentials are not configured on the server. Please check server logs and .env file.' },
      { status: 500 }
    );
  }
  */


  try {
    const { invoices } = (await request.json()) as { invoices: ERPIncomingInvoiceItem[] };

    if (!invoices || !Array.isArray(invoices) || invoices.length === 0) {
      return NextResponse.json({ error: 'No invoices provided for export.' }, { status: 400 });
    }

    let successCount = 0;
    let errorCount = 0;
    const errors: { invoiceNumber?: string, error: string }[] = [];

    console.log(`[ExportERP API] Simulating export for ${invoices.length} invoice(s).`);

    for (const invoice of invoices) {
      const erpNextPayload = {
        doctype: "Purchase Invoice",
        supplier: invoice.lieferantName,
        bill_no: invoice.rechnungsnummer,
        bill_date: invoice.billDate,
        posting_date: invoice.datum,
        due_date: invoice.dueDate,
        currency: invoice.wahrung || "EUR",
        grand_total: invoice.gesamtbetrag,
        is_paid: invoice.istBezahlt,
        items: invoice.rechnungspositionen.map(item => ({
          item_code: item.productCode,
          item_name: item.productName,
          description: item.productName,
          qty: item.quantity,
          rate: item.unitPrice,
        })),
        set_posting_time: 1,
      };

      try {
        // *******************************************************************
        // ACTUAL API call to ERPNext - REMAINS COMMENTED OUT FOR SIMULATION
        // To enable real export:
        // 1. Ensure the credential check block above is UNCOMMENTED.
        // 2. Ensure .env file has ERNEXT_API_URL, ERNEXT_API_KEY, ERNEXT_API_SECRET.
        // 3. UNCOMMENT the following fetch call.
        /*
        console.log('[ExportERP API] Attempting to fetch ERPNext API with payload:', JSON.stringify(erpNextPayload, null, 2));
        const response = await fetch(process.env.ERNEXT_API_URL!, {
          method: 'POST',
          headers: {
            'Authorization': `token ${process.env.ERNEXT_API_KEY}:${process.env.ERNEXT_API_SECRET}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(erpNextPayload),
        });
        console.log('[ExportERP API] ERPNext API response status:', response.status);


        if (!response.ok) {
          let errorData;
          try {
            errorData = await response.json();
            console.log('[ExportERP API] ERPNext API error response (JSON):', errorData);
          } catch (e) {
            const errorText = await response.text();
            console.log('[ExportERP API] ERPNext API error response (text):', errorText);
            errorData = { message: errorText || `ERPNext API Error: ${response.status} ${response.statusText}` };
          }
          throw new Error(errorData.message || `ERPNext API Error: ${response.status} ${response.statusText}`);
        }
        const responseData = await response.json();
        console.log('[ExportERP API] Successfully created Purchase Invoice in ERPNext:', responseData.data.name);
        */
        // SIMULATED SUCCESS FOR NOW:
        console.log(`[ExportERP API] SIMULATING successful export for invoice ${invoice.rechnungsnummer || invoice.pdfFileName}`);
        // *******************************************************************

        successCount++;

      } catch (e: any) {
        errorCount++;
        const errorMessage = e.message || "Unknown error during individual invoice export";
        errors.push({ invoiceNumber: invoice.rechnungsnummer || invoice.pdfFileName, error: errorMessage });
        console.error(`[ExportERP API] Failed to export invoice ${invoice.rechnungsnummer} to ERPNext:`, errorMessage, e.stack);
      }
    }

    if (errorCount > 0) {
      console.log(`[ExportERP API] Export partially completed. ${successCount} succeeded, ${errorCount} failed. Errors:`, errors);
      return NextResponse.json(
        {
          message: `Export partially completed. ${successCount} invoices succeeded, ${errorCount} failed.`,
          errors
        },
        { status: successCount > 0 ? 207 : 500 } // Use 207 for partial success
      );
    }

    console.log(`[ExportERP API] ${successCount} invoice(s) successfully SIMULATED for ERPNext.`);
    return NextResponse.json({ message: `${successCount} invoice(s) successfully submitted to ERPNext (SIMULATED).` });

  } catch (error: any) {
    console.error('[ExportERP API] Critical Error in /api/erpnext/export-invoice:', error.message, error.stack);
    return NextResponse.json({ error: error.message || 'An unexpected critical error occurred on the server.' }, { status: 500 });
  }
}
