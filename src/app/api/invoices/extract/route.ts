
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, GoogleAIFileManager } from '@google/generative-ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL_NAME = process.env.GENAI_MODEL || 'gemini-1.5-flash';

// Utility functions for data normalization, moved to server-side for robustness
function parseGermanNumber(v: any): number {
    if (v == null) return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    const s = String(v).trim().replace(/\./g, '').replace(/,/g, '.');
    const n = Number(s);
    return isFinite(n) ? n : 0;
}

type AnyLine = any;
function normalizeLineItems(items: AnyLine[] | undefined, fallbackTotal?: number): any[] {
    const src = Array.isArray(items) ? items : [];
    let out = src.map((it) => {
        const name = it.productName ?? it.name ?? it.bezeichnung ?? 'ITEM';
        const code = it.productCode ?? it.code ?? it.sku ?? '';
        const qty = parseGermanNumber(it.qty ?? it.quantity ?? it.menge ?? 1);
        const price = parseGermanNumber(it.price ?? it.unitPrice ?? it.preis ?? it.rate ?? 0);
        const total = it.total != null ? parseGermanNumber(it.total) : +(qty * price).toFixed(2);
        const uom = it.uom ?? it.einheit ?? 'Nos';
        return { productName: name, productCode: code, quantity: qty, unitPrice: price, total, uom };
    }).filter(r => r.quantity > 0 || r.total > 0);

    if (out.length === 0 && (fallbackTotal ?? 0) > 0) {
        out = [{ productName: 'INVOICE TOTAL', productCode: 'TOTAL', quantity: 1, unitPrice: fallbackTotal, total: fallbackTotal, uom: 'Nos' }];
    }
    return out;
}

function safeErpFallback(filename: string, errorMsg?: string) {
    const today = new Date().toISOString().slice(0, 10);
    return {
        rechnungsnummer: `INTERNAL-${today}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        datum: today,
        lieferantName: 'UNBEKANNT_SUPPLIER_PLACEHOLDER',
        gesamtbetrag: 0,
        rechnungspositionen: [{ productName: 'UNKNOWN ITEM', productCode: 'UNKNOWN', quantity: 1, unitPrice: 0, total: 0, uom: 'Nos' }],
        isPaid: false,
        anomalies: ['AI_CRASH_FALLBACK'],
        pdfFileName: filename,
        wahrung: 'EUR',
        error: errorMsg || 'AI processing failed unexpectedly on the server.',
    };
}


function enforceErpSchemaSafety<T extends Record<string, any>>(x: T, filename: string): T {
  const today = new Date().toISOString().slice(0, 10);
  x.doctype = 'Purchase Invoice';
  x.datum = x.datum || today;
  x.posting_date = x.posting_date || x.datum;
  x.bill_date = x.bill_date || x.posting_date;
  x.currency = x.currency || x.wahrung || 'EUR';
  x.lieferantName = x.lieferantName || x.supplier || 'UNBEKANNT_SUPPLIER_PLACEHOLDER';
  
  const grandTotal = parseGermanNumber(x.brutto ?? x.gesamtbetrag ?? x.total ?? x.summe ?? 0);
  x.gesamtbetrag = grandTotal;

  // Use the robust normalizeLineItems function
  x.rechnungspositionen = normalizeLineItems(x.rechnungspositionen ?? x.items, grandTotal);
  
  if (x.rechnungspositionen.length === 0) {
    x.anomalies = Array.from(new Set([...(x.anomalies || []), 'NO_ITEMS_EXTRACTED']));
  }

  x.custom_fields = {
    ...(x.custom_fields || {}),
    _source_filename: filename,
    _extraction_confidence: x.extraction_confidence ?? null,
  };
  return x;
}

function extractJsonFromString(text: string): string | null {
    const match = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
        return match[1].trim();
    }
    // Fallback for text that is just the JSON object itself
    if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
        return text.trim();
    }
    // Fallback to find the first balanced JSON object in the string
    let openBraces = 0;
    let startIndex = -1;
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '{') {
            if (openBraces === 0) {
                startIndex = i;
            }
            openBraces++;
        } else if (text[i] === '}') {
            if (openBraces > 0) {
                openBraces--;
                if (openBraces === 0 && startIndex !== -1) {
                    const potentialJson = text.substring(startIndex, i + 1);
                    try {
                        JSON.parse(potentialJson);
                        return potentialJson; // Found a valid JSON object
                    } catch (e) {
                        // Not a valid JSON object, continue searching
                        startIndex = -1;
                    }
                }
            }
        }
    }
    return null; // No valid JSON found
}


export async function POST(req: Request) {
    let uploadedFileName: string | undefined;

    // Read body ONCE
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const { dataUri, filename = 'unknown.pdf' } = body;

    try {
        if (!dataUri || !dataUri.startsWith('data:application/pdf;base64,')) {
            return NextResponse.json({ error: 'Invalid or missing PDF data URI.' }, { status: 400 });
        }

        const base64Data = dataUri.split(',')[1];
        const pdfBuffer = Buffer.from(base64Data, 'base64');
        
        const apiKey = process.env.GOOGLE_GENAI_API_KEY;
        if (!apiKey) {
            throw new Error("GOOGLE_GENAI_API_KEY is not set in the environment.");
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const fileManager = new GoogleAIFileManager(apiKey);

        const uploadResult = await fileManager.uploadFile({
            file: pdfBuffer,
            mimeType: 'application/pdf',
            displayName: filename,
        });
        uploadedFileName = uploadResult.file.name;

        const model = genAI.getGenerativeModel({ 
            model: MODEL_NAME,
            generationConfig: { responseMimeType: 'application/json' },
        });
        const prompt = `You are a meticulous data extractor for accounting, specialized in German and cross-border invoices. Output ONLY a valid JSON object, no markdown, no prose.
        The target schema has these fields: { rechnungsnummer, datum (in YYYY-MM-DD format), lieferantName, lieferantAdresse, zahlungsziel, zahlungsart, gesamtbetrag (as number), mwstSatz (as number), rechnungspositionen: [{ productName, productCode, quantity, unitPrice, total }] }.
        If a value is not found, omit the key or set it to null. Ensure numbers are actual numbers, not strings.`;

        const generationResult = await model.generateContent([
            { fileData: { fileUri: uploadResult.file.uri, mimeType: uploadResult.file.mimeType } },
            { text: prompt }
        ]);

        const responseText = generationResult.response.text();
        let parsedJson = JSON.parse(responseText);

        // Run schema safety and normalization
        const safePayload = enforceErpSchemaSafety(parsedJson, filename);

        return NextResponse.json(safePayload);

    } catch (e: any) {
        console.error("[API /invoices/extract Error]", e);
        // Return a valid fallback payload with a 200 OK status
        return NextResponse.json(safeErpFallback(filename, e.message || String(e)), { status: 200 });

    } finally {
        // Best-effort cleanup of the uploaded file
        if (uploadedFileName) {
            try {
                const apiKey = process.env.GOOGLE_GENAI_API_KEY!;
                const fileManager = new GoogleAIFileManager(apiKey);
                await fileManager.deleteFile(uploadedFileName);
            } catch (cleanupError) {
                console.warn(`Failed to clean up uploaded file ${uploadedFileName}:`, cleanupError);
            }
        }
    }
}
