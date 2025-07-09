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
    output: { schema: EnrichedProductSchema }, // SIMPLIFIED: AI returns the product object directly
    prompt: `You are an expert product catalog manager. Your task is to take a product name and generate a detailed, structured JSON object.

IMPORTANT: All textual output (the values for enrichedTitle, description, and the 'key' in specifications) MUST be in GERMAN.

You must research the product to find accurate information. If information for a specific field cannot be found, use a sensible default or an empty array/string, but do NOT invent details.

Specifically for the 'specifications' section, you must try to find:
- Marke (Brand)
- Modell (Model)
- Herstellernummer (MPN)
- EAN (if available)
- Other relevant technical data like power, capacity, etc.

If no real image URL is found, use "https://placehold.co/600x400.png".

Product Name: {{{productName}}}

Based on the product name, generate a JSON object that strictly follows the required structure. The output must ONLY be the JSON object.

Example of the required JSON structure (remember, content must be in GERMAN):
{
  "originalProductName": "SILVERCREST® Kitchen Machine SKM 550 B3",
  "enrichedTitle": "SILVERCREST® Küchenmaschine SKM 550 B3 - Leistungsstarker 550W Mixer",
  "description": "Die SILVERCREST® Küchenmaschine SKM 550 B3 ist ein vielseitiges und leistungsstarkes Gerät für all Ihre Back- und Kochanforderungen. Mit einem 550-W-Motor kann sie alles bewältigen, vom Mischen und Kneten bis zum Schlagen und Schneiden. Die große 3,8-Liter-Rührschüssel und das mitgelieferte Zubehör machen sie zum perfekten Küchenhelfer.",
  "specifications": [
    { "key": "Marke", "value": "Silvercrest" },
    { "key": "Modell", "value": "SKM 550 B3" },
    { "key": "Herstellernummer", "value": "100344871001" },
    { "key": "Leistung", "value": "550 W" },
    { "key": "Fassungsvermögen Rührschüssel", "value": "3,8 Liter" }
  ],
  "availability": [
    { "store": "eBay", "price": "74,99 €", "inStock": true, "url": "https://www.ebay.de/itm/316056367676" },
    { "store": "Lidl", "price": "N/A", "inStock": false, "url": "https://www.lidl.de/p/silvercrest-kuechenmaschine-skm-550-b3/p100323055" }
  ],
  "imageUrl": "https://i.ebayimg.com/images/g/e3MAAOSwT~RmdsYd/s-l1600.jpg"
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
      // The output is now the product object itself, or null if it fails.
      const { output } = await prompt(input);
      if (!output) {
        return { error: 'Das AI-Modell hat nicht die erwarteten Produktdaten zurückgegeben.' };
      }
      // The flow's outputSchema is { product?: ..., error?: ... }, so wrap the result.
      return { product: output };
    } catch (e: any) {
        if (e.message && (e.message.includes('503') || e.message.includes('overloaded'))) {
            return { error: "Der KI-Dienst ist derzeit ausgelastet oder nicht verfügbar. Bitte versuchen Sie es in ein paar Augenblicken erneut." };
        }
        return { error: "Beim Anreichern der Produktdaten ist ein unerwarteter Fehler aufgetreten. Die KI konnte möglicherweise keine gültige Antwort generieren." };
    }
  }
);
