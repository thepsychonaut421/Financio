
'use server';
/**
 * @fileOverview Extracts detailed data from incoming invoices (Eingangsrechnungen).
 *
 * - extractIncomingInvoiceData - A function that extracts comprehensive details from an invoice PDF.
 * - ExtractIncomingInvoiceDataInput - The input type for the function.
 * - ExtractIncomingInvoiceDataOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { AILineItemSchema, type AppLineItem, PurchaseInvoiceSchema, type PurchaseInvoice } from '@/ai/schemas/invoice-item-schema';


function extractJsonFromString(text: string): string | null {
    const match = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
        return match[1];
    }
    if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
        return text.trim();
    }
    // Fallback for finding the first balanced JSON object
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


// Type for the exported function's return value
export type ExtractIncomingInvoiceDataOutput = {
  rechnungsnummer?: string;
  datum?: string;
  lieferantName?: string;
  lieferantAdresse?: string;
  zahlungsziel?: string; // Can be derived from due_date
  zahlungsart?: string;
  gesamtbetrag?: number; // Can be calculated from items and taxes
  mwstSatz?: string; // Can be derived from taxes
  rechnungspositionen: AppLineItem[];
  kundenNummer?: string; // Part of custom_fields or remarks
  bestellNummer?: string;
  isPaid?: boolean; // Can be inferred from payment_method or remarks
  error?: string;
  // Exposing new fields
  dueDate?: string;
  taxes?: { charge_type?: string; account_head?: string; rate?: number; tax_amount?: number; }[];
  remarks?: string;
  isReturn?: boolean;
}

// Helper function for product code normalization
function normalizeProductCode(code: any): string {
  let strCode = String(code || '').trim().replace(/\n/g, ' ');
  if (/^[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)$/.test(strCode)) {
    const num = Number(strCode);
    if (!isNaN(num) && isFinite(num)) {
      return num.toString();
    }
  }
  return strCode;
}


export async function extractIncomingInvoiceData(input: ExtractIncomingInvoiceDataInput): Promise<ExtractIncomingInvoiceDataOutput> {
  let rawOutput: PurchaseInvoice & { error?: string};

  try {
    rawOutput = await extractIncomingInvoiceDataFlow(input);
  } catch(e: any) {
    console.error("[extractIncomingInvoiceData] Flow failed:", e);
    return { rechnungspositionen: [], error: e.message || "The AI flow encountered a critical error." };
  }


  if (rawOutput.error) {
    return { rechnungspositionen: [], error: rawOutput.error };
  }

  const normalizedLineItems: AppLineItem[] = (rawOutput.items || []).map(item => ({
    productCode: normalizeProductCode(item.item_code),
    productName: String(item.item_name || '').trim().replace(/\n/g, ' '),
    quantity: item.qty ?? 0,
    unitPrice: item.rate ?? 0.0,
  }));

  const totalAmountFromItems = normalizedLineItems.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
  const totalTaxAmount = (rawOutput.taxes || []).reduce((acc, tax) => acc + (tax.tax_amount || 0), 0);

  const normalizedOutput: ExtractIncomingInvoiceDataOutput = {
    rechnungsnummer: rawOutput.bill_no,
    datum: rawOutput.posting_date,
    lieferantName: String(rawOutput.supplier || '').trim().replace(/\n/g, ' '),
    lieferantAdresse: String(rawOutput.supplier_address || '').trim().replace(/\n/g, ' '),
    zahlungsziel: rawOutput.due_date, // Directly use due_date
    zahlungsart: rawOutput.custom_fields?.payment_method,
    gesamtbetrag: totalAmountFromItems + totalTaxAmount,
    mwstSatz: rawOutput.taxes?.[0]?.rate?.toString() ? `${rawOutput.taxes[0].rate}%` : undefined,
    rechnungspositionen: normalizedLineItems,
    bestellNummer: rawOutput.custom_fields?.order_reference,
    // Infer isPaid, can be improved
    isPaid: rawOutput.custom_fields?.payment_method?.toLowerCase().includes('klarna') || rawOutput.custom_fields?.payment_method?.toLowerCase().includes('paypal'),
    error: rawOutput.error,
    // New fields
    dueDate: rawOutput.due_date,
    taxes: rawOutput.taxes,
    remarks: rawOutput.remarks,
    isReturn: !!rawOutput.is_return,
  };
  
  return normalizedOutput;
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
- Supplier: Extract full name, full address, and any tax ID (USt-IdNr., NIP). The tax ID should be placed in the "remarks" field.
- Order Reference: Capture any order numbers (Bestellnummer, ZK, etc.) and place them in 'custom_fields.order_reference'.
- Currency: The primary currency of the invoice should be set in the 'currency' field.
- **Multi-currency Invoices**: If the invoice shows totals in a secondary currency (e.g., PLN alongside EUR), extract the main currency (EUR) for the structured fields. Add a detailed note in the "remarks" field describing the secondary currency totals (e.g., "Also shows totals in PLN: Net 1319.03, VAT 250.62, Gross 1569.65.").
- Credit Notes: If the document is a Gutschrift or Credit Note, set 'is_return' to true.
- Totals Check: Mentally verify that net + taxes is close to the grand total.
- Missing Data: NEVER return an object with an "error" key. If a required field is missing, use null for optional fields and empty strings "" for required string fields. Explain any major ambiguities or missing critical data (like a missing invoice number) in the "remarks" field. Always include doctype, supplier, posting_date, bill_no, and bill_date.

Target Fields Structure:
\`\`\`json
{
  "doctype": "Purchase Invoice",
  "supplier": "string (Full Supplier Name)",
  "posting_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD|null",
  "bill_no": "string (Invoice Number)",
  "bill_date": "YYYY-MM-DD",
  "currency": "EUR",
  "items": [{ "item_code": "string|null", "item_name": "string", "qty": 1, "uom": "string", "rate": 0, "amount": 0, "tax_rate": 19, "tax_amount": 0 }],
  "taxes": [{ "charge_type": "On Net Total", "account_head": "Input Tax 19%", "rate": 19, "tax_amount": 0 }],
  "supplier_address": "string (Full Address)",
  "remarks": "string (Note any special conditions, secondary currency totals, or tax IDs here. Example: 'Tax ID: PL7773297218. Also shows totals in PLN: Net 1319.03, VAT 250.62, Gross 1569.65.')",
  "custom_fields": { "order_reference": "string|null", "payment_method": "string|null" },
  "is_return": false
}
\`\`\`

Source document is between <DOC> tags. Focus on the main content and ignore headers/footers.
<DOC>
{{media url=invoiceDataUri}}
</DOC>
`,
});

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
            return { error: 'The AI model returned an empty response.' };
        }

        const jsonString = extractJsonFromString(rawResponseText);
        
        if (!jsonString) {
            console.error("AI output did not contain a valid JSON block. Raw output:", rawResponseText);
            return { error: 'The AI model returned a non-JSON response.' };
        }
        
        let parsedJson;
        try {
            parsedJson = JSON.parse(jsonString);
        } catch (e: any) {
            console.error("Failed to parse JSON from AI output. JSON string:", jsonString, "Error:", e.message);
            return { error: `Failed to parse the AI's JSON response: ${e.message}` };
        }

        // IMPORTANT: Check for an "error" property in the AI's JSON response *before* validation.
        if (parsedJson && typeof parsedJson === 'object' && 'error' in parsedJson) {
            const errorMessage = (parsedJson as {error: string}).error || 'Unknown error from AI model.';
            console.error("AI returned an error object:", errorMessage);
            return { error: `AI Model Error: ${errorMessage}` };
        }
        
        const validationResult = PurchaseInvoiceSchema.safeParse(parsedJson);

        if (!validationResult.success) {
            console.error("AI output failed Zod validation:", validationResult.error.flatten());
            return { error: `AI data has an unexpected format: ${validationResult.error.flatten().formErrors.join(', ')}` };
        }
        
        // Final sanity check on item amounts
        const doc = validationResult.data;
        doc.items = doc.items.map(it => ({
            ...it,
            amount: Number((it.qty * it.rate).toFixed(2)),
            tax_amount: it.tax_rate ? Number(((it.qty * it.rate) * it.tax_rate / 100).toFixed(2)) : (it.tax_amount ?? 0),
        }));

        return doc;

    } catch (e: any) {
        if (e.message && (e.message.includes('503') || e.message.includes('overloaded'))) {
            return { error: "The AI service is currently busy or unavailable. Please try again in a few moments." };
        }
        console.error("Critical error in extractIncomingInvoiceDataFlow:", e);
        return { error: "An unexpected critical error occurred during invoice extraction." };
    }
  }
);
