
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
import { AILineItemSchema, type AppLineItem } from '@/ai/schemas/invoice-item-schema';

const ExtractIncomingInvoiceDataInputSchema = z.object({
  invoiceDataUri: z
    .string()
    .describe(
      "An invoice PDF, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ExtractIncomingInvoiceDataInput = z.infer<typeof ExtractIncomingInvoiceDataInputSchema>;

// Schema for AI model output (uses AILineItemSchema for flexibility)
const AIOutputSchema = z.object({
  doctype: z.literal('Purchase Invoice'),
  supplier: z.string().optional(),
  posting_date: z.string().optional().describe("Invoice date in YYYY-MM-DD format."),
  due_date: z.string().optional().describe("Due date in YYYY-MM-DD format."),
  bill_no: z.string().optional().describe("Invoice number."),
  bill_date: z.string().optional().describe("Same as posting_date, in YYYY-MM-DD format."),
  currency: z.string().optional().default('EUR'),
  buying_price_list: z.string().optional().default('Standard Buying'),
  items: z.array(AILineItemSchema).optional().describe('An array of line items.'),
  taxes: z.array(z.object({
    charge_type: z.string().optional(),
    account_head: z.string().optional(),
    rate: z.number().optional(),
    tax_amount: z.number().optional(),
  })).optional(),
  supplier_address: z.string().optional(),
  contact_person: z.string().optional(),
  remarks: z.string().optional().describe("Any additional text from the invoice."),
  custom_fields: z.object({
    order_reference: z.string().optional(),
    payment_method: z.string().optional(),
    delivery_method: z.string().optional(),
    iban: z.string().optional(),
    swift: z.string().optional(),
  }).optional(),
  is_return: z.number().optional().describe("1 if it's a credit note (Gutschrift), otherwise 0 or undefined."),
  error: z.string().optional().describe('An error message if the operation failed.'),
});


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
  const rawOutput = await extractIncomingInvoiceDataFlow(input);

  if (rawOutput.error) {
    return { rechnungspositionen: [], error: rawOutput.error };
  }

  const normalizedLineItems: AppLineItem[] = (rawOutput.items || []).map(item => ({
    productCode: normalizeProductCode(item.productCode),
    productName: String(item.productName || '').trim().replace(/\n/g, ' '),
    quantity: item.quantity === undefined ? 0 : item.quantity,
    unitPrice: item.unitPrice === undefined ? 0.0 : item.unitPrice,
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
    isReturn: rawOutput.is_return === 1,
  };
  
  return normalizedOutput;
}

const prompt = ai.definePrompt({
  name: 'extractIncomingInvoiceDataPrompt',
  input: {schema: ExtractIncomingInvoiceDataInputSchema},
  output: {schema: AIOutputSchema}, // AI tries to fill this schema
  prompt: `Extrage din PDF-ul atașat toate informațiile relevante pentru contabilitate și ERPNext și structurează-le într-un obiect JSON gata de inserat ca Purchase Invoice în ERPNext.

Respectă următoarea structură:

{
  "doctype": "Purchase Invoice",
  "supplier": "string",
  "posting_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD",
  "bill_no": "string",
  "bill_date": "YYYY-MM-DD",
  "currency": "EUR",
  "buying_price_list": "Standard Buying",
  "items": [
    {
      "productCode": "string (ArtikelNr.)",
      "productName": "string (descriere produs)",
      "quantity": 1,
      "unitPrice": 0.00
    }
  ],
  "taxes": [
    {
      "charge_type": "On Net Total",
      "account_head": "Input Tax 19%",
      "rate": 19,
      "tax_amount": 0.00
    }
  ],
  "supplier_address": "string",
  "contact_person": "string",
  "remarks": "Orice text adițional de pe factură (ex: Klarna, DHL, AGB, retur etc.)",
  "custom_fields": {
    "order_reference": "string",
    "payment_method": "string (Klarna, PayPal etc.)",
    "delivery_method": "string (DHL, Spedition etc.)",
    "iban": "string dacă apare",
    "swift": "string dacă apare"
  },
  "is_return": 1
}

Instrucțiuni:
	1.	Completează câmpurile lipsă (ex: due_date) pe baza contextului sau lasă null dacă nu există.
	2.	Normalizează datele (format ISO pentru date, numere în float).
	3.	Asigură-te că toate sumele se potrivesc: net + TVA = brut.
	4.	Dacă factura e Gutschrift, marchează în JSON is_return: 1.
	5.	Pune toate notele adiționale (Klarna, „Bitte nicht auf unser Konto zahlen”, WEEE, etc.) în remarks.

Output-ul final trebuie să fie un JSON valid, fără explicații suplimentare.

Invoice: {{media url=invoiceDataUri}}`,
});

const extractIncomingInvoiceDataFlow = ai.defineFlow(
  {
    name: 'extractIncomingInvoiceDataFlow',
    inputSchema: ExtractIncomingInvoiceDataInputSchema,
    outputSchema: AIOutputSchema, // Flow's direct output matches AI's schema
  },
  async (input) => {
    try {
        const {output} = await prompt(input, {model: 'googleai/gemini-1.5-flash-latest'});
        return output || { doctype: 'Purchase Invoice' };
    } catch (e: any) {
        if (e.message && (e.message.includes('503') || e.message.includes('overloaded'))) {
            return { doctype: 'Purchase Invoice', error: "The AI service is currently busy or unavailable. Please try again in a few moments." };
        }
        return { doctype: 'Purchase Invoice', error: "An unexpected error occurred during invoice extraction." };
    }
  }
);
