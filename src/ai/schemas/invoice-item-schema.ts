import { z } from 'genkit';

// Schema for what AI is expected to return for line items.
// Quantity and unitPrice are optional as AI might not always find them.
export const AILineItemSchema = z.object({
  productCode: z.string().describe('The code of the product.'),
  productName: z.string().describe('The name of the product.'),
  quantity: z.number().optional().describe('The quantity of the product.'),
  unitPrice: z.number().optional().describe('The unit price of the product.'),
});
export type AILineItem = z.infer<typeof AILineItemSchema>;

// TypeScript interface for what the application logic (UI, exports) will work with.
// It ensures quantity and unitPrice are always present (defaulted if necessary).
export interface AppLineItem {
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

// For compatibility, if other parts of the app still use ExtractedItemSchema directly
// for processed data, we can define a stricter schema here, though AppLineItem (interface)
// is often sufficient for TypeScript usage post-normalization.
export const ProcessedLineItemSchema = z.object({
  productCode: z.string(),
  productName: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
});
