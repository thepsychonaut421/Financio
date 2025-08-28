import { NextResponse } from 'next/server';
import type { ERPIncomingInvoiceItem } from '@/types/incoming-invoice';
import { mapPurchaseInvoice } from '@/lib/erpnext/mappers/invoice';

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'purchase';
  const mode = searchParams.get('mode') || 'api';
  const dryRun = searchParams.get('dryRun') === 'true' || mode === 'csv';

  if (type !== 'purchase' && type !== 'sales') {
    return NextResponse.json({ error: 'Invalid type parameter.' }, { status: 400 });
  }

  if (type === 'sales') {
    return NextResponse.json({ error: 'Sales invoices are not supported yet.' }, { status: 501 });
  }

  if (mode === 'api' && !dryRun) {
    if (!process.env.ERNEXT_PURCHASE_INVOICE_URL || !process.env.ERNEXT_API_KEY || !process.env.ERNEXT_API_SECRET) {
      return NextResponse.json(
        { error: 'Server configuration error: ERPNext credentials not set.' },
        { status: 500 },
      );
    }
  }

  const headers =
    mode === 'api' && !dryRun
      ? {
          Authorization: `token ${process.env.ERNEXT_API_KEY}:${process.env.ERNEXT_API_SECRET}`,
          Accept: 'application/json',
        }
      : undefined;

  try {
    const { invoices } = (await request.json()) as { invoices: ERPIncomingInvoiceItem[] };
    const rows: string[] = [];
    for (const invoice of invoices) {
      const { csv } = await mapPurchaseInvoice(invoice, {
        endpoint: mode === 'api' && !dryRun ? process.env.ERNEXT_PURCHASE_INVOICE_URL : undefined,
        headers,
        dryRun,
      });
      if (csv) rows.push(csv);
    }

    if (mode === 'csv') {
      return new Response(rows.join('\n'), {
        headers: { 'Content-Type': 'text/csv' },
      });
    }

    return NextResponse.json({ message: `${invoices.length} invoice(s) processed.` });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || 'Failed to process invoices.' },
      { status: 500 },
    );
  }
}
