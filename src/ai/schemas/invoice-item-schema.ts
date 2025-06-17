import { z } from 'genkit';

export const ExtractedItemSchema = z.object({
  productCode: z.string().describe('The code of the product.'),
  productName: z.string().describe('The name of the product.'),
  quantity: z.number().describe('The quantity of the product.'),
  unitPrice: z.number().describe('The unit price of the product.'),
});
export type ExtractedItem = z.infer<typeof ExtractedItemSchema>;
