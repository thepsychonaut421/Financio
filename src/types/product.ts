
export type EnrichedProduct = {
  rawProductName: string;
  enrichedTitle: string;
  enrichedDescription: string;
  suggestedCategories: string[];
  imageSearchKeywords: string;
};

export type ProductCatalogProcessingStatus = 'idle' | 'processing' | 'success' | 'error';
