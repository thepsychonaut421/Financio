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
  is_stock_item: z.union([z.number(), z.boolean()]).optional().default(1),
});
export type ItemPayload = z.infer<typeof ItemPayloadSchema>;


export const BankTransactionSchema = z.object({
  doctype: z.literal('Bank Transaction'),
  date: z.string(),
  bank_account: z.string(),
  description: z.string().optional(),
  deposit: z.number().optional(),
  withdrawal: z.number().optional(),
  reference_number: z.string().optional(),
  party_type: z.string().optional(),
  party: z.string().optional(),
  external_id: z.string(),
});
export type BankTransaction = z.infer<typeof BankTransactionSchema>;


export const JournalEntryAccountSchema = z.object({
    account: z.string(),
    debit_in_account_currency: z.number().optional(),
    credit_in_account_currency: z.number().optional(),
});
export type JournalEntryAccount = z.infer<typeof JournalEntryAccountSchema>;

export const JournalEntrySchema = z.object({
    doctype: z.literal('Journal Entry'),
    posting_date: z.string(),
    company: z.string(),
    voucher_type: z.string(),
    user_remark: z.string().optional(),
    accounts: z.array(JournalEntryAccountSchema),
});
export type JournalEntry = z.infer<typeof JournalEntrySchema>;


// Keep existing types and schemas as well
export const ErpNextExistingTypes = {
    PurchaseInvoiceSchema: z.any(),
    SalesInvoiceSchema: z.any(),
    ItemSchema: z.any(),
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
export type PaymentEntryReference = z.infer<typeof ErpNextExistingTypes.PaymentEntryReferenceSchema>;
export type PaymentEntry = z.infer<typeof ErpNextExistingTypes.PaymentEntrySchema>;
export type StockReconciliationItem = z.infer<typeof ErpNextExistingTypes.StockReconciliationItemSchema>;
export type StockReconciliation = z.infer<typeof ErpNextExistingTypes.StockReconciliationSchema>;
export type StockEntryItem = z.infer<typeof ErpNextExistingTypes.StockEntryItemSchema>;
export type StockEntry = z.infer<typeof ErpNextExistingTypes.StockEntrySchema>;
export type Supplier = z.infer<typeof ErpNextExistingTypes.SupplierSchema>;
