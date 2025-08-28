// src/lib/erpnext-api.ts
'use server';

import type { ItemPayload, PurchaseInvoice, Supplier, BankTransaction, JournalEntry, JournalEntryAccount } from "./erpnext/types";
import { logError, logInfo } from "./logger";
import { findResource, createResource, getResource, erpnextFetch } from "./erpnext/client";

/**
 * Ensures a supplier exists in ERPNext. If not, it creates one.
 * Uses findResource for an efficient check.
 * @param name The name of the supplier.
 * @param payload Additional data for creation if the supplier doesn't exist.
 */
export async function ensureSupplierExists(name: string, payload?: Partial<Supplier>) {
    const found = await findResource("Supplier", [["supplier_name", "=", name]]);
    if (found) {
        logInfo({ workflow: 'erpnext-api', docType: 'Supplier', action: 'ensure-exists' }, `Supplier "${name}" already exists.`);
        return found;
    }
    logInfo({ workflow: 'erpnext-api', docType: 'Supplier', action: 'ensure-create' }, `Supplier "${name}" not found, creating.`);
    return createResource("Supplier", {
        supplier_name: name,
        supplier_group: "Alle Lieferantengruppen", // Default group
        supplier_type: "Company",
        ...payload
    });
}

/**
 * Ensures an item exists in ERPNext. If not, it creates one.
 * Uses getResource and catches the error for creation.
 * @param item_code The item code.
 * @param payload Additional data for creation if the item doesn't exist.
 */
export async function ensureItemExists(item_code: string, payload?: Partial<ItemPayload>) {
    try {
        const existing = await getResource("Item", item_code);
        logInfo({ workflow: 'erpnext-api', docType: 'Item', action: 'ensure-exists' }, `Item "${item_code}" already exists.`);
        return existing;
    } catch (e: any) {
        if (e.message && (e.message.includes('404') || e.message.includes('does not exist'))) {
            logInfo({ workflow: 'erpnext-api', docType: 'Item', action: 'ensure-create' }, `Item "${item_code}" not found, creating.`);
            return createItem({
                item_code: item_code,
                item_name: payload?.item_name || item_code,
                item_group: "Alle Artikelgruppen", // Default group
                stock_uom: "Stk", // Default UOM
                ...payload
            });
        }
        throw e; // Re-throw other errors
    }
}

/**
 * Creates a new Supplier in ERPNext.
 * @param supplier The supplier data.
 */
export async function createSupplier(supplier: Partial<Supplier>) {
  return createResource("Supplier", supplier);
}

/**
 * Creates a new Item in ERPNext.
 * @param item The item data.
 */
export async function createItem(item: ItemPayload) {
  return createResource("Item", item);
}

/**
 * Creates a new Bank Transaction in ERPNext.
 * @param tx The bank transaction data.
 */
export async function createBankTransaction(tx: BankTransaction) {
    try {
        return await createResource("Bank Transaction", tx);
    } catch (error: any) {
        console.warn("Bank Transaction failed, falling back to Journal Entry. Error:", error.message);
        
        const accounts: JournalEntryAccount[] = [];
        const amount = tx.deposit ?? tx.withdrawal ?? 0;
        
        if (tx.deposit) {
            accounts.push({ // Debit Bank Account
                account: tx.account,
                debit_in_account_currency: amount,
            });
            accounts.push({ // Credit a default account (e.g., Sales)
                account: "4000 - Sales - BRUG", // This should be configurable
                credit_in_account_currency: amount,
            });
        } else { // Withdrawal
            accounts.push({ // Credit Bank Account
                account: tx.account,
                credit_in_account_currency: amount,
            });
            accounts.push({ // Debit a default account (e.g., Purchases)
                account: "6000 - Warenaufwand - BRUG", // This should be configurable
                debit_in_account_currency: amount,
            });
        }

        const journalEntry: JournalEntry = {
            doctype: "Journal Entry",
            posting_date: tx.date,
            company: "Brug Media UG (haftungsbeschränkt)", // This should be configurable
            voucher_type: "Bank Entry",
            user_remark: tx.description || `Transaction on ${tx.date}`,
            accounts: accounts
        };

        return createJournalEntry(journalEntry);
    }
}


/**
 * Creates a new Journal Entry in ERPNext.
 * @param entry The journal entry data.
 */
export async function createJournalEntry(entry: JournalEntry) {
    return createResource("Journal Entry", entry);
}


/**
 * Creates a new Purchase Invoice in ERPNext.
 * @param invoice The purchase invoice data.
 */
export async function createPurchaseInvoice(invoice: PurchaseInvoice) {
  return createResource("Purchase Invoice", invoice);
}