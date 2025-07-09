'use server';
/**
 * @fileOverview Enriches product data using an AI model.
 *
 * - enrichProductData - A function that takes a product name and returns enriched details.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import {
    EnrichProductDataInputSchema,
    type EnrichProductDataInput,
    EnrichedProductSchema,
    EnrichProductDataOutputSchema,
    type EnrichProductDataOutput
} from '@/ai/schemas/product-catalog-schema';


export async function enrichProductData(input: EnrichProductDataInput): Promise<EnrichProductDataOutput> {
    return enrichProductDataFlow(input);
}


const prompt = ai.definePrompt({
    name: 'enrichProductDataPrompt',
    input: { schema: EnrichProductDataInputSchema },
    output: { schema: z.object({ product: EnrichedProductSchema }) }, // We expect the AI to return the product nested
    prompt: `You are an expert product catalog manager. Your task is to take a product name and generate a detailed, structured JSON object for it.
You must research the product to find accurate information. If information for a specific field cannot be found, use a sensible default or an empty array/string, but DO NOT invent details like technical specs. If a real image URL isn't found, use "https://placehold.co/600x400.png".

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
    "imageUrl": "https://i.ebayimg.com/images/g/e3MAAOSwT~RmdsYd/s-l1600.jpg"
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
        if (e.message && (e.message.includes('503') || e.message.includes('overloaded'))) {
            return { error: "The AI service is currently busy or unavailable. Please try again in a few moments." };
        }
        console.error("Error in enrichProductDataFlow:", e);
        return { error: "An unexpected error occurred while enriching product data. The AI may have failed to generate a valid response." };
    }
  }
);
