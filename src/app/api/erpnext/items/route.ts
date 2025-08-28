import { NextResponse } from 'next/server';
import { createItem } from '@/lib/erpnext-api';
import type { ItemPayload } from '@/lib/erpnext/types';
import { logError, logInfo } from '@/lib/logger';

export async function POST(request: Request) {
  try {
    const itemData: ItemPayload = await request.json();

    logInfo(
      { workflow: 'erpnext-api', docType: 'Item', action: 'create' },
      `Received request to create item: ${itemData.item_name}`
    );

    const response = await createItem(itemData);

    logInfo(
      { workflow: 'erpnext-api', docType: 'Item', action: 'success', response },
      `Successfully created item: ${itemData.item_name}`
    );

    return NextResponse.json({ ok: true, data: response.data });

  } catch (e: any) {
    logError(
      { workflow: 'erpnext-api', docType: 'Item', action: 'error' },
      e,
      'Failed to create item'
    );
    return NextResponse.json(
      { ok: false, error: e.message || 'An unknown error occurred.' },
      { status: 500 }
    );
  }
}
