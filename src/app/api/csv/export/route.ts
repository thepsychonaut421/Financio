
import { NextResponse } from 'next/server';
import { erpInvoicesToSupplierCSV, incomingInvoicesToERPNextCSVComplete } from '@/lib/export-helpers';
import type { ERPIncomingInvoiceItem } from '@/types/incoming-invoice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const { doctype, payload, filename } = await request.json();

        if (!doctype || !payload) {
            return NextResponse.json({ ok: false, error: 'Missing doctype or payload' }, { status: 400 });
        }

        let csv = '';
        let finalFilename = filename || `${doctype.replace(/ /g, '_').toLowerCase()}.csv`;

        switch (doctype) {
            case 'Supplier':
                csv = erpInvoicesToSupplierCSV(payload as ERPIncomingInvoiceItem[]);
                break;
            
            case 'Purchase Invoice':
                csv = incomingInvoicesToERPNextCSVComplete(payload as ERPIncomingInvoiceItem[]);
                break;
                
            // Add other doctypes here in the future
            // case 'Item':
            //     csv = itemsCSV(payload);
            //     break;
            
            default:
                return NextResponse.json({ ok: false, error: `Unsupported doctype: ${doctype}` }, { status: 400 });
        }

        if (!csv) {
            return NextResponse.json({ ok: false, error: 'No data to export' }, { status: 400 });
        }

        return new NextResponse(csv, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${finalFilename}"`,
            },
        });

    } catch (e: any) {
        console.error(`[API Export Error]`, e);
        return NextResponse.json({ ok: false, error: e.message || 'Failed to generate CSV.' }, { status: 500 });
    }
}
