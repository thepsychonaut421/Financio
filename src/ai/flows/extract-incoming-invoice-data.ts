
'use server';
/**
 * @fileOverview Extracts detailed data from incoming invoices (Eingangsrechnungen).
 * THIS FLOW IS NOW PRIMARILY FOR REFERENCE AND IS NOT CALLED DIRECTLY FROM THE CLIENT.
 * The active extraction logic is in /api/invoices/extract/route.ts
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { PurchaseInvoiceSchema, type PurchaseInvoice } from '@/ai/schemas/invoice-item-schema';


function extractJsonFromString(text: string): string | null {
    const match = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
        return match[1];
    }
    if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
        return text.trim();
    }
    let depth = 0;
    let start = -1;
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '{') {
            if (depth === 0) start = i;
            depth++;
        } else if (text[i] === '}') {
            depth--;
            if (depth === 0 && start !== -1) {
                const slice = text.slice(start, i + 1);
                try {
                    JSON.parse(slice);
                    return slice; 
                } catch {
                    start = -1; 
                }
            }
        }
    }
    return null;
}

const ExtractIncomingInvoiceDataInputSchema = z.object({
  invoiceDataUri: z
    .string()
    .describe(
      "An invoice PDF, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ExtractIncomingInvoiceDataInput = z.infer<typeof ExtractIncomingInvoiceDataInputSchema>;


export type ExtractIncomingInvoiceDataOutput = PurchaseInvoice & { error?: string };


export async function extractIncomingInvoiceData(input: ExtractIncomingInvoiceDataInput): Promise<ExtractIncomingInvoiceDataOutput> {
  // This function is now deprecated in favor of the /api/invoices/extract route.
  // The implementation is kept for reference or potential future server-to-server use.
  console.warn("DEPRECATED: Direct call to extractIncomingInvoiceData flow. Use /api/invoices/extract instead.");
  return extractIncomingInvoiceDataFlow(input);
}

const prompt = ai.definePrompt({
  name: 'extractIncomingInvoiceDataPrompt',
  input: {schema: ExtractIncomingInvoiceDataInputSchema},
  prompt: `You are a meticulous data extractor for accounting, specialized in German and cross-border invoices. Output ONLY valid JSON, no prose.
Your response MUST be a valid JSON object enclosed in a markdown code block (\`\`\`json ... \`\`\`).
The target schema is based on ERPNext Purchase Invoice fields.

Extraction Rules:
- Dates: Must be in ISO format (YYYY-MM-DD). Convert from other formats like DD.MM.YYYY.
- Numbers: Must be floats with a dot as the decimal separator (e.g., 1234.56).
- Supplier: Extract full name, full address, and any tax ID (USt-IdNr., NIP). The tax ID should be placed in 'custom_fields.supplier_vat_id'.
- Order Reference: Capture any order numbers (Bestellnummer, ZK, etc.) and place them in 'custom_fields.order_reference'.
- Currency: The primary currency of the invoice should be set in the 'currency' field.
- **Multi-currency Invoices**: If the invoice shows totals in a secondary currency (e.g., PLN alongside EUR), extract the main currency (EUR) for the structured fields. Put the secondary currency details in 'currency_secondary', 'totals_secondary', and add a note in the "remarks" field.
- **Anomalies**: You MUST identify and flag special cases in an 'anomalies' array. Supported values are 'MULTI_CURRENCY', 'NO_ITEMS_EXTRACTED', 'ORDER_REFERENCE_DETECTED'.
- Credit Notes: If the document is a Gutschrift or Credit Note, set 'is_return' to true.
- Totals Check: Mentally verify that net + taxes is close to the grand total.
- **No Items Fallback**: CRITICAL: If you cannot extract any line items, you MUST return a fallback item: \`"items": [{"item_name":"UNKNOWN ITEM","qty":1,"rate":0,"amount":0}]\` and add 'NO_ITEMS_EXTRACTED' to the 'anomalies' array.
- Missing Data: NEVER return an object with an "error" key. If a required field is missing, use null for optional fields and empty strings "" for required string fields. Explain any major ambiguities or missing critical data in the "remarks" field. Always include doctype, supplier, posting_date, bill_no, and bill_date.

Target Fields Structure (including new fields):
\`\`\`json
{
  "doctype": "Purchase Invoice",
  "supplier": "string (Full Supplier Name)",
  "supplier_address": "string (Full Address)",
  "posting_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD|null",
  "bill_no": "string (Invoice Number)",
  "bill_date": "YYYY-MM-DD",
  "currency": "EUR",
  "currency_main": "EUR",
  "currency_secondary": "PLN|null",
  "totals_main": { "net": 309.48, "vat": 58.80, "gross": 368.28 },
  "totals_secondary": { "net": 1319.03, "vat": 250.62, "gross": 1569.65 },
  "items": [{ "item_code": "string|null", "item_name": "string", "qty": 1, "uom": "string", "rate": 0, "amount": 0, "tax_rate": 19, "tax_amount": 0 }],
  "taxes": [{ "charge_type": "On Net Total", "account_head": "Input Tax 19%", "rate": 19, "tax_amount": 0 }],
  "remarks": "string (Note special conditions here. Example: 'Order Ref: ZK 1216853... Secondary currency totals in PLN.')",
  "custom_fields": { "order_reference": "string|null", "payment_method": "string|null", "supplier_vat_id": "string|null" },
  "is_return": false,
  "anomalies": ["MULTI_CURRENCY", "ORDER_REFERENCE_DETECTED"],
  "extraction_confidence": 0.95,
  "missing_fields": ["iban"]
}
\`\`\`

Source document is between <DOC> tags. Focus on the main content and ignore headers/footers.
<DOC>
{{media url=invoiceDataUri}}
</DOC>
`,
});

const getErrorPayload = (message: string): PurchaseInvoice & { error: string } => {
  const now = new Date().toISOString().slice(0, 10);
  return {
    doctype: 'Purchase Invoice',
    supplier: 'ERROR',
    posting_date: now,
    bill_no: `ERROR-${Date.now()}`,
    bill_date: now,
    items: [{item_name: 'ERROR', qty: 1, uom: 'Nos', rate: 0, amount: 0}],
    error: message,
    anomalies: ['EXTRACTION_FAILED'],
  };
};


const extractIncomingInvoiceDataFlow = ai.defineFlow(
  {
    name: 'extractIncomingInvoiceDataFlow',
    inputSchema: ExtractIncomingInvoiceDataInputSchema,
    outputSchema: PurchaseInvoiceSchema.extend({ error: z.string().optional() }),
  },
  async (input) => {
    let rawResponseText: string | undefined;
    try {
        const { output } = await prompt(input, {model: 'googleai/gemini-1.5-flash-latest'});
        rawResponseText = output;
        
        if (!rawResponseText) {
            return getErrorPayload('The AI model returned an empty response.');
        }

        const jsonString = extractJsonFromString(rawResponseText);
        
        if (!jsonString) {
            console.error("AI output did not contain a valid JSON block. Raw output:", rawResponseText);
            return getErrorPayload('The AI model returned a non-JSON response.');
        }
        
        let parsedJson;
        try {
            parsedJson = JSON.parse(jsonString);
        } catch (e: any) {
            console.error("Failed to parse JSON from AI output. JSON string:", jsonString, "Error:", e.message);
            return getErrorPayload(`Failed to parse the AI's JSON response: ${e.message}`);
        }

        if (parsedJson && typeof parsedJson === 'object' && 'error' in parsedJson) {
            const errorMessage = (parsedJson as {error: string}).error || 'Unknown error from AI model.';
            console.error("AI returned an error object:", errorMessage);
            return getErrorPayload(`AI Model Error: ${errorMessage}`);
        }
        
        if (!parsedJson.items || !Array.isArray(parsedJson.items) || parsedJson.items.length === 0) {
            parsedJson.items = [{ item_name: 'UNKNOWN ITEM', qty: 1, rate: 0, amount: 0, uom: 'Nos' }];
            if (!parsedJson.anomalies) parsedJson.anomalies = [];
            if (!parsedJson.anomalies.includes('NO_ITEMS_EXTRACTED')) {
                parsedJson.anomalies.push('NO_ITEMS_EXTRACTED');
            }
        }

        const validationResult = PurchaseInvoiceSchema.safeParse(parsedJson);

        if (!validationResult.success) {
            console.error("AI output failed Zod validation:", validationResult.error.flatten());
            return getErrorPayload(`AI data has an unexpected format: ${validationResult.error.flatten().formErrors.join(', ')}`);
        }
        
        const doc = validationResult.data;
        doc.items = doc.items.map(it => ({
            ...it,
            amount: Number((it.qty * it.rate).toFixed(2)),
            tax_amount: it.tax_rate ? Number(((it.qty * it.rate) * it.tax_rate / 100).toFixed(2)) : (it.tax_amount ?? 0),
        }));

        return doc;

    } catch (e: any) {
        if (e.message && (e.message.includes('503') || e.message.includes('overloaded'))) {
            return getErrorPayload("The AI service is currently busy or unavailable. Please try again in a few moments.");
        }
        console.error("Critical error in extractIncomingInvoiceDataFlow:", e);
        return getErrorPayload("An unexpected critical error occurred during invoice extraction.");
    }
  }
);
