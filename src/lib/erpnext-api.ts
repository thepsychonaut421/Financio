
// src/lib/erpnext-api.ts

import type { ItemPayload, PurchaseInvoice, Supplier, BankTransaction, JournalEntry, JournalEntryAccount } from "./erpnext/types";
import { logError, logInfo } from "./logger";

/**
 * Generic fetch helper for ERPNext REST API.
 * Handles authentication and base URL.
 * Throws an error if the response is not OK.
 * @param path The API path (e.g., /api/resource/Supplier)
 * @param opts The fetch options (method, body, etc.)
 * @returns The JSON response from the server.
 */
async function erpnextFetch(path: string, opts: RequestInit = {}): Promise<any> {
    const baseUrl = process.env.ERPNEXT_BASE_URL;
    const apiKey = process.env.ERPNEXT_API_KEY;
    const apiSecret = process.env.ERPNEXT_API_SECRET;
  
    if (!baseUrl || !apiKey || !apiSecret) {
      throw new Error("ERPNext environment variables (BASE_URL, API_KEY, API_SECRET) are not set.");
    }
  
    const url = `${baseUrl}${path}`;
    
    const headers = {
      ...opts.headers,
      "Content-Type": "application/json",
      "Authorization": `token ${apiKey}:${apiSecret}`,
    };
  
    const response = await fetch(url, { ...opts, headers });
  
    const responseBody = await response.text();
  
    if (!response.ok) {
        let errorDetails = responseBody;
        try {
            const errorJson = JSON.parse(responseBody);
            errorDetails = errorJson.exception || errorJson.message || errorJson._server_messages || responseBody;
            if (Array.isArray(errorJson._server_messages)) {
              errorDetails = JSON.parse(errorJson._server_messages[0]).message;
            }
        } catch (e) {
            // ignore if response is not json
        }
        logError({ workflow: 'erpnext-api', docType: 'Generic', action: 'fetch-error' }, errorDetails, `ERPNext API request failed to ${path}`);
        throw new Error(`ERPNext API request failed with status ${response.status}: ${errorDetails}`);
    }
  
    try {
        return JSON.parse(responseBody);
    } catch(e) {
        return responseBody; // Return text if not valid JSON
    }
}
  

// --- Resource Creation & Ensure Functions ---

/**
 * Ensures a supplier exists in ERPNext. If not, it creates one.
 * @param name The name of the supplier.
 * @param payload Additional data for creation if the supplier doesn't exist.
 */
export async function ensureSupplierExists(name: string, payload?: Partial<Supplier>) {
    try {
        return await erpnextFetch(`/api/resource/Supplier/${encodeURIComponent(name)}`, { method: 'GET' });
    } catch (e: any) {
        if (e.message && e.message.includes('404')) {
            logInfo({ workflow: 'erpnext-api', docType: 'Supplier', action: 'ensure-create' }, `Supplier "${name}" not found, creating.`);
            return createSupplier({
                supplier_name: name,
                supplier_group: "Alle Lieferantengruppen", // Default group
                supplier_type: "Company",
                ...payload
            });
        }
        throw e; // Re-throw other errors
    }
}

/**
 * Ensures an item exists in ERPNext. If not, it creates one.
 * @param item_code The item code.
 * @param payload Additional data for creation if the item doesn't exist.
 */
export async function ensureItemExists(item_code: string, payload?: Partial<ItemPayload>) {
    try {
        return await erpnextFetch(`/api/resource/Item/${encodeURIComponent(item_code)}`, { method: 'GET' });
    } catch (e: any) {
        if (e.message && e.message.includes('404')) {
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
export async function createSupplier(supplier: Supplier) {
  return erpnextFetch("/api/resource/Supplier", {
    method: "POST",
    body: JSON.stringify(supplier),
  });
}

/**
 * Creates a new Item in ERPNext.
 * @param item The item data.
 */
export async function createItem(item: ItemPayload) {
  return erpnextFetch("/api/resource/Item", {
    method: "POST",
    body: JSON.stringify(item),
  });
}

/**
 * Creates a new Bank Transaction in ERPNext.
 * @param tx The bank transaction data.
 */
export async function createBankTransaction(tx: BankTransaction) {
    try {
        return await erpnextFetch("/api/resource/Bank Transaction", {
            method: "POST",
            body: JSON.stringify(tx),
        });
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
    return erpnextFetch("/api/resource/Journal Entry", {
        method: "POST",
        body: JSON.stringify(entry),
    });
}


/**
 * Creates a new Purchase Invoice in ERPNext.
 * @param invoice The purchase invoice data.
 */
export async function createPurchaseInvoice(invoice: PurchaseInvoice) {
  return erpnextFetch("/api/resource/Purchase Invoice", {
    method: "POST",
    body: JSON.stringify(invoice),
  });
}
