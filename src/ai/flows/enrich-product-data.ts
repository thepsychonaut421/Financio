
'use server';
/**
 * @fileOverview Enriches raw product names with detailed, structured data.
 *
 * - enrichProductData - A function that takes a list of raw product names and returns enriched data.
 * - EnrichProductDataInput - The input type for the function.
 * - EnrichProductDataOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const EnrichProductDataInputSchema = z.object({
  productNames: z.array(z.string()).describe('An array of raw product names to be enriched.'),
});
export type EnrichProductDataInput = z.infer<typeof EnrichProductDataInputSchema>;

const EnrichedProductSchema = z.object({
  rawProductName: z.string().describe('The original, raw product name that was provided.'),
  enrichedTitle: z.string().describe('A clean, SEO-friendly, and attractive title for the product.'),
  summary: z.string().describe('A short, one-paragraph summary of the product.'),
  technicalSpecifications: z.record(z.string()).optional().describe('A key-value object of the main technical specifications found (e.g., {"Power": "550 W", "Capacity": "3.8 L"}).'),
  availabilityAndPricing: z.array(z.object({
      platform: z.string().describe('The platform where the info was found (e.g., eBay, Lidl).'),
      price: z.string().optional().describe('The price found on the platform.'),
      status: z.string().describe('The availability status (e.g., "Available", "Out of Stock").'),
      url: z.string().url().describe('The direct URL to the product page on the platform.')
  })).optional().describe('An array of pricing, availability, and source URLs from different platforms.'),
  suggestedCategories: z.array(z.string()).describe('An array of 2-4 relevant categories or tags for the product.'),
  imageSearchKeywords: z.string().describe('A string containing one or two simple, relevant keywords for searching for a product image.'),
  foundImageUrl: z.string().optional().describe('The direct URL of the product image found by the search tool.'),
});

const EnrichProductDataOutputSchema = z.object({
  enrichedProducts: z.array(EnrichedProductSchema).describe('An array of enriched product data objects.'),
  error: z.string().optional().describe('An error message if the operation failed.'),
});
export type EnrichProductDataOutput = z.infer<typeof EnrichProductDataOutputSchema>;


export async function enrichProductData(input: EnrichProductDataInput): Promise<EnrichProductDataOutput> {
  return enrichProductDataFlow(input);
}

const prompt = ai.definePrompt({
  name: 'enrichProductDataPrompt',
  input: { schema: EnrichProductDataInputSchema },
  output: { schema: EnrichProductDataOutputSchema },
  prompt: `You are an expert e-commerce catalog manager. Your task is to take a list of raw product names and enrich them with structured data as if you have searched for them online.

For each product name in the \`productNames\` array, you MUST generate a complete, structured JSON object.

**Example Task:**
If you receive the product name "ERNESTO® Topfset, 6-tlg. - B-Ware neuwertig", you should act as if you've searched on Google, eBay, and Lidl and found the following details.

**Your thinking process should be:**
1.  **Identify the core product:** It's a "SILVERCREST Kitchen Machine SKM 550 B3".
2.  **Find Specs:** Power is 550W, capacity is 3.8L.
3.  **Find Availability:** It's on eBay for 74.99 EUR but out of stock on Lidl.
4.  **Create Summary & Title:** Write a clean title and a compelling summary.
5.  **Suggest Categories:** "Kitchenware", "Appliances".
6.  **Image Keywords:** "kitchen machine".
7.  **Find Image URL:** Find a plausible placeholder or real URL.

**Based on that, you will construct this exact JSON structure for that one product inside the 'enrichedProducts' array.**

Do this for every single product name from the input array.

Raw Product Names to process:
{{{json productNames}}}
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
      if (!output) {
        return { enrichedProducts: [], error: "The AI returned no data. Please try again." };
      }
      return output;
    } catch (e: any) {
        if (e.message && (e.message.includes('503') || e.message.includes('overloaded'))) {
            return { enrichedProducts: [], error: "The AI service is currently busy or unavailable. Please try again in a few moments." };
        }
        console.error("Error in enrichProductDataFlow:", e);
        // This error often happens if the AI's output doesn't match the Zod schema.
        return { enrichedProducts: [], error: "An unexpected error occurred. The AI may have failed to generate a valid response. Please try simplifying the product names or try again later." };
    }
  }
);
