import { NextResponse } from 'next/server';
import type { StockReconciliation, StockEntry } from '@/lib/erpnext/types';
import { createStockReconciliation, createStockEntry } from '@/lib/erpnext/services/stock';
import { logInfo, logError } from '@/lib/logger';

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

  const start = Date.now();
  try {
    const body = await request.json();

    if (type === 'reconciliation') {
      if (!process.env.ERNEXT_STOCK_RECONCILIATION_URL) {
        return NextResponse.json(
          { error: 'Server configuration error: Stock Reconciliation URL not set.' },
          { status: 500 },
        );
      }
      const key = await createStockReconciliation(body as StockReconciliation, {
        endpoint: process.env.ERNEXT_STOCK_RECONCILIATION_URL!,
        headers,
      });
      const diagnostics = { insert: 1, update: 0, noop: 0, warnings: 0 };
      const summary = { workflow: 'stock', docType: 'Stock Reconciliation', total: 1, ...diagnostics };
      logInfo(
        { workflow: 'stock', docType: 'Stock Reconciliation', action: 'summary', duration_ms: Date.now() - start },
        'Processed stock reconciliation',
      );
      return NextResponse.json({ message: 'Stock reconciliation processed.', key, diagnostics, summary });
    }

    if (type === 'entry') {
      if (!process.env.ERNEXT_STOCK_ENTRY_URL) {
        return NextResponse.json(
          { error: 'Server configuration error: Stock Entry URL not set.' },
          { status: 500 },
        );
      }
      const key = await createStockEntry(body as StockEntry, {
        endpoint: process.env.ERNEXT_STOCK_ENTRY_URL!,
        headers,
      });
      const diagnostics = { insert: 1, update: 0, noop: 0, warnings: 0 };
      const summary = { workflow: 'stock', docType: 'Stock Entry', total: 1, ...diagnostics };
      logInfo(
        { workflow: 'stock', docType: 'Stock Entry', action: 'summary', duration_ms: Date.now() - start },
        'Processed stock entry',
      );
      return NextResponse.json({ message: 'Stock entry processed.', key, diagnostics, summary });
    }

    return NextResponse.json({ error: 'Invalid type parameter.' }, { status: 400 });
  } catch (e: any) {
    logError({ workflow: 'stock', docType: 'Stock', action: 'error' }, e, 'Failed to process stock document');
    return NextResponse.json(
      { error: e.message || 'Failed to process stock document.' },
      { status: 500 },
    );
  }
}
