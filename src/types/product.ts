
export type EnrichedProduct = {
  rawProductName: string;
  enrichedTitle: string;
  enrichedDescription: string;
  suggestedCategories: string[];
  imageSearchKeywords: string;
  foundImageUrl?: string;
  source?: string;
};

export type ProductCatalogProcessingStatus = 'idle' | 'processing' | 'success' | 'error';
