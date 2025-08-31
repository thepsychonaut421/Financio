
'use server';

import { enrichProductData } from '@/ai/flows/enrich-product-data';
import { upsertProducts } from '@/server/products-server';
import { skuFromTitle } from '@/lib/sku-from-title';

// Helper function to create a basic SEO title if the AI doesn't provide one
function makeSEOTitle(rawTitle: string, sku: string): string {
    const cleaned = rawTitle
        .replace(/®|™/g, '') // Remove special symbols
        .replace(/,\s*\d+[-,\s]*tlg\.?/i, '') // Remove ", 6-tlg." etc.
        .trim();
    return `${cleaned} - ${sku}`;
}

export async function aiEnrich(name: string) {
  return await enrichProductData({ productName: name });
}

export async function saveEnrichedToCatalog(uid: string, items: Array<{
  originalProductName: string; 
  enrichedTitle?: string; 
  description?: string;
  imageUrl?: string; 
  specifications?: {key:string; value:string}[];
}>) {
  if (!uid) {
    throw new Error("User ID is required to save to catalog.");
  }
  
  const docs = items.map(i => {
    const code = skuFromTitle(i.originalProductName);
    return {
      productCode: code,
      titleRaw: i.originalProductName,
      titleSEO: i.enrichedTitle || makeSEOTitle(i.originalProductName, code),
      description: i.description,
      imageUrl: i.imageUrl,
      uom: 'Nos',
      specifications: i.specifications || [],
      sources: [{ type:'ai' as const }],
      // Fields like avgCost, lastCost, etc., are not set here as they come from invoice processing.
    };
  });
  
  // The 'as any' is a concession to TypeScript's structural typing, as we're creating
  // partial ProductDoc objects here. The server will add userId and updatedAt.
  await upsertProducts(uid, docs as any);
  
  return { ok: true, count: docs.length };
}
