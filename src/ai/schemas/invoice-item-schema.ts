
import { z } from 'genkit';

// This is the old, simpler schema. It's kept for potential use in other, simpler flows
// but the new PurchaseInvoiceSchema is preferred for the main ERPNext extraction.
export const AILineItemSchema = z.object({
  productCode: z.string().describe('The code of the product.'),
  productName: z.string().describe('The name of the product.'),
  quantity: z.number().optional().describe('The quantity of the product.'),
  unitPrice: z.number().optional().describe('The unit price of the product.'),
});
export type AILineItem = z.infer<typeof AILineItemSchema>;


// Stricter schema for what the application logic (UI, exports) will work with.
// It ensures quantity and unitPrice are always present (defaulted if necessary).
export const ProcessedLineItemSchema = z.object({
  productCode: z.string(),
  productName: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
});

// TypeScript type derived from the stricter schema. This replaces the old interface.
export type AppLineItem = z.infer<typeof ProcessedLineItemSchema>;


// --- NEW ERPNext Purchase Invoice Schema ---

export const ErpItemSchema = z.object({
  item_code: z.string().optional().nullable(),
  item_name: z.string(),
  qty: z.number().positive(),
  uom: z.string().default('Nos').nullable().optional(),
  rate: z.number().nonnegative(),
  amount: z.number().nonnegative(),
  tax_rate: z.number().min(0).max(100).nullable().optional(),
  tax_amount: z.number().min(0).nullable().optional(),
});
export type ErpItem = z.infer<typeof ErpItemSchema>;


export const PurchaseInvoiceSchema = z.object({
  doctype: z.literal('Purchase Invoice', {
    required_error: "The 'doctype' field must be 'Purchase Invoice'.",
  }),
  supplier: z.string(),
  posting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Date must be in YYYY-MM-DD format" }),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  bill_no: z.string(),
  bill_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().default('EUR'),
  items: z.array(ErpItemSchema).min(1, { message: "At least one item is required in the 'items' array." }),
  taxes: z.array(z.object({
    charge_type: z.string(),
    account_head: z.string(),
    rate: z.number(),
    tax_amount: z.number(),
  })).optional().default([]),
  supplier_address: z.string().optional(),
  contact_person: z.string().optional().nullable(),
  remarks: z.string().optional(),
  custom_fields: z.record(z.any()).optional().default({}),
  is_return: z.union([z.boolean(), z.number()]).optional().transform(v => v === 1 || v === true),
});

export type PurchaseInvoice = z.infer<typeof PurchaseInvoiceSchema>;
