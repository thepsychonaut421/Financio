import { config } from 'dotenv';
config();

import '@/ai/flows/normalize-and-deduplicate-data.ts';
import '@/ai/flows/extract-invoice-data.ts';
import '@/ai/flows/extract-incoming-invoice-data.ts';
