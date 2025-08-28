import { z } from 'zod';

// Base schema for line items, used in both Purchase and Sales Invoices
export const ErpInvoiceItemSchema = z.object({
  item_code: z.string(),
  item_name: z.string().optional(),
  description: z.string().optional(),
  qty: z.number(),
  rate: z.number(),
  amount: z.number().optional(),
  uom: z.string().optional().default("Nos"),
  warehouse: z.string().optional(),
  income_account: z.string().optional(),
  expense_account: z.string().optional(),
});
export type ErpInvoiceItem = z.infer<typeof ErpInvoiceItemSchema>;

// Zod Schema for a Purchase Invoice Payload
export const PurchaseInvoicePayloadSchema = z.object({
  doctype: z.literal('Purchase Invoice'),
  supplier: z.string(),
  bill_no: z.string().optional(),
  posting_date: z.string(),
  due_date: z.string().optional(),
  currency: z.string().optional().default("EUR"),
  grand_total: z.number().optional(),
  is_paid: z.union([z.boolean(), z.number()]).optional(),
  set_posting_time: z.number().optional().default(1),
  update_stock: z.number().optional().default(0), // Default to not updating stock
  items: z.array(ErpInvoiceItemSchema),
});
export type PurchaseInvoicePayload = z.infer<typeof PurchaseInvoicePayloadSchema>;

// Zod Schema for a Sales Invoice Payload
export const SalesInvoicePayloadSchema = z.object({
  doctype: z.literal('Sales Invoice'),
  customer: z.string(),
  posting_date: z.string(),
  due_date: z.string().optional(),
  currency: z.string().optional().default("EUR"),
  grand_total: z.number().optional(),
  is_pos: z.boolean().optional(),
  set_posting_time: z.number().optional().default(1),
  update_stock: z.number().optional().default(0),
  items: z.array(ErpInvoiceItemSchema),
});
export type SalesInvoicePayload = z.infer<typeof SalesInvoicePayloadSchema>;

// Zod Schema for an Item Payload
export const ItemPayloadSchema = z.object({
  doctype: z.literal('Item'),
  item_code: z.string(),
  item_name: z.string(),
  description: z.string().optional(),
  item_group: z.string().optional().default("All Item Groups"),
  stock_uom: z.string().optional().default("Nos"),
  is_stock_item: z.number().optional().default(1), // Use 1 for true
});
export type ItemPayload = z.infer<typeof ItemPayloadSchema>;

// Keep existing types and schemas as well
export const ErpNextExistingTypes = {
    PurchaseInvoiceSchema: z.any(),
    SalesInvoiceSchema: z.any(),
    ItemSchema: z.any(),
    BankTransactionSchema: z.any(),
    JournalEntryAccountSchema: z.any(),
    JournalEntrySchema: z.any(),
    PaymentEntryReferenceSchema: z.any(),
    PaymentEntrySchema: z.any(),
    StockReconciliationItemSchema: z.any(),
    StockReconciliationSchema: z.any(),
    StockEntryItemSchema: z.any(),
    StockEntrySchema: z.any(),
    SupplierSchema: z.any(),
}
// This is a placeholder to keep the old file content and avoid breaking changes
// In a real scenario, these would be integrated or removed.
export type PurchaseInvoice = z.infer<typeof ErpNextExistingTypes.PurchaseInvoiceSchema>;
export type SalesInvoice = z.infer<typeof ErpNextExistingTypes.SalesInvoiceSchema>;
export type BankTransaction = z.infer<typeof ErpNextExistingTypes.BankTransactionSchema>;
export type JournalEntryAccount = z.infer<typeof ErpNextExistingTypes.JournalEntryAccountSchema>;
export type JournalEntry = z.infer<typeof ErpNextExistingTypes.JournalEntrySchema>;
export type PaymentEntryReference = z.infer<typeof ErpNextExistingTypes.PaymentEntryReferenceSchema>;
export type PaymentEntry = z.infer<typeof ErpNextExistingTypes.PaymentEntrySchema>;
export type StockReconciliationItem = z.infer<typeof ErpNextExistingTypes.StockReconciliationItemSchema>;
export type StockReconciliation = z.infer<typeof ErpNextExistingTypes.StockReconciliationSchema>;
export type StockEntryItem = z.infer<typeof ErpNextExistingTypes.StockEntryItemSchema>;
export type StockEntry = z.infer<typeof ErpNextExistingTypes.StockEntrySchema>;
export type Supplier = z.infer<typeof ErpNextExistingTypes.SupplierSchema>;
