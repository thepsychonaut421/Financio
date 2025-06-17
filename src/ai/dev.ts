
import { config } from 'dotenv';
config();

import '@/ai/flows/normalize-and-deduplicate-data.ts';
import '@/ai/flows/extract-invoice-data.ts';
import '@/ai/flows/extract-incoming-invoice-data.ts';
import '@/ai/flows/extract-bank-statement-data.ts'; // Added new flow
// It's good practice to also "register" schemas if they were meant to be discoverable by Genkit tooling,
// but for this specific use case (direct import for type safety), it's not strictly necessary.
// If you had Genkit tools or other flows that needed to dynamically find this schema, you might add:
// import '@/ai/schemas/invoice-item-schema';

