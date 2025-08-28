// src/app/api/erpnext/suppliers/route.ts
import { NextResponse } from 'next/server';
import { ensureSupplierExists } from '@/lib/erpnext-api';
import { logError, logInfo } from '@/lib/logger';
import type { Supplier } from '@/lib/erpnext/types';

export const dynamic = 'force-dynamic'; // Ensure Node.js runtime

export async function POST(request: Request) {
  const suppliersPayload: Partial<Supplier>[] = await request.json();

  if (!suppliersPayload || !Array.isArray(suppliersPayload) || suppliersPayload.length === 0) {
    return NextResponse.json({ error: 'No supplier data provided.' }, { status: 400 });
  }

  logInfo(
    { workflow: 'erpnext-api', docType: 'Supplier', action: 'create-batch' },
    `Received request to ensure/create ${suppliersPayload.length} supplier(s).`
  );

  const results = [];
  let successfulCreations = 0;

  for (const supplier of suppliersPayload) {
    if (!supplier.supplier_name) {
      results.push({ success: false, error: "Missing supplier_name for one or more entries.", original: supplier });
      continue;
    }
    
    try {
      const response = await ensureSupplierExists(supplier.supplier_name, supplier);
      results.push({ success: true, data: response, original: supplier });
      successfulCreations++;
    } catch (error: any) {
      const errorMessage = error.message || 'An unknown error occurred.';
      results.push({ success: false, error: errorMessage, original: supplier });
      logError(
          { workflow: 'erpnext-api', docType: 'Supplier', action: 'item-error' },
          error,
          `Failed to ensure/create supplier: ${supplier.supplier_name}`
        );
    }
  }
  
  if (successfulCreations === suppliersPayload.length) {
    return NextResponse.json({ 
        ok: true, 
        message: `Successfully processed ${successfulCreations} supplier(s).`, 
        results 
    });
  } else {
    // Partial success
    return NextResponse.json({ 
        ok: false, 
        message: `Processed ${successfulCreations} of ${suppliersPayload.length} supplier(s). See results for details.`, 
        results 
    }, { status: 207 });
  }
}