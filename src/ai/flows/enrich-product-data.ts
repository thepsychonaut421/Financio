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

// Helper function to extract JSON from a string that might be wrapped in markdown
function extractJsonFromString(text: string): string | null {
    const match = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
        return match[1];
    }
    // Fallback for text that is just the JSON object itself
    if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
        return text.trim();
    }
    return null;
}

const prompt = ai.definePrompt({
    name: 'enrichProductDataPrompt',
    input: { schema: EnrichProductDataInputSchema },
    // NO OUTPUT SCHEMA HERE - We will parse the string response manually
    prompt: `You are an expert product catalog manager. Your task is to take a product name and generate a detailed, structured JSON object.

Your response MUST be a valid JSON object enclosed in a markdown code block (\`\`\`json ... \`\`\`).

IMPORTANT: All textual content inside the JSON (the values for enrichedTitle, description, and the 'key' in specifications) MUST be in GERMAN.

You must research the product to find accurate information. If information for a specific field cannot be found, use a sensible default or an empty array/string, but do NOT invent details.

Specifically for the 'specifications' section, you must try to find:
- Marke (Brand)
- Modell (Model)
- Herstellernummer (MPN)
- EAN (if available)
- Other relevant technical data like power, capacity, etc.

If no real image URL is found, use "https://placehold.co/600x400.png".

Product Name: {{{productName}}}

Based on the product name, generate a JSON object that strictly follows the required structure.

Example of the required JSON structure (remember, content must be in GERMAN):
\`\`\`json
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
\`\`\`
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
      // The output is now a string that we need to parse
      const { output } = await prompt(input);
      if (!output) {
        return { error: 'Das AI-Modell hat eine leere Antwort zurückgegeben.' };
      }

      const jsonString = extractJsonFromString(output);
      if (!jsonString) {
          console.error("AI output did not contain a valid JSON block. Raw output:", output);
          return { error: 'Das AI-Modell hat kein gültiges JSON-Format zurückgegeben.' };
      }
      
      let parsedJson;
      try {
        parsedJson = JSON.parse(jsonString);
      } catch(e: any) {
          console.error("Failed to parse JSON from AI output. JSON string:", jsonString, "Error:", e.message);
          return { error: `Fehler beim Parsen der AI-Antwort: ${e.message}` };
      }

      const validationResult = EnrichedProductSchema.safeParse(parsedJson);

      if (!validationResult.success) {
          console.error("AI output failed Zod validation:", validationResult.error.flatten());
          return { error: `Die vom AI-Modell zurückgegebenen Daten haben ein unerwartetes Format. Fehler: ${validationResult.error.flatten().formErrors.join(', ')}` };
      }

      // The flow's outputSchema is { product?: ..., error?: ... }, so wrap the result.
      return { product: validationResult.data };

    } catch (e: any) {
        console.error("Critical error in enrichProductDataFlow:", e);
        if (e.message && (e.message.includes('503') || e.message.includes('overloaded'))) {
            return { error: "Der KI-Dienst ist derzeit ausgelastet oder nicht verfügbar. Bitte versuchen Sie es in ein paar Augenblicken erneut." };
        }
        return { error: "Beim Anreichern der Produktdaten ist ein unerwarteter kritischer Fehler aufgetreten." };
    }
  }
);
