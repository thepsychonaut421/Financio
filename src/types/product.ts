
import type { EnrichedProduct as EnrichedProductFromAI } from '@/ai/schemas/product-catalog-schema';

// Re-exporting the main type for use in components
export type EnrichedProduct = EnrichedProductFromAI;

export type ProductCatalogProcessingStatus = 'idle' | 'processing' | 'success' | 'error';

export type ProductDoc = {
  userId: string;
  productCode: string;     // SKU sau derivat
  titleRaw: string;
  titleSEO: string;
  description?: string;
  uom: string;             // 'Nos' etc.
  avgCost?: number;
  lastCost?: number;
  totalQty?: number;
  imageUrl?: string;
  specifications?: Array<{ key:string; value:string }>;
  sources?: Array<{ type:'ai'|'invoice'|'manual'; ref?:string }>;
  updatedAt: any;          // Firestore Timestamp
};
