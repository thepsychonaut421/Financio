
// To enable server-side logic for Next.js, you must add 'use server'
// in the BROWSER module that IMPORTS this module.
// In this case, it's src/components/incoming-invoices/IncomingInvoicesPageContent.tsx
// (However, for API routes in the app router, 'use server' is not needed in this file itself)

import { NextResponse } from 'next/server';
import type { ERPIncomingInvoiceItem } from '@/types/incoming-invoice';
import { logInfo, logError } from '@/lib/logger';


export async function POST(request: Request) {
  const start = Date.now();
  logInfo(
    { workflow: 'export-invoice', docType: 'Purchase Invoice', action: 'start' },
    'Route /api/erpnext/export-invoice called',
  );

  if (!process.env.ERNEXT_API_URL || !process.env.ERNEXT_API_KEY || !process.env.ERNEXT_API_SECRET) {
      logError(
        { workflow: 'export-invoice', docType: 'Purchase Invoice', action: 'error' },
        new Error('ERPNext credentials not set'),
        'ERPNext API credentials are not configured in .env file.',
      );
      return NextResponse.json({ error: 'Server configuration error: ERPNext credentials not set.' }, { status: 500 });
  }


  try {
    const { invoices } = (await request.json()) as { invoices: ERPIncomingInvoiceItem[] };

    if (!invoices || !Array.isArray(invoices) || invoices.length === 0) {
      return NextResponse.json({ error: 'No invoices provided for export.' }, { status: 400 });
    }

    let successCount = 0;
    let errorCount = 0;
    const errors: { invoiceNumber?: string; error: string }[] = [];

    logInfo(
      {
        workflow: 'export-invoice',
        docType: 'Purchase Invoice',
        action: 'prepare',
      },
      `Preparing to export ${invoices.length} invoice(s) to ERPNext.`,
    );

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
        const callStart = Date.now();
        const response = await fetch(process.env.ERNEXT_API_URL!, {
          method: 'POST',
          headers: {
            'Authorization': `token ${process.env.ERNEXT_API_KEY}:${process.env.ERNEXT_API_SECRET}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(erpNextPayload),
        });
        const duration = Date.now() - callStart;

        if (!response.ok) {
          let errorData;
          try {
            errorData = await response.json();
          } catch (e) {
            const errorText = await response.text();
            errorData = { message: errorText || `ERPNext API Error: ${response.status} ${response.statusText}` };
          }
          throw new Error(errorData.message || `ERPNext API Error: ${response.status} ${response.statusText}`);
        }
        const responseData = await response.json();
        logInfo(
          {
            workflow: 'export-invoice',
            docType: 'Purchase Invoice',
            docId: invoice.rechnungsnummer,
            action: 'insert',
            duration_ms: duration,
          },
          `Created Purchase Invoice ${responseData.data.name} in ERPNext`,
        );
        successCount++;
      } catch (e: any) {
        errorCount++;
        const errorMessage = e.message || 'Unknown error during individual invoice export';
        errors.push({ invoiceNumber: invoice.rechnungsnummer || invoice.pdfFileName, error: errorMessage });
        logError(
          {
            workflow: 'export-invoice',
            docType: 'Purchase Invoice',
            docId: invoice.rechnungsnummer,
            action: 'error',
          },
          e,
          `Failed to export invoice ${invoice.rechnungsnummer} to ERPNext`,
        );
      }
    }

    const diagnostics = {
      insert: successCount,
      update: 0,
      noop: invoices.length - successCount - errorCount,
      warnings: errorCount,
    };
    const summary = {
      workflow: 'export-invoice',
      docType: 'Purchase Invoice',
      total: invoices.length,
      ...diagnostics,
    };

    if (errorCount > 0) {
      logInfo(
        {
          workflow: 'export-invoice',
          docType: 'Purchase Invoice',
          action: 'summary',
          duration_ms: Date.now() - start,
        },
        `Export partially completed. ${successCount} succeeded, ${errorCount} failed.`,
      );
      return NextResponse.json(
        {
          message: `Export partially completed. ${successCount} invoices succeeded, ${errorCount} failed.`,
          errors,
          diagnostics,
          summary,
        },
        { status: successCount > 0 ? 207 : 500 },
      );
    }

    logInfo(
      {
        workflow: 'export-invoice',
        docType: 'Purchase Invoice',
        action: 'summary',
        duration_ms: Date.now() - start,
      },
      `${successCount} invoice(s) successfully submitted to ERPNext.`,
    );
    return NextResponse.json({
      message: `${successCount} invoice(s) successfully submitted to ERPNext.`,
      diagnostics,
      summary,
    });

  } catch (error: any) {
    logError(
      { workflow: 'export-invoice', docType: 'Purchase Invoice', action: 'error' },
      error,
      'Critical Error in /api/erpnext/export-invoice',
    );
    return NextResponse.json({ error: error.message || 'An unexpected critical error occurred on the server.' }, { status: 500 });
  }
}
