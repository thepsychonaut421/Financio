
export type EnrichedProduct = {
  rawProductName: string;
  enrichedTitle: string;
  summary: string;
  technicalSpecifications?: Record<string, string>;
  availabilityAndPricing?: {
    platform: string;
    price?: string;
    status: string;
  }[];
  suggestedCategories: string[];
  imageSearchKeywords: string;
  foundImageUrl?: string;
  sources?: {
    platform: string;
    url: string;
  }[];
};

export type ProductCatalogProcessingStatus = 'idle' | 'processing' | 'success' | 'error';
