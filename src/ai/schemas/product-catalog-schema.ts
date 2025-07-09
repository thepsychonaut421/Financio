import { z } from 'genkit';

export const EnrichProductDataInputSchema = z.object({
  productName: z.string().describe('The name of the product to enrich.'),
});
export type EnrichProductDataInput = z.infer<typeof EnrichProductDataInputSchema>;

export const EnrichedProductSchema = z.object({
  originalProductName: z.string().describe('The original product name that was provided.'),
  enrichedTitle: z.string().describe('A compelling, SEO-friendly title for the product.'),
  description: z.string().describe('A detailed and engaging product description.'),
  specifications: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .describe('A list of key-value pairs for technical specifications.'),
  availability: z
    .array(
      z.object({
        store: z.string().describe('The name of the retailer (e.g., Amazon, eBay, Lidl).'),
        price: z.string().describe('The price of the product at this store, as a formatted string (e.g., "74,99 €").'),
        inStock: z.boolean().describe('Whether the product is currently in stock at this store.'),
        url: z.string().describe("A direct link to the product page. Can be a non-URL string if a valid URL isn't found."),
      })
    )
    .describe('A list of stores where the product is available, including price and stock status.'),
  imageUrl: z.string().describe("A relevant image URL for the product. Use a placeholder from 'https://placehold.co/600x400.png' if a real one isn't available."),
});
export type EnrichedProduct = z.infer<typeof EnrichedProductSchema>;

export const EnrichProductDataOutputSchema = z.object({
    product: EnrichedProductSchema.optional(),
    error: z.string().optional().describe('An error message if the operation failed.'),
});
export type EnrichProductDataOutput = z.infer<typeof EnrichProductDataOutputSchema>;
