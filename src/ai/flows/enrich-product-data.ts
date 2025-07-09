
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
  prompt: `You are an expert e-commerce catalog manager. Your task is to take a list of raw product names and enrich them with structured data by acting as if you have searched for them online on platforms like Google, eBay, and Amazon.

For each product name in the \`productNames\` array, you MUST generate a complete, structured JSON object that adheres to the provided schema.

**EXAMPLE TASK:**
If you receive the product name "SILVERCREST® Küchenmaschine »SKM 550 B3« (lila) - B-Ware neuwertig", your thinking process should be:
1.  **Identify Core Product:** The core product is a "SILVERCREST Kitchen Machine SKM 550 B3".
2.  **Find Details Online:** I will search for this on eBay and Lidl. I see it on eBay for €74.99. It's a B-Ware (refurbished) item. The specs are 550W power and a 3.8L bowl.
3.  **Construct JSON:** Based on this simulated search, I will build the JSON object.

**HERE IS THE JSON STRUCTURE YOU MUST FOLLOW FOR EACH PRODUCT:**

\`\`\`json
{
  "rawProductName": "The original product name from the input array.",
  "enrichedTitle": "A clean, SEO-friendly title.",
  "summary": "A short, one-paragraph summary of the product.",
  "technicalSpecifications": {
    "Power": "550 W",
    "Capacity": "3.8 L"
  },
  "availabilityAndPricing": [
    {
      "platform": "eBay",
      "price": "74.99 EUR",
      "status": "Available",
      "url": "https://www.ebay.de/itm/316056367676"
    },
    {
      "platform": "Lidl",
      "price": null,
      "status": "Out of Stock",
      "url": "https://www.lidl.de/p/silvercrest-kitchen-tools-kuechenmaschine-skm-550-b3/p100268081"
    }
  ],
  "suggestedCategories": [
    "Kitchen Appliances",
    "Food Processors",
    "Refurbished"
  ],
  "imageSearchKeywords": "silvercrest kitchen machine",
  "foundImageUrl": "https://i.ebayimg.com/images/g/2y8AAOSwz~5lP0Vq/s-l1600.jpg"
}
\`\`\`

**CRITICAL INSTRUCTIONS:**
- You must return a single JSON object with a key \`enrichedProducts\` which is an array of objects, one for each product name.
- The \`url\` in \`availabilityAndPricing\` must be a valid-looking URL.
- \`technicalSpecifications\` and \`availabilityAndPricing\` are optional, but try your best to populate them.
- \`price\` inside \`availabilityAndPricing\` is a string and can be optional.

Now, process the following product names:
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
