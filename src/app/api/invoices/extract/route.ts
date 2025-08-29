
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60s for extraction

const MODEL_NAME = process.env.GENAI_MODEL || 'gemini-1.5-flash';

// --- Types ---
type LineItem = {
  productName: string;
  productCode: string;
  originalProductCode?: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
  uom: string;
  autogenSku?: boolean;
};


// --- Utility Functions ---

// VAT & SKU Helpers
const LIKELY_VAT_RATES = [0, 5, 7, 10, 16, 19, 20, 21, 22, 23, 24, 25];

function snapVatRate(r: number) {
  if (!isFinite(r) || r < 0) return 0;
  let best = LIKELY_VAT_RATES[0], d = Infinity;
  for (const v of LIKELY_VAT_RATES) {
    const dd = Math.abs(v - r);
    if (dd < d) { d = dd; best = v; }
  }
  return best;
}

function sumLineTotals(items: { quantity:number; unitPrice:number; total:number }[]) {
  return items.reduce((s, it) => s + (Number.isFinite(it.total) ? it.total : (it.quantity * it.unitPrice)), 0);
}

const VAT_NAME_RX = /\b(mwst\.?|mehrwertsteuer|umsatzsteuer|ust|u\.?st\.?|vat|tva)\b/i;
const PCT_RX = /\b\d{1,2}(?:[.,]\d{1,2})?\s*%\b/;

function separateVatLine(items: LineItem[]) {
  let vatAmountFromLine = 0;
  const kept: LineItem[] = [];

  for (const it of items) {
    const name = String(it.productName || '').trim();
    const code = String(it.productCode || '').trim();
    const looksVat =
      VAT_NAME_RX.test(name) || PCT_RX.test(name) ||
      /^(vat|mwst|ust)$/i.test(code);

    if (looksVat) {
      const amount = parseGermanNumber(it.total ?? (it.unitPrice * it.quantity));
      vatAmountFromLine += amount;
      continue; // remove VAT line
    }
    kept.push(it);
  }
  return { filtered: kept, vatAmountFromLine: +vatAmountFromLine.toFixed(2) };
}

function deriveVatFromTotals(grandTotal: number, items: LineItem[]) {
  const sumItems = sumLineTotals(items);
  if (!isFinite(grandTotal) || grandTotal <= 0 || sumItems <= 0) return null;
  const approxRate = ((grandTotal / sumItems) - 1) * 100;
  return snapVatRate(+approxRate.toFixed(2));
}

function hash32(str: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36).toUpperCase();
}
function autoSku(name: string, supplier?: string) {
  const base = (supplier ? supplier + ' ' : '') + name;
  return `AUTO-${hash32(base).slice(0, 8)}`;
}


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

function normalizeLineItems(items: any[] | undefined, fallbackTotal?: number): LineItem[] {
  const src = Array.isArray(items) ? items : [];
  let out: LineItem[] = src.map((it) => {
    const qty   = parseGermanNumber(it.qty ?? it.quantity ?? it.menge ?? 1);
    const price = parseGermanNumber(it.unitPrice ?? it.price ?? it.preis ?? it.rate ?? 0);
    const name  = it.productName ?? it.name ?? it.bezeichnung ?? 'ITEM';
    const original = it.productCode ?? it.code ?? it.sku ?? '';
    let code = original;
    let autogenSku = false;

    if (!code) { code = autoSku(name, it.lieferantName || it.supplier); autogenSku = true; }
    
    const total = it.total != null ? parseGermanNumber(it.total) : +(qty * price).toFixed(2);
    const uom   = it.uom ?? it.einheit ?? 'Nos';

    return { productName: name, productCode: code, originalProductCode: original || null, quantity: qty, unitPrice: price, total, uom, autogenSku };
  }).filter(r => r.quantity > 0 || r.total > 0 || r.productName.length > 3);

  if (out.length === 0 && (fallbackTotal ?? 0) > 0) {
    out = [{ productName: 'INVOICE TOTAL', productCode: 'TOTAL', originalProductCode: null, quantity: 1, unitPrice: fallbackTotal!, total: fallbackTotal!, uom: 'Nos' }];
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
    rechnungspositionen: [{ productName: 'UNKNOWN ITEM', productCode: 'UNKNOWN', originalProductCode: null, quantity: 1, unitPrice: 0, total: 0, uom: 'Nos', autogenSku: true }],
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
    
    // 1) Normalize items
    let items = normalizeLineItems(safePayload.rechnungspositionen ?? parsed.items, safePayload.gesamtbetrag);

    // 2) Separate VAT line
    const { filtered, vatAmountFromLine } = separateVatLine(items);
    items = filtered;

    // 3) Calculate/validate VAT rate
    let mwst = parseGermanNumber(safePayload.mwstSatz ?? parsed.mwstSatz);
    const sumItems = sumLineTotals(items);
    const fromTotals = deriveVatFromTotals(safePayload.gesamtbetrag, items);
    const fromVatLine = vatAmountFromLine > 0 && sumItems > 0
        ? snapVatRate((vatAmountFromLine / sumItems) * 100)
        : null;

    if (!Number.isFinite(mwst) || mwst <= 0 || mwst >= 100) {
        mwst = fromTotals ?? fromVatLine ?? 0;
    }
    mwst = snapVatRate(mwst);
    
    // 4) Check for inconsistencies if a VAT line was found
    const MONEY_EPS = 0.02;
    const diff = +(safePayload.gesamtbetrag - sumItems).toFixed(2);
    const delta = Math.abs(diff - vatAmountFromLine);
    if (vatAmountFromLine > 0 && delta <= MONEY_EPS) {
      safePayload.anomalies = Array.from(new Set([...(safePayload.anomalies || []), 'VAT_LINE_REMOVED']));
    } else if (vatAmountFromLine > 0 && delta > MONEY_EPS) {
      safePayload.anomalies = Array.from(new Set([...(safePayload.anomalies || []), 'VAT_INCONSISTENT_ITEMS']));
    }
    
    safePayload.mwstSatz = mwst;
    safePayload.rechnungspositionen = items;

    const allZero = safePayload.rechnungspositionen.every((li: any) => parseGermanNumber(li.total) === 0);
    if (safePayload.gesamtbetrag > 0 && allZero) {
      safePayload.anomalies = Array.from(new Set([...(safePayload.anomalies || []), 'ZERO_LINES_WITH_TOTAL']));
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
