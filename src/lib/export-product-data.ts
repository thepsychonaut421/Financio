
'use client';

import type { EnrichedProduct } from '@/types/product';

export function downloadFile(content: string | Blob, fileName: string, mimeType: string): void {
  const blob = typeof content === 'string' ? new Blob([content], { type: mimeType }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCSVField(field: string | string[] | undefined | null): string {
  if (field === undefined || field === null) return '';
  
  const stringField = Array.isArray(field) ? field.join('; ') : String(field);
  
  if (stringField.includes('"') || stringField.includes(',') || stringField.includes('\n') || stringField.includes('\r')) {
    return `"${stringField.replace(/"/g, '""')}"`;
  }
  return stringField;
}


export function enrichedProductsToCSV(products: EnrichedProduct[]): string {
  if (!products || products.length === 0) return '';

  const headers = [
    'Raw Product Name',
    'Enriched Title',
    'Enriched Description',
    'Suggested Categories',
    'Image Search Keywords',
    'Found Image URL',
    'Source URL',
  ];

  const csvRows = [
    headers.join(','),
    ...products.map(product => [
      escapeCSVField(product.rawProductName),
      escapeCSVField(product.enrichedTitle),
      escapeCSVField(product.enrichedDescription),
      escapeCSVField(product.suggestedCategories),
      escapeCSVField(product.imageSearchKeywords),
      escapeCSVField(product.foundImageUrl),
      escapeCSVField(product.source),
    ].join(','))
  ];

  return csvRows.join('\n');
}

export function enrichedProductsToJSON(products: EnrichedProduct[]): string {
  return JSON.stringify(products, null, 2);
}
