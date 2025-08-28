
// src/app/api/erpnext/suppliers/route.ts
import { NextResponse } from "next/server";
import { ensureSupplierExistsDE } from "@/lib/erpnext-api";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { suppliers } = await req.json() as {
      suppliers: Array<{
        name: string; type?: string; group?: string; tax_id?: string; country?: string;
        address?: { line1?: string; line2?: string; city?: string; state?: string; pincode?: string; country?: string; };
        contact?: { email?: string; mobile_no?: string; first_name?: string; last_name?: string; };
      }>
    };

    if (!Array.isArray(suppliers) || !suppliers.length) {
      return NextResponse.json({ ok:false, error:"No suppliers provided" }, { status: 400 });
    }

    const results: any[] = [];
    for (const s of suppliers) {
      if (!s.name || s.name.trim() === '') {
        results.push({ ok: false, name: s.name || 'MISSING_NAME', error: 'Supplier name is missing or empty.' });
        continue;
      }
      try {
        const r = await ensureSupplierExistsDE(s);
        results.push({ ok:true, name:s.name, status:r.status, id:r.supplier?.name });
      } catch (e:any) {
        logError(
          { workflow: 'erpnext-api', docType: 'Supplier', action: 'ensure-de-error', docId: s.name },
          e,
          `[API] Failed to ensure/create German-localized supplier: ${s.name}`
        );
        results.push({ ok:false, name:s.name, error: e?.message || String(e) });
      }
    }
    
    const succeeded = results.filter(r => r.ok).length;
    
    // Use 207 Multi-Status if some failed, 200 if all succeeded
    const responseStatus = succeeded > 0 && succeeded < results.length ? 207 : 200;
    
    return NextResponse.json({ 
        ok: succeeded === results.length, 
        total: results.length, 
        succeeded, 
        failed: results.length - succeeded, 
        results 
    }, { status: responseStatus });

  } catch (e:any) {
      logError(
        { workflow: 'erpnext-api', docType: 'Supplier', action: 'batch-error' },
        e,
        'A critical error occurred while processing the supplier batch.'
      );
      return NextResponse.json({ ok: false, error: 'Failed to process request: ' + (e.message || 'Unknown error') }, { status: 500 });
  }
}
