
export const CACHE_VERSION = 'v1';

export const pageCacheKey = (kind: 'purchase' | 'sales'): string => 
  `incoming:${kind}:pageCache:${CACHE_VERSION}`;

export const matcherDataKey = (kind: 'purchase' | 'sales'): string => 
  `processed:${kind}:forMatcher:${CACHE_VERSION}`;

export const kontenrahmenKey = (kind: 'purchase' | 'sales'): string => 
  `financio:kontenrahmen:${kind}`;
