
// To enable server-side logic for Next.js, you must add 'use server'
// in the BROWSER module that IMPORTS this module.
// In this case, it's src/components/incoming-invoices/IncomingInvoicesPageContent.tsx
// (However, for API routes in the app router, 'use server' is not needed in this file itself)

import { NextResponse } from 'next/server';
import type { ERPIncomingInvoiceItem } from '@/types/incoming-invoice';

// These should be loaded from environment variables
const ERPNEXT_API_URL = process.env.ERNEXT_API_URL; // e.g., https://your-erpnext-domain.com/api/resource/Purchase Invoice
const ERPNEXT_API_KEY = process.env.ERNEXT_API_KEY;
const ERPNEXT_API_SECRET = process.env.ERNEXT_API_SECRET;

export async function POST(request: Request) {
  // Log environment variables for debugging
  console.log('API Route /api/erpnext/export-invoice called.');
  console.log('ERNEXT_API_URL:', ERPNEXT_API_URL);
  console.log('ERNEXT_API_KEY:', ERPNEXT_API_KEY);
  console.log('ERNEXT_API_SECRET:', ERPNEXT_API_SECRET);

  if (!ERNEXT_API_URL || !ERNEXT_API_KEY || !ERNEXT_API_SECRET) {
    console.error('ERPNext API credentials missing or not configured. Ensure .env variables are set and server is restarted.');
    return NextResponse.json(
      { error: 'ERPNext API credentials are not configured on the server. Please check server logs and .env file.' },
      { status: 500 }
    );
  }

  try {
    const { invoices } = (await request.json()) as { invoices: ERPIncomingInvoiceItem[] };

    if (!invoices || !Array.isArray(invoices) || invoices.length === 0) {
      return NextResponse.json({ error: 'No invoices provided for export.' }, { status: 400 });
    }

    let successCount = 0;
    let errorCount = 0;
    const errors: { invoiceNumber?: string, error: string }[] = [];

    for (const invoice of invoices) {
      // Placeholder for ERPNext data mapping if needed.
      // The ERPIncomingInvoiceItem structure is designed to be close to what ERPNext might expect
      // for a Purchase Invoice, but specific field names or structures might vary.
      // Example: ERPNext might expect 'supplier' instead of 'lieferantName', 'items' instead of 'rechnungspositionen'.
      // You would perform that mapping here.

      const erpNextPayload = {
        // Example mapping, ADJUST THIS TO YOUR ERPNext API requirements
        doctype: "Purchase Invoice",
        supplier: invoice.lieferantName,
        bill_no: invoice.rechnungsnummer,
        bill_date: invoice.billDate, // Ensure this is YYYY-MM-DD
        posting_date: invoice.datum, // Ensure this is YYYY-MM-DD
        due_date: invoice.dueDate, // Ensure this is YYYY-MM-DD
        currency: invoice.wahrung || "EUR",
        grand_total: invoice.gesamtbetrag,
        is_paid: invoice.istBezahlt,
        // accounts: [ { "account_head": invoice.kontenrahmen, "debit_in_account_currency": invoice.gesamtbetrag } ], // Simplified, real structure more complex
        items: invoice.rechnungspositionen.map(item => ({
          item_code: item.productCode,
          item_name: item.productName,
          description: item.productName,
          qty: item.quantity,
          rate: item.unitPrice,
          // Add other required item fields by ERPNext
        })),
        // ... other fields required by your ERPNext setup
        // set_posting_time: 1, // Usually needed
      };

      try {
        // *******************************************************************
        // PLACEHOLDER: Actual API call to ERPNext
        // You'll need to replace this with a proper fetch call to your ERPNext instance.
        // Example using fetch:
        /*
        const response = await fetch(ERNEXT_API_URL, { // Ensure ERPNEXT_API_URL points to the Purchase Invoice endpoint
          method: 'POST',
          headers: {
            'Authorization': `token ${ERNEXT_API_KEY}:${ERNEXT_API_SECRET}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(erpNextPayload),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || `ERPNext API Error: ${response.status} ${response.statusText}`);
        }
        const responseData = await response.json();
        console.log('Successfully created Purchase Invoice in ERPNext:', responseData.data.name);
        */
        // SIMULATING API CALL FOR NOW
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
        console.log("Simulating ERPNext API call for invoice:", invoice.rechnungsnummer, "Payload:", JSON.stringify(erpNextPayload, null, 2));
        // if (Math.random() < 0.1) throw new Error("Simulated API error for " + invoice.rechnungsnummer); // Simulate occasional error
        // *******************************************************************
        
        successCount++;

      } catch (e: any) {
        errorCount++;
        errors.push({ invoiceNumber: invoice.rechnungsnummer || invoice.pdfFileName, error: e.message || "Unknown error during individual invoice export" });
        console.error(`Failed to export invoice ${invoice.rechnungsnummer} to ERPNext:`, e);
      }
    }

    if (errorCount > 0) {
      return NextResponse.json(
        { 
          message: `Export partially completed. ${successCount} invoices succeeded, ${errorCount} failed.`,
          errors
        }, 
        { status: successCount > 0 ? 207 : 500 } // Multi-Status or Server Error
      );
    }

    return NextResponse.json({ message: `${successCount} invoice(s) successfully submitted to ERPNext.` });

  } catch (error: any) {
    console.error('Critical Error in /api/erpnext/export-invoice:', error);
    return NextResponse.json({ error: error.message || 'An unexpected critical error occurred on the server.' }, { status: 500 });
  }
}
