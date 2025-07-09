'use client';

import type { EnrichedProduct } from '@/ai/flows/enrich-product-data';

export function downloadFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCSVField(field: string | number | boolean | undefined | null): string {
  if (field === undefined || field === null) return '';
  const stringField = String(field);
  if (stringField.includes('"') || stringField.includes(',') || stringField.includes('\n') || stringField.includes('\r')) {
    return `"${stringField.replace(/"/g, '""')}"`;
  }
  return stringField;
}

export function productsToJSON(products: EnrichedProduct[]): string {
  return JSON.stringify(products, null, 2);
}

export function productsToCSV(products: EnrichedProduct[]): string {
  if (!products || products.length === 0) return '';

  const headers = [
    'Original Product Name',
    'Enriched Title',
    'Description',
    'Image URL',
    'Spec Key',
    'Spec Value',
    'Store',
    'Price',
    'In Stock',
    'URL'
  ];

  let csvRows = [headers.join(',')];

  products.forEach(product => {
    const baseData = [
      escapeCSVField(product.originalProductName),
      escapeCSVField(product.enrichedTitle),
      escapeCSVField(product.description),
      escapeCSVField(product.imageUrl),
    ];
    
    let hasWrittenFirstRowForProduct = false;

    // Handle specifications and availability to create multiple rows if necessary
    const maxRows = Math.max(product.specifications.length, product.availability.length, 1);

    for (let i = 0; i < maxRows; i++) {
        const spec = product.specifications[i];
        const avail = product.availability[i];

        const row = [
            ...baseData,
            escapeCSVField(spec?.key),
            escapeCSVField(spec?.value),
            escapeCSVField(avail?.store),
            escapeCSVField(avail?.price),
            escapeCSVField(avail?.inStock),
            escapeCSVField(avail?.url),
        ];
        
        csvRows.push(row.join(','));
        // Clear base data after first use for this product to avoid repetition
        if (!hasWrittenFirstRowForProduct) {
            for(let j=0; j < baseData.length; j++) {
                baseData[j] = '';
            }
            hasWrittenFirstRowForProduct = true;
        }
    }
  });

  return csvRows.join('\n');
}
