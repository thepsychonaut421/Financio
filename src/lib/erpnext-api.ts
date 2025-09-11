// src/lib/erpnext-api.ts
'use server';

import type { ItemPayload, PurchaseInvoice, Supplier, BankTransaction, JournalEntry, JournalEntryAccount } from "./erpnext/types";
import { logError, logInfo } from "./logger";
import { findResource, createResource, getResource, updateResource } from "./erpnext/client";


function mapSupplierTypeDE(t?: string): "Company"|"Individual" {
  const v = (t || "").toLowerCase();
  if (["einzelperson", "privatperson", "individual"].includes(v)) return "Individual";
  // “Unternehmen”, “GbR”, etc. default to Company
  return "Company";
}

async function resolveGroup(preferred?: string): Promise<string> {
    if (preferred) {
        try {
            const byName = await findResource("Supplier Group", [["name", "like", `%${preferred}%`]]);
            if (byName && (byName as any).name) return (byName as any).name;
        } catch (e) {
            logInfo({ workflow: 'erpnext-api', docType: 'Supplier Group', action: 'resolve-preferred-fail' }, `Could not find preferred supplier group "${preferred}". Falling back. Error: ${e}`);
        }
    }
    try {
        const leaf = await findResource("Supplier Group", [["is_group", "=", 0]]);
        if (leaf && (leaf as any).name) return (leaf as any).name;
    } catch (e) {
        logInfo({ workflow: 'erpnext-api', docType: 'Supplier Group', action: 'resolve-leaf-fail' }, `Could not find any leaf supplier group. Falling back to default. Error: ${e}`);
    }
    return "All Suppliers"; // Fallback to a common default
}


export async function ensureSupplierExistsDE(input: {
  name: string;                 // Lieferantenname
  type?: string;                // Lieferantentyp (DE)
  group?: string;               // Lieferantengruppe
  tax_id?: string;              // USt-IdNr.
  country?: string;             // Land (ex. Deutschland)
  // adresă primară (opțional)
  address?: {
    line1?: string; line2?: string; city?: string; state?: string;
    pincode?: string; country?: string;
  };
  // contact primar (opțional)
  contact?: { email?: string; mobile_no?: string; first_name?: string; last_name?: string; };
}) {
  logInfo({ workflow: 'erpnext-api', docType: 'Supplier', action: 'ensure-de-start', docId: input.name }, `Processing supplier: ${input.name}`);
  // 0) already by exact name
  try { const ex = await getResource("Supplier", input.name); if (ex) return { status:"exists", supplier: ex as any }; } catch {}

  // 1) by supplier_name field
  const found = await findResource("Supplier", [["supplier_name","=",input.name]]);
  if (found) return { status: "exists", supplier: found as any };

  // 2) create
  const payload: any = {
    supplier_name: input.name,
    supplier_type: mapSupplierTypeDE(input.type),
    supplier_group: await resolveGroup(input.group || "All Suppliers"),
    tax_id: input.tax_id || undefined,
    country: input.country || "Deutschland",
  };
  logInfo({ workflow: 'erpnext-api', docType: 'Supplier', action: 'create-payload', docId: input.name }, `Creating supplier with payload: ${JSON.stringify(payload)}`);
  const created = await createResource("Supplier", payload) as any;

  // 3) (opțional) create Address linked
  if (input.address && (input.address.line1 || input.address.city)) {
    const addr = await createResource("Address", {
      address_title: input.name,
      address_type: "Billing",
      address_line1: input.address.line1 || "-",
      address_line2: input.address.line2 || "",
      city: input.address.city || "",
      state: input.address.state || "",
      pincode: input.address.pincode || "",
      country: input.address.country || input.country || "Deutschland",
      links: [{ link_doctype: "Supplier", link_name: created.name }],
    }) as any;
    created._primary_address = addr.name;
  }

  // 4) (opțional) create Contact linked
  if (input.contact && (input.contact.email || input.contact.mobile_no)) {
    const first = input.contact.first_name || input.name;
    const ctc = await createResource("Contact", {
      first_name: first,
      last_name: input.contact.last_name || "",
      email_id: input.contact.email || "",
      mobile_no: input.contact.mobile_no || "",
      links: [{ link_doctype: "Supplier", link_name: created.name }],
    }) as any;
    created._primary_contact = ctc.name;
  }
  
  if (created._primary_address || created._primary_contact) {
      // update resource to link address/contact if they were created
      await updateResource("Supplier", created.name, {
          primary_address: created._primary_address,
          primary_contact: created._primary_contact,
      });
  }

  return { status: "created", supplier: created };
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
        return { doc: existing, status: 'exists' };
    } catch (e: any) {
        if (e.message && (e.message.includes('404') || e.message.includes('does not exist'))) {
            logInfo({ workflow: 'erpnext-api', docType: 'Item', action: 'ensure-create' }, `Item "${item_code}" not found, creating.`);
            const createPayload: ItemPayload = {
                doctype: "Item",
                item_code: item_code,
                item_name: payload?.item_name || item_code,
                item_group: payload?.item_group || "All Item Groups", // Default group
                stock_uom: payload?.stock_uom || "Stk", // Default UOM
                is_stock_item: typeof payload?.is_stock_item === 'boolean' ? (payload.is_stock_item ? 1 : 0) : 1,
            };
            const createdDoc = await createItem(createPayload);
            return { doc: createdDoc, status: 'created' };
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
                account: tx.bank_account,
                debit_in_account_currency: amount,
            });
            accounts.push({ // Credit a default account (e.g., Sales)
                account: "4000 - Sales - BRUG", // This should be configurable
                credit_in_account_currency: amount,
            });
        } else { // Withdrawal
            accounts.push({ // Credit Bank Account
                account: tx.bank_account,
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

export async function ensureSupplierExists(name: string, extra: any = {}) {
    const found = await findResource("Supplier", [["supplier_name","=",name]]);
    if (found) return { status: "exists", doc: found };

    const payload = {
        supplier_name: name,
        supplier_type: extra.supplier_type ?? "Company",
        supplier_group: extra.supplier_group ?? "All Suppliers",
        tax_id: extra.tax_id ?? undefined,
        ...extra,
    };
    const created = await createResource("Supplier", payload);
    return { status: "created", doc: created };
}

// Add findResource export so it can be used in the API route
export { findResource };