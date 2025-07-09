import type { EnrichedProduct as EnrichedProductFromAI } from '@/ai/flows/enrich-product-data';

// Re-exporting the main type for use in components
export type EnrichedProduct = EnrichedProductFromAI;

export type ProductCatalogProcessingStatus = 'idle' | 'processing' | 'success' | 'error';
