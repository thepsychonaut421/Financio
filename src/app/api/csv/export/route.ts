import { NextResponse } from 'next/server';
import {
  bankTransactionsToCsv,
  purchaseInvoicesToCsv,
  itemsToCsv,
  stockReconciliationsToCsv,
  stockEntriesToCsv,
} from '@/lib/csv/writers';

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  if (!type) {
    return NextResponse.json({ error: 'Missing type parameter.' }, { status: 400 });
  }

  try {
    const body = await request.json();
    let csv = '';

    switch (type) {
      case 'bank':
        csv = await bankTransactionsToCsv(body.transactions || []);
        break;
      case 'invoice':
      case 'purchase':
        csv = await purchaseInvoicesToCsv(body.invoices || []);
        break;
      case 'item':
        csv = await itemsToCsv(body.items || []);
        break;
      case 'stock-reconciliation':
        csv = await stockReconciliationsToCsv(body.stocks || body.reconciliations || []);
        break;
      case 'stock-entry':
        csv = await stockEntriesToCsv(body.entries || []);
        break;
      default:
        return NextResponse.json({ error: 'Invalid type parameter.' }, { status: 400 });
    }

    return new Response(csv, {
      headers: { 'Content-Type': 'text/csv' },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || 'Failed to generate CSV.' },
      { status: 500 },
    );
  }
}
