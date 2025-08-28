
// src/app/api/erpnext/suppliers/route.ts
import { NextResponse } from 'next/server';
import { ensureSupplierExists } from '@/lib/erpnext-api';
import { logError, logInfo } from '@/lib/logger';
import type { Supplier } from '@/lib/erpnext/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; 

export async function POST(request: Request) {
  const reqId = request.headers.get('x-req-id') || `sup-${Date.now()}`;
  logInfo({ workflow: 'erpnext-api', docType: 'Supplier', action: 'ensure-batch-start', idemKey: reqId }, `[API] Hit for supplier batch.`);
  
  let suppliersPayload: Partial<Supplier>[];
  try {
    suppliersPayload = await request.json();
  } catch (e: any) {
    logError({ workflow: 'erpnext-api', docType: 'Supplier', action: 'payload-error', idemKey: reqId }, e, "[API] Failed to parse JSON payload.");
    return NextResponse.json({ ok: false, error: 'Invalid JSON payload.' }, { status: 400 });
  }


  if (!suppliersPayload || !Array.isArray(suppliersPayload) || suppliersPayload.length === 0) {
    logError({ workflow: 'erpnext-api', docType: 'Supplier', action: 'validation-error', idemKey: reqId }, new Error("No supplier data provided"), "[API] No supplier data provided.");
    return NextResponse.json({ ok: false, error: 'No supplier data provided.' }, { status: 400 });
  }

  logInfo(
    { workflow: 'erpnext-api', docType: 'Supplier', action: 'create-batch', idemKey: reqId },
    `[API] Received request to ensure/create ${suppliersPayload.length} supplier(s).`
  );

  const results = [];
  let successfulCreations = 0;

  for (const supplier of suppliersPayload) {
    if (!supplier.supplier_name) {
      logError({ workflow: 'erpnext-api', docType: 'Supplier', action: 'item-validation-error', idemKey: reqId }, new Error("Missing supplier_name"), `[API] Missing supplier_name for an entry.`);
      results.push({ success: false, error: "Missing supplier_name for one or more entries.", original: supplier });
      continue;
    }
    
    try {
      const response = await ensureSupplierExists(supplier.supplier_name, supplier);
      logInfo({ workflow: 'erpnext-api', docType: 'Supplier', action: 'ensure-success', idemKey: reqId, docId: supplier.supplier_name }, `[API] Successfully ensured supplier: ${supplier.supplier_name}`);
      results.push({ success: true, data: response, original: supplier });
      successfulCreations++;
    } catch (error: any) {
      const errorMessage = error.message || 'An unknown error occurred.';
      results.push({ success: false, error: errorMessage, original: supplier });
      logError(
          { workflow: 'erpnext-api', docType: 'Supplier', action: 'item-error', idemKey: reqId, docId: supplier.supplier_name },
          error,
          `[API] Failed to ensure/create supplier: ${supplier.supplier_name}`
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
