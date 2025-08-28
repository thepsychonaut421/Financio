// src/lib/erpnext-api.ts

import type { ItemPayload, PurchaseInvoice, Supplier, BankTransaction, JournalEntry, JournalEntryAccount } from "./erpnext/types";

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
        console.error("ERPNext API Error Response:", responseBody);
        let errorDetails = responseBody;
        try {
            const errorJson = JSON.parse(responseBody);
            errorDetails = errorJson.exception || errorJson.message || responseBody;
        } catch (e) {
            // ignore if response is not json
        }
      throw new Error(`ERPNext API request failed with status ${response.status}: ${errorDetails}`);
    }
  
    try {
        return JSON.parse(responseBody);
    } catch(e) {
        return responseBody; // Return text if not valid JSON
    }
}
  

// --- Resource Creation Functions ---

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
        // Fallback to Journal Entry if Bank Transaction fails (e.g., doctype not available)
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
