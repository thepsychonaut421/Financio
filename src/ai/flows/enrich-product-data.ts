'use server';
/**
 * @fileOverview Enriches product data using an AI model.
 *
 * - enrichProductData - A function that takes a product name and returns enriched details.
 * - EnrichProductDataInput - The input type for the function.
 * - EnrichedProduct - The return type for the function.
 */

import { ai } from '@/ai/genkit';
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
        url: z.string().url().describe('A direct link to the product page.'),
      })
    )
    .describe('A list of stores where the product is available, including price and stock status.'),
  imageUrl: z.string().url().describe("A relevant image URL for the product. Use a placeholder from 'https://placehold.co/600x400.png' if a real one isn't available."),
});
export type EnrichedProduct = z.infer<typeof EnrichedProductSchema>;

const EnrichProductDataOutputSchema = z.object({
    product: EnrichedProductSchema.optional(),
    error: z.string().optional().describe('An error message if the operation failed.'),
});
export type EnrichProductDataOutput = z.infer<typeof EnrichProductDataOutputSchema>;


export async function enrichProductData(input: EnrichProductDataInput): Promise<EnrichedProductDataOutput> {
    return enrichProductDataFlow(input);
}


const prompt = ai.definePrompt({
    name: 'enrichProductDataPrompt',
    input: { schema: EnrichProductDataInputSchema },
    output: { schema: z.object({ product: EnrichedProductSchema }) }, // We expect the AI to return the product nested
    prompt: `You are an expert product catalog manager. Your task is to take a product name and generate a detailed, structured JSON object for it.
You must research the product to find accurate information. If information for a specific field cannot be found, use a sensible default or leave it empty, but DO NOT invent details like technical specs.

Product Name: {{{productName}}}

Based on the product name, generate a JSON object that strictly follows this structure. The output must be ONLY the JSON object.

Example JSON Structure:
{
  "product": {
    "originalProductName": "{{{productName}}}",
    "enrichedTitle": "SILVERCREST® Kitchen Machine SKM 550 B3 - Powerful 550W Mixer",
    "description": "The SILVERCREST® Kitchen Machine SKM 550 B3 is a versatile and powerful appliance for all your baking and cooking needs. With a 550W motor, it can handle everything from mixing and kneading to whipping and slicing. The large 3.8-liter mixing bowl and included accessories make it the perfect kitchen assistant.",
    "specifications": [
      { "key": "Power", "value": "550 W" },
      { "key": "Mixing Bowl Capacity", "value": "3.8 liters" },
      { "key": "Blender Capacity", "value": "1 liter" },
      { "key": "Speed Settings", "value": "4 levels" }
    ],
    "availability": [
      { "store": "eBay", "price": "74,99 €", "inStock": true, "url": "https://www.ebay.de/itm/316056367676" },
      { "store": "Lidl", "price": "N/A", "inStock": false, "url": "https://www.lidl.de/p/silvercrest-kuechenmaschine-skm-550-b3/p100323055" }
    ],
    "imageUrl": "https://placehold.co/600x400.png"
  }
}
`,
});

const enrichProductDataFlow = ai.defineFlow(
  {
    name: 'enrichProductDataFlow',
    inputSchema: EnrichProductDataInputSchema,
    outputSchema: EnrichProductDataOutputSchema,
  },
  async (input) => {
    try {
      const { output } = await prompt(input);
      if (!output?.product) {
        return { error: 'The AI model did not return the expected product data.' };
      }
      return { product: output.product };
    } catch (e: any) {
        console.error("Error in enrichProductDataFlow:", e);
        if (e.message && (e.message.includes('503') || e.message.includes('overloaded'))) {
            return { error: "The AI service is currently busy or unavailable. Please try again in a few moments." };
        }
        return { error: "An unexpected error occurred while enriching product data. The AI may have failed to generate a valid response." };
    }
  }
);
