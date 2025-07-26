import { z } from 'genkit';

// Schema for what AI is expected to return for line items.
// All fields are optional as AI might not always find them.
export const AILineItemSchema = z.object({
  productCode: z.string().nullable().describe('The code, Art.-Nr., or SKU of the product.'),
  productName: z.string().nullable().describe('The name of the product.'),
  quantity: z.number().nullable().describe('The quantity of the product.'),
  unitPrice: z.number().nullable().describe('The net unit price of the product.'),
  totalPrice: z.number().nullable().describe('The total net price for the line item.'),
});
export type AILineItem = z.infer<typeof AILineItemSchema>;


// Stricter schema for what the application logic (UI, exports) will work with.
// It ensures quantity and unitPrice are always present (defaulted if necessary).
export const ProcessedLineItemSchema = z.object({
  productCode: z.string(),
  productName: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
});

// TypeScript type derived from the stricter schema. This replaces the old interface.
export type AppLineItem = z.infer<typeof ProcessedLineItemSchema>;
