'use server';
/**
 * @fileOverview Suggests a new filename for a PDF based on its content.
 *
 * - suggestPdfFilename - A function that suggests a filename.
 * - SuggestPdfFilenameInput - The input type for the function.
 * - SuggestPdfFilenameOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const SuggestPdfFilenameInputSchema = z.object({
  pdfDataUri: z
    .string()
    .describe(
      "A PDF document, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  originalFilename: z.string().describe("The original filename of the PDF, including extension."),
});
export type SuggestPdfFilenameInput = z.infer<typeof SuggestPdfFilenameInputSchema>;

const SuggestPdfFilenameOutputSchema = z.object({
  suggestedFilename: z.string().describe("A suggested filename, e.g., YYYY-MM-DD_Supplier_InvoiceNumber.pdf or InvoiceNumber_Supplier.pdf. Should end with .pdf"),
  extractedInvoiceNumber: z.string().optional().describe('The extracted invoice number, if found.'),
  extractedSupplierName: z.string().optional().describe('The extracted supplier name, if found.'),
  extractedDate: z.string().optional().describe('The extracted invoice date (preferably YYYY-MM-DD), if found.'),
});
export type SuggestPdfFilenameOutput = z.infer<typeof SuggestPdfFilenameOutputSchema>;

function sanitizeFilename(name: string): string {
  // Remove or replace characters illegal in most file systems
  let sanitized = name.replace(/[\\/:*?"<>|]/g, '_');
  // Replace multiple underscores with a single one
  sanitized = sanitized.replace(/__+/g, '_');
  // Trim leading/trailing underscores/spaces
  sanitized = sanitized.replace(/^_+|_+$/g, '').trim();
  // Ensure it's not empty
  if (!sanitized) {
    sanitized = 'document';
  }
  // Ensure it ends with .pdf
  if (!sanitized.toLowerCase().endsWith('.pdf')) {
    sanitized += '.pdf';
  }
  return sanitized;
}

export async function suggestPdfFilename(input: SuggestPdfFilenameInput): Promise<SuggestPdfFilenameOutput> {
  const rawResult = await suggestPdfFilenameFlow(input);
  
  let finalFilename = rawResult.suggestedFilename;
  if (!finalFilename || finalFilename.trim() === '' || finalFilename.toLowerCase() === '.pdf') {
    // Fallback if AI returns an empty or invalid suggestion
    const originalNameWithoutExt = input.originalFilename.substring(0, input.originalFilename.lastIndexOf('.')) || input.originalFilename;
    finalFilename = `Processed_${originalNameWithoutExt}.pdf`;
  }

  return {
    ...rawResult,
    suggestedFilename: sanitizeFilename(finalFilename),
  };
}

const prompt = ai.definePrompt({
  name: 'suggestPdfFilenamePrompt',
  input: { schema: SuggestPdfFilenameInputSchema },
  output: { schema: SuggestPdfFilenameOutputSchema },
  model: 'googleai/gemini-2.0-flash',
  prompt: `You are an expert AI assistant that suggests concise and informative filenames for PDF documents, which are often invoices or official documents.
You will receive a PDF as a data URI and its original filename.

Your primary goal is to extract:
1.  Invoice Number (Rechnungsnummer, Invoice No., etc.) - This is the most important piece of information.
2.  Supplier Name (Lieferant, Company Name, Aussteller) - A short, recognizable version.
3.  Invoice Date (Rechnungsdatum, Datum, Date) - Format as YYYY-MM-DD if possible.

Based on the extracted information, construct a new filename. Follow these patterns, prioritizing the first one that has sufficient data:
- If Invoice Number, Supplier, and Date are found: YYYY-MM-DD_SupplierNameShort_InvoiceNumber.pdf
- If Invoice Number and Supplier are found: SupplierNameShort_InvoiceNumber.pdf
- If Invoice Number and Date are found: YYYY-MM-DD_InvoiceNumber.pdf
- If Supplier and Date are found: YYYY-MM-DD_SupplierNameShort.pdf
- If only Invoice Number is found: InvoiceNumber.pdf
- If only Supplier is found: SupplierNameShort.pdf
- If only Date is found: YYYY-MM-DD_document.pdf

If specific details (Invoice Number, Supplier, Date) cannot be reliably extracted, use a fallback based on the original filename:
- Fallback: Construct a name like "Processed_ORIGINAL_FILENAME_SANS_EXTENSION.pdf" using the 'Original Filename' I provide you (you'll need to remove the extension like .pdf from it).

General Rules:
- The final suggested filename MUST end with ".pdf".
- Keep supplier names short and recognizable (e.g., "Amazon" instead of "Amazon EU S.a.r.l.").
- Ensure the filename is valid for most file systems (avoid special characters like / \\ : * ? " < > | by replacing them with underscores or removing them).
- Return the extracted Invoice Number, Supplier Name, and Date in their respective fields in the output.

PDF: {{media url=pdfDataUri}}
Original Filename: {{{originalFilename}}}
`,
});

const suggestPdfFilenameFlow = ai.defineFlow(
  {
    name: 'suggestPdfFilenameFlow',
    inputSchema: SuggestPdfFilenameInputSchema,
    outputSchema: SuggestPdfFilenameOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
