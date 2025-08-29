import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
// ideal: server-only import pentru file manager
import { GoogleAIFileManager } from '@google/generative-ai/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL_NAME = process.env.GENAI_MODEL || 'gemini-1.5-flash';

function extractJsonFromString(txt: string): string | null {
  const m = txt.match(/```json\s*([\s\S]*?)\s*```/);
  if (m?.[1]) return m[1].trim();
  if (txt.trim().startsWith('{') && txt.trim().endsWith('}')) return txt.trim();
  return null;
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

export async function POST(req: Request) {
  let uploadedName: string | undefined;

  try {
    // 🔧 Citește body-ul o singură dată
    const { dataUri, filename = 'invoice.pdf' } = await req.json();

    if (!dataUri?.startsWith('data:application/pdf;base64,')) {
      return NextResponse.json({ error: 'Invalid or missing PDF data URI.' }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_GENAI_API_KEY is not set');

    const genAI = new GoogleGenerativeAI(apiKey);
    // ✅ Managerul de fișiere corect (NU genAI.getFileManager)
    const fileManager = new GoogleAIFileManager({ apiKey });

    const pdfBuffer = Buffer.from(dataUri.split(',')[1], 'base64');

    const upload = await fileManager.uploadFile({
      file: pdfBuffer,
      mimeType: 'application/pdf',
      displayName: filename,
    });
    uploadedName = upload.file.name;

    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const prompt = `You are a meticulous data extractor for accounting (German). Output ONLY a valid JSON object
with keys: { rechnungsnummer, datum(YYYY-MM-DD), lieferantName, lieferantAdresse, zahlungsziel, zahlungsart,
gesamtbetrag(number), mwstSatz(number), rechnungspositionen: [{ productName, productCode, quantity, unitPrice, total }], currency }.
Omit fields you can't find or set null. Numbers must be real numbers, not strings.`;

    const result = await model.generateContent([
      { fileData: { fileUri: upload.file.uri, mimeType: upload.file.mimeType } },
      { text: prompt },
    ]);

    const text = result.response.text();
    const jsonStr = extractJsonFromString(text);
    if (!jsonStr) throw new Error(`Model returned non-JSON. First 200 chars: ${text.slice(0,200)}…`);

    const parsed = JSON.parse(jsonStr);

    // (opțional) aici aplici normalizările tale server-side înainte să răspunzi…

    return NextResponse.json(parsed);
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.error('[extract invoices] error:', msg);
    // Dacă body-ul nu mai e disponibil aici, nu mai încercăm să-l citim din nou.
    return NextResponse.json(safeErpFallback('unknown.pdf', msg), { status: 200 });
  } finally {
    if (uploadedName) {
      try {
        const apiKey = process.env.GOOGLE_GENAI_API_KEY!;
        const fileManager = new GoogleAIFileManager({ apiKey });
        await fileManager.deleteFile(uploadedName);
      } catch (cleanupErr) {
        console.warn('cleanup failed:', cleanupErr);
      }
    }
  }
}
