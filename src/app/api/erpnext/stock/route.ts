import { NextResponse } from 'next/server';
import type { StockReconciliation, StockEntry } from '@/lib/erpnext/types';
import { createStockReconciliation, createStockEntry } from '@/lib/erpnext/services/stock';

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  if (!process.env.ERNEXT_API_KEY || !process.env.ERNEXT_API_SECRET) {
    return NextResponse.json(
      { error: 'Server configuration error: ERPNext credentials not set.' },
      { status: 500 },
    );
  }

  const headers = {
    Authorization: `token ${process.env.ERNEXT_API_KEY}:${process.env.ERNEXT_API_SECRET}`,
    Accept: 'application/json',
  };

  try {
    const body = await request.json();

    if (type === 'reconciliation') {
      if (!process.env.ERNEXT_STOCK_RECONCILIATION_URL) {
        return NextResponse.json(
          { error: 'Server configuration error: Stock Reconciliation URL not set.' },
          { status: 500 },
        );
      }
      await createStockReconciliation(body as StockReconciliation, {
        endpoint: process.env.ERNEXT_STOCK_RECONCILIATION_URL!,
        headers,
      });
      return NextResponse.json({ message: 'Stock reconciliation processed.' });
    }

    if (type === 'entry') {
      if (!process.env.ERNEXT_STOCK_ENTRY_URL) {
        return NextResponse.json(
          { error: 'Server configuration error: Stock Entry URL not set.' },
          { status: 500 },
        );
      }
      await createStockEntry(body as StockEntry, {
        endpoint: process.env.ERNEXT_STOCK_ENTRY_URL!,
        headers,
      });
      return NextResponse.json({ message: 'Stock entry processed.' });
    }

    return NextResponse.json({ error: 'Invalid type parameter.' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || 'Failed to process stock document.' },
      { status: 500 },
    );
  }
}
