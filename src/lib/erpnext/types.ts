import { z } from 'zod';

/** Generic line item schema shared by purchase and sales invoices */
export const ErpInvoiceItemSchema = z.object({
  item_code: z.string().optional(),
  item_name: z.string(),
  description: z.string().optional(),
  qty: z.number(),
  rate: z.number(),
  amount: z.number().optional(),
  uom: z.string().optional(),
  warehouse: z.string().optional(),
});
export type ErpInvoiceItem = z.infer<typeof ErpInvoiceItemSchema>;

/** Purchase Invoice payload */
export const PurchaseInvoiceSchema = z.object({
  doctype: z.literal('Purchase Invoice'),
  supplier: z.string(),
  bill_no: z.string().optional(),
  posting_date: z.string(),
  due_date: z.string().optional(),
  currency: z.string().optional(),
  grand_total: z.number().optional(),
  is_paid: z.union([z.boolean(), z.number()]).optional(),
  set_posting_time: z.number().optional(),
  items: z.array(ErpInvoiceItemSchema),
});
export type PurchaseInvoice = z.infer<typeof PurchaseInvoiceSchema>;

/** Sales Invoice payload */
export const SalesInvoiceSchema = z.object({
  doctype: z.literal('Sales Invoice'),
  customer: z.string(),
  posting_date: z.string(),
  due_date: z.string().optional(),
  currency: z.string().optional(),
  grand_total: z.number().optional(),
  is_pos: z.boolean().optional(),
  set_posting_time: z.number().optional(),
  items: z.array(ErpInvoiceItemSchema),
});
export type SalesInvoice = z.infer<typeof SalesInvoiceSchema>;

/** Item master payload */
export const ItemSchema = z.object({
  doctype: z.literal('Item'),
  item_code: z.string(),
  item_name: z.string(),
  description: z.string().optional(),
  item_group: z.string(),
  stock_uom: z.string(),
  is_stock_item: z.boolean().default(true).optional(),
});
export type ItemPayload = z.infer<typeof ItemSchema>;

/** Bank Transaction payload */
export const BankTransactionSchema = z.object({
  doctype: z.literal('Bank Transaction'),
  date: z.string(),
  account: z.string(),
  description: z.string().optional(),
  deposit: z.number().optional(),
  withdrawal: z.number().optional(),
  reference_number: z.string().optional(),
  party_type: z.string().optional(),
  party: z.string().optional(),
});
export type BankTransaction = z.infer<typeof BankTransactionSchema>;

/** Journal Entry Account line */
export const JournalEntryAccountSchema = z.object({
  account: z.string(),
  debit_in_account_currency: z.number().optional(),
  credit_in_account_currency: z.number().optional(),
  party_type: z.string().optional(),
  party: z.string().optional(),
});
export type JournalEntryAccount = z.infer<typeof JournalEntryAccountSchema>;

/** Journal Entry payload */
export const JournalEntrySchema = z.object({
    doctype: z.literal('Journal Entry'),
    posting_date: z.string(),
    company: z.string(),
    voucher_type: z.string(),
    user_remark: z.string().optional(),
    accounts: z.array(JournalEntryAccountSchema),
});
export type JournalEntry = z.infer<typeof JournalEntrySchema>;


/** Payment Entry reference line */
export const PaymentEntryReferenceSchema = z.object({
  reference_doctype: z.string(),
  reference_name: z.string(),
  due_date: z.string().optional(),
  total_amount: z.number().optional(),
  outstanding_amount: z.number().optional(),
  allocated_amount: z.number().optional(),
});
export type PaymentEntryReference = z.infer<typeof PaymentEntryReferenceSchema>;

/** Payment Entry payload */
export const PaymentEntrySchema = z.object({
  doctype: z.literal('Payment Entry'),
  payment_type: z.enum(['Receive', 'Pay', 'Internal Transfer']),
  posting_date: z.string(),
  company: z.string().optional(),
  party_type: z.string().optional(),
  party: z.string().optional(),
  paid_from: z.string().optional(),
  paid_to: z.string().optional(),
  paid_amount: z.number().optional(),
  received_amount: z.number().optional(),
  reference_no: z.string().optional(),
  reference_date: z.string().optional(),
  references: z.array(PaymentEntryReferenceSchema).optional(),
});
export type PaymentEntry = z.infer<typeof PaymentEntrySchema>;

/** Stock Reconciliation item payload */
export const StockReconciliationItemSchema = z.object({
  item_code: z.string(),
  warehouse: z.string(),
  qty: z.number(),
  valuation_rate: z.number().optional(),
});
export type StockReconciliationItem = z.infer<typeof StockReconciliationItemSchema>;

/** Stock Reconciliation payload */
export const StockReconciliationSchema = z.object({
  doctype: z.literal('Stock Reconciliation'),
  posting_date: z.string(),
  company: z.string().optional(),
  purpose: z.string().optional(),
  set_posting_time: z.number().optional(),
  items: z.array(StockReconciliationItemSchema),
});
export type StockReconciliation = z.infer<typeof StockReconciliationSchema>;

/** Stock Entry item payload */
export const StockEntryItemSchema = z.object({
  item_code: z.string(),
  s_warehouse: z.string().optional(),
  t_warehouse: z.string().optional(),
  qty: z.number(),
  basic_rate: z.number().optional(),
});
export type StockEntryItem = z.infer<typeof StockEntryItemSchema>;

/** Stock Entry payload */
export const StockEntrySchema = z.object({
  doctype: z.literal('Stock Entry'),
  posting_date: z.string(),
  purpose: z.string(),
  company: z.string().optional(),
  set_posting_time: z.number().optional(),
  items: z.array(StockEntryItemSchema),
});
export type StockEntry = z.infer<typeof StockEntrySchema>;

/** Supplier payload for creation */
export const SupplierSchema = z.object({
    doctype: z.literal('Supplier'),
    supplier_name: z.string(),
    supplier_group: z.string().optional(),
    supplier_type: z.enum(['Company', 'Individual']).optional(),
    tax_id: z.string().optional(),
});
export type Supplier = z.infer<typeof SupplierSchema>;
