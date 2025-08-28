import { NextResponse } from 'next/server';
import { mapItem, type InternalItem } from '@/lib/erpnext/mappers/item';
import { mergeItems } from '@/lib/erpnext/services/sku-resolver';

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || 'api';
  const dryRun = searchParams.get('dryRun') === 'true' || mode === 'csv';

  if (mode === 'api' && !dryRun) {
    if (!process.env.ERNEXT_ITEM_URL || !process.env.ERNEXT_API_KEY || !process.env.ERNEXT_API_SECRET) {
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
    const { items = [], merges = [] } = (await request.json()) as {
      items?: InternalItem[];
      merges?: { from: string; to: string }[];
    };

    for (const m of merges) {
      mergeItems(m.from, m.to);
    }

    const rows: string[] = [];
    for (const item of items) {
      const { csv } = await mapItem(item, {
        endpoint: mode === 'api' && !dryRun ? process.env.ERNEXT_ITEM_URL : undefined,
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

    return NextResponse.json({ message: `${items.length} item(s) processed.`, merges: merges.length });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || 'Failed to process items.' },
      { status: 500 },
    );
  }
}
