
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'nodejs';
export const dynamic = 'force_dynamic';
export const maxDuration = 60; // Allow up to 60s for extraction

const MODEL_NAME = process.env.GENAI_MODEL || 'gemini-1.5-flash';

// --- Utility Functions ---

function parseGermanNumber(v: any): number {
  if (v == null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  // Clean NBSP, currency symbols, thousands separators (., ', space), and normalize decimal comma to dot.
  let s = String(v)
    .replace(/\u00A0/g, ' ')              // NBSP -> space
    .replace(/[^\d,.\- ()']/g, '')        // Remove non-numeric symbols except for separators
    .trim()
    .replace(/'/g, '')                    // Swiss thousands separator
    .replace(/\./g, '')                   // German thousands separator
    .replace(/\s+/g, '')                  // Thousands separator with space
    .replace(/,/g, '.');                  // European decimal comma
  
  // Support for accounting-style negative numbers: (123.45)
  const neg = /^\(.*\)$/.test(s);
  if (neg) s = s.slice(1, -1);
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
}


type LineItem = {
  productName: string;
  productCode: string;
  quantity: number;
  unitPrice: number;
  total: number;
  uom: string;
};

function normalizeLineItems(items: any[] | undefined, fallbackTotal?: number): LineItem[] {
  const src = Array.isArray(items) ? items : [];
  let out: LineItem[] = src.map((it) => {
    const qty = parseGermanNumber(it.qty ?? it.quantity ?? it.menge ?? 1);
    const price = parseGermanNumber(it.unitPrice ?? it.price ?? it.preis ?? it.rate ?? 0);
    return {
      productName: it.productName ?? it.name ?? it.bezeichnung ?? 'ITEM',
      productCode: it.productCode ?? it.code ?? it.sku ?? '',
      quantity: qty,
      unitPrice: price,
      total: it.total != null ? parseGermanNumber(it.total) : +(qty * price).toFixed(2),
      uom: it.uom ?? it.einheit ?? 'Nos',
    };
  }).filter(r => r.quantity > 0 || r.total > 0);

  if (out.length === 0 && (fallbackTotal ?? 0) > 0) {
    out = [{ productName: 'INVOICE TOTAL', productCode: 'TOTAL', quantity: 1, unitPrice: fallbackTotal, total: fallbackTotal, uom: 'Nos' }];
  }
  return out;
}

function safeErpFallback(filename: string, errorMsg?: string) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    rechnungsnummer: `INTERNAL-${today}-${Math.random().toString(36).slice(2,7).toUpperCase()}`,
    datum: today,
    lieferantName: 'UNBEKANNT_SUPPLIER_PLACEHOLDER',
    gesamtbetrag: 0,
    rechnungspositionen: [{ productName: 'UNKNOWN ITEM', productCode: 'UNKNOWN', quantity: 1, unitPrice: 0, total: 0, uom: 'Nos' }],
    isPaid: false,
    anomalies: ['AI_CRASH_FALLBACK'],
    pdfFileName: filename,
    wahrung: 'EUR',
    error: errorMsg || 'AI processing failed.',
  };
}

function enforceErpSchemaSafety(aiResult: any, filename: string) {
    const today = new Date().toISOString().slice(0, 10);
    return {
        doctype: 'Purchase Invoice',
        ...aiResult,
        datum: aiResult?.datum || today,
        posting_date: aiResult?.datum || today,
        wahrung: (aiResult?.wahrung || aiResult?.currency || 'EUR').toString().toUpperCase() || 'EUR',
        rechnungspositionen: aiResult?.rechnungspositionen || aiResult?.items || [],
        custom_fields: {
            ...(aiResult?.custom_fields || {}),
            _source_filename: filename,
        },
    };
}

// Not needed when forcing JSON response, but good to have as a utility
function extractJsonFromString(text: string): string | null {
    const match = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
        return match[1];
    }
    const raw = text.trim();
    if (raw.startsWith('{') && raw.endsWith('}')) return raw;

    let depth = 0, start = -1;
    for (let i = 0; i < raw.length; i++) {
        if (raw[i] === '{') { if (!depth) start = i; depth++; }
        else if (raw[i] === '}') {
            depth--;
            if (!depth && start !== -1) {
                const slice = raw.slice(start, i + 1);
                try { JSON.parse(slice); return slice; } catch {}
            }
        }
    }
    return null;
}

// --- API Route Handler ---

export async function POST(req: Request) {
  let filename = 'unknown.pdf';
  try {
    const body = await req.json();
    const dataUri: string | undefined = body?.dataUri;
    filename = (body?.filename as string) || filename;

    if (!dataUri || !dataUri.startsWith('data:') || !dataUri.includes(';base64,')) {
      return NextResponse.json({ error: 'Invalid or missing data URI.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }

    const [meta, base64Data] = dataUri.split(',');
    const mimeMatch = meta.match(/^data:([^;]+);base64$/);
    const mimeType = mimeMatch?.[1] || 'application/pdf';
    
    // Harden upload checks
    const approxBytes = Math.floor(base64Data.length * 3 / 4);
    if (approxBytes > 8 * 1024 * 1024) { // ~8MB PDF
        return NextResponse.json(safeErpFallback(filename, 'PDF is too large.'), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    }
    const isMimeOk = /^application\/pdf(\s*;.*)?$/i.test(mimeType);
    if (!isMimeOk) {
        return NextResponse.json(safeErpFallback(filename, 'File is not a PDF.'), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    }

    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_GENAI_API_KEY is not set.');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
        model: MODEL_NAME,
        generationConfig: { responseMimeType: 'application/json' },
    });

    const prompt = `You are a meticulous data extractor for accounting, specialized in German and cross-border invoices. Return ONLY a valid JSON object.
The target schema has these fields: { rechnungsnummer, datum (YYYY-MM-DD), lieferantName, lieferantAdresse, zahlungsziel, zahlungsart, gesamtbetrag (number), mwstSatz (number), rechnungspositionen: [{ productName, productCode, quantity, unitPrice, total }] }.
If a value is not found, omit the key or set it to null. Ensure numbers are actual numbers (using dot as decimal separator), not strings.`;

    const generation = await model.generateContent([
      { inlineData: { data: base64Data, mimeType } },
      { text: prompt },
    ]);
    
    const responseText = generation.response.text();
    if (!responseText?.trim().startsWith('{')) throw new Error('Model did not return valid JSON.');
    
    const parsed = JSON.parse(responseText);
    let safePayload = enforceErpSchemaSafety(parsed, filename);
    
    // Final normalization before sending to client
    safePayload.gesamtbetrag = parseGermanNumber(safePayload.gesamtbetrag ?? (parsed as any).brutto ?? (parsed as any).total ?? (parsed as any).summe ?? 0);
    safePayload.rechnungspositionen = normalizeLineItems(safePayload.rechnungspositionen, safePayload.gesamtbetrag);
    if (safePayload.mwstSatz != null) {
        safePayload.mwstSatz = parseGermanNumber(safePayload.mwstSatz);
    }

    return NextResponse.json(safePayload, { headers: { 'Cache-Control': 'no-store' }});
  } catch (e: any) {
    console.error('[API /invoices/extract Error]', e);
    return NextResponse.json(
      safeErpFallback(filename, e?.message || String(e)),
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
