import type { AppLineItem } from '@/ai/schemas/invoice-item-schema';

export type ExtractedItem = AppLineItem;

export type ProcessingStatus = 'idle' | 'processing' | 'success' | 'error';
