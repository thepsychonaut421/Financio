
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
import { searchProductInfo } from '@/ai/tools/product-search-tool';

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
      status: z.string().describe('The availability status (e.g., "Available", "Out of Stock").')
  })).optional().describe('An array of pricing and availability information from different sources.'),
  suggestedCategories: z.array(z.string()).describe('An array of 2-4 relevant categories or tags for the product.'),
  imageSearchKeywords: z.string().describe('A string containing one or two simple, relevant keywords for searching for a product image.'),
  foundImageUrl: z.string().optional().describe('The direct URL of the product image found by the search tool.'),
  sources: z.array(z.object({
      platform: z.string(),
      url: z.string().url()
  })).optional().describe('A list of source URLs where information was found.')
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
  tools: [searchProductInfo],
  prompt: `You are an expert e-commerce catalog manager and product researcher. Your task is to take a list of raw, often messy, product names and enrich them with comprehensive, structured data suitable for an online store or internal catalog.

For each product name provided in the \`productNames\` array, you MUST perform the following steps:

1.  **CRITICAL FIRST STEP: Use the \`searchProductInfo\` tool** to find detailed, structured information about the product on the web. This tool will provide you with a title, description, technical specifications, pricing, and an image URL from a primary source.

2.  Based on the rich information returned by the tool, you will generate a detailed, structured output for the product. Your goal is to synthesize this information into a professional product profile. Generate the following fields:
    *   **enrichedTitle**: Refine the title returned by the tool to be clean, catchy, and SEO-friendly.
    *   **summary**: Write a compelling, one-paragraph summary of the product based on the description and specifications from the tool.
    *   **technicalSpecifications**: Format the key-value specifications from the tool into the output. If the tool provides a list, reformat it as a key-value object.
    *   **availabilityAndPricing**: Use the price and availability from the tool to create an entry in this array. You can infer the platform from the source URL (e.g., 'eBay', 'Lidl', 'Amazon'). If the availability string contains multiple statuses, create separate entries for each platform.
    *   **suggestedCategories**: Provide an array of 2 to 4 relevant categories or tags based on the product type.
    *   **foundImageUrl**: Use the image URL returned by the tool.
    *   **sources**: Create a list of sources, using the platform name and the URL provided by the tool.
    *   **imageSearchKeywords**: As a fallback, provide a string with one or two simple keywords for a manual image search (e.g., "kitchen machine").

Process every single product name from the input array.

Raw Product Names:
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
      return output || { enrichedProducts: [] };
    } catch (e: any) {
        if (e.message && (e.message.includes('503') || e.message.includes('overloaded'))) {
            return { enrichedProducts: [], error: "The AI service is currently busy or unavailable. Please try again in a few moments." };
        }
        console.error("Error in enrichProductDataFlow:", e);
        return { enrichedProducts: [], error: "An unexpected error occurred during the enrichment process." };
    }
  }
);
