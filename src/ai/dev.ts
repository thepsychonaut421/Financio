import { config } from 'dotenv'; 
config(); 

import '@/ai/flows/extract-incoming-invoice-data.ts';
import '@/ai/flows/extract-bank-statement-data.ts';
import '@/ai/flows/suggest-pdf-filename.ts'; 
import '@/ai/flows/enrich-product-data.ts';
import '@/ai/flows/extract-invoice-data.ts';
import '@/ai/flows/normalize-and-deduplicate-data.ts';
