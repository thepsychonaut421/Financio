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
    prompt: `Sie sind ein Experte für Produktkatalog-Management. Ihre Aufgabe ist es, einen Produktnamen zu nehmen und dafür ein detailliertes, strukturiertes JSON-Objekt auf Deutsch zu generieren.
Sie müssen das Produkt recherchieren, um genaue Informationen zu finden. Alle textuellen Ausgaben (Titel, Beschreibung, Spezifikations-Schlüssel) müssen auf Deutsch sein. Wenn Informationen für ein bestimmtes Feld nicht gefunden werden können, verwenden Sie einen sinnvollen Standardwert oder ein leeres Array/String, aber erfinden Sie KEINE Details.
Speziell für den Abschnitt 'specifications' (Merkmale) müssen Sie versuchen zu finden:
- Marke
- Modell
- Herstellernummer (MPN)
- EAN (falls verfügbar)
- Andere relevante technische Daten wie Leistung, Kapazität usw.

Wenn keine echte Bild-URL gefunden wird, verwenden Sie "https://placehold.co/600x400.png".

Produktname: {{{productName}}}

Basierend auf dem Produktnamen, generieren Sie ein JSON-Objekt, das strikt dieser Struktur folgt. Die Ausgabe darf NUR das JSON-Objekt sein.

Beispiel JSON-Struktur:
{
  "product": {
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
        return { error: 'Das AI-Modell hat nicht die erwarteten Produktdaten zurückgegeben.' };
      }
      return { product: output.product };
    } catch (e: any) {
        if (e.message && (e.message.includes('503') || e.message.includes('overloaded'))) {
            return { error: "Der KI-Dienst ist derzeit ausgelastet oder nicht verfügbar. Bitte versuchen Sie es in ein paar Augenblicken erneut." };
        }
        return { error: "Beim Anreichern der Produktdaten ist ein unerwarteter Fehler aufgetreten. Die KI konnte möglicherweise keine gültige Antwort generieren." };
    }
  }
);
