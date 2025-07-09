
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

function escapeCSVField(field: any): string {
  if (field === undefined || field === null) return '';
  
  let stringField = '';
  if (typeof field === 'object') {
    stringField = JSON.stringify(field);
  } else {
    stringField = String(field);
  }
  
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
    'Summary',
    'Technical Specifications (JSON)',
    'Availability and Pricing (JSON)',
    'Suggested Categories (Semicolon-separated)',
    'Image Search Keywords',
    'Found Image URL',
    'Sources (JSON)',
  ];

  const csvRows = [
    headers.join(','),
    ...products.map(product => [
      escapeCSVField(product.rawProductName),
      escapeCSVField(product.enrichedTitle),
      escapeCSVField(product.summary),
      escapeCSVField(product.technicalSpecifications),
      escapeCSVField(product.availabilityAndPricing),
      escapeCSVField(product.suggestedCategories.join('; ')),
      escapeCSVField(product.imageSearchKeywords),
      escapeCSVField(product.foundImageUrl),
      escapeCSVField(product.sources),
    ].join(','))
  ];

  return csvRows.join('\n');
}

export function enrichedProductsToJSON(products: EnrichedProduct[]): string {
  return JSON.stringify(products, null, 2);
}
