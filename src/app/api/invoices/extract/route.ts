
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL_NAME = process.env.GENAI_MODEL || 'gemini-1.5-flash';

// --- Utility Functions (moved from client-side) ---

function parseGermanNumber(v: any): number {
  if (v == null) return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const s = String(v).trim().replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

type AnyLine = any;
function normalizeLineItems(items: AnyLine[] | undefined, fallbackTotal?: number) {
  const src = Array.isArray(items) ? items : [];
  let out = src.map((it) => {
    const name = it.productName ?? it.name ?? it.bezeichnung ?? 'ITEM';
    const code = it.productCode ?? it.code ?? it.sku ?? '';
    const qty  = parseGermanNumber(it.qty ?? it.quantity ?? it.menge ?? 1);
    const price= parseGermanNumber(it.unitPrice ?? it.price ?? it.preis ?? it.rate ?? 0);
    const total= it.total != null ? parseGermanNumber(it.total) : +(qty * price).toFixed(2);
    const uom  = it.uom ?? it.einheit ?? 'Nos';
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
        rechnungspositionen: aiResult?.rechnungspositionen || [],
        custom_fields: {
            ...(aiResult?.custom_fields || {}),
            _source_filename: filename,
        },
    };
}

function extractJsonFromString(text: string): string | null {
    const match = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
        return match[1];
    }
    if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
        return text.trim();
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
      return NextResponse.json(
        { error: 'Invalid or missing data URI.' },
        { status: 400 }
      );
    }

    const [meta, base64Data] = dataUri.split(',');
    const mimeMatch = meta.match(/^data:([^;]+);base64$/);
    const mimeType = mimeMatch?.[1] || 'application/pdf';

    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_GENAI_API_KEY is not set.');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const prompt = `You are a meticulous data extractor for accounting, specialized in German and cross-border invoices. Output ONLY a valid JSON object, no markdown, no prose.
The target schema has these fields: { rechnungsnummer, datum (YYYY-MM-DD), lieferantName, lieferantAdresse, zahlungsziel, zahlungsart, gesamtbetrag (number), mwstSatz (number), rechnungspositionen: [{ productName, productCode, quantity, unitPrice, total }] }.
If a value is not found, omit the key or set it to null. Ensure numbers are actual numbers, not strings.`;

    const generation = await model.generateContent([
      { inlineData: { data: base64Data, mimeType } },
      { text: prompt },
    ]);

    const responseText = generation.response.text();
    const jsonString = extractJsonFromString(responseText);
    if (!jsonString) {
      throw new Error(`AI returned a non-JSON response. Raw text: ${responseText.slice(0, 200)}...`);
    }

    const parsed = JSON.parse(jsonString);
    const safePayload = enforceErpSchemaSafety(parsed, filename);
    
    // Final normalization before sending to client
    const grandTotal = parseGermanNumber(safePayload.gesamtbetrag ?? (parsed as any).brutto ?? (parsed as any).total ?? (parsed as any).summe ?? 0);
    safePayload.gesamtbetrag = grandTotal;
    safePayload.rechnungspositionen = normalizeLineItems(safePayload.rechnungspositionen ?? parsed.items, grandTotal);

    return NextResponse.json(safePayload);
  } catch (e: any) {
    console.error('[API /invoices/extract Error]', e);
    return NextResponse.json(
      safeErpFallback(filename, e?.message || String(e)),
      { status: 200 }
    );
  }
}
