import type { ExtractedItem } from '@/types/invoice';

export function arrayToCSV(data: ExtractedItem[]): string {
  if (!data || data.length === 0) {
    return '';
  }
  const headers = ['Product Code', 'Product Name', 'Quantity', 'Unit Price'];
  const csvRows = [
    headers.join(','), // header row
    ...data.map(item =>
      [
        `"${item.productCode.replace(/"/g, '""')}"`, // Escape double quotes
        `"${item.productName.replace(/"/g, '""')}"`,
        item.quantity,
        item.unitPrice,
      ].join(',')
    ),
  ];
  return csvRows.join('\n');
}

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

export function itemsToTSV(data: ExtractedItem[]): string {
  if (!data || data.length === 0) {
    return '';
  }
  const headers = ['Product Code', 'Product Name', 'Quantity', 'Unit Price'];
  const tsvRows = [
    headers.join('\t'), // header row
    ...data.map(item =>
      [
        item.productCode,
        item.productName,
        item.quantity,
        item.unitPrice,
      ].join('\t')
    ),
  ];
  return tsvRows.join('\n');
}
