import type { EnrichedProduct as EnrichedProductFromAI } from '@/ai/schemas/product-catalog-schema';

// Re-exporting the main type for use in components
export type EnrichedProduct = EnrichedProductFromAI;

export type ProductCatalogProcessingStatus = 'idle' | 'processing' | 'success' | 'error';
