// src/app/api/erpnext/bank/route.ts
import { NextResponse } from "next/server";
import { createResource, findResource } from "@/lib/erpnext/client";
import crypto from "crypto";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type IncomingTxn = {
  id?: string;
  bank_account: string;   // ERPNext Bank Account name
  date: string;           // 'YYYY-MM-DD'
  amount: number;         // signed: +deposit, -withdrawal
  description: string;
  reference_number?: string | null;
  party_type?: "Customer" | "Supplier" | "Employee" | "Shareholder" | "Loan" | "Donor" | "Member";
  party?: string | null;  // exact name in ERPNext (optional)
};

type BankTxnDoc = {
  doctype: "Bank Transaction";
  bank_account: string;
  date: string;
  deposit: number;
  withdrawal: number;
  description: string;
  reference_number?: string | null;
  party_type?: string | null;
  party?: string | null;
  external_id: string;
};

function normalizeText(s: string) {
  // Asigurăm text NFC (diacritice corecte) și decupăm whitespace aberant.
  return (s ?? "").normalize("NFC").trim();
}

function makeExternalId(t: IncomingTxn) {
  const base = [
    normalizeText(t.bank_account),
    t.date,
    t.amount.toFixed(2),
    normalizeText(t.description),
    t.reference_number ?? t.id ?? ""
  ].join("|");
  return "BTN-" + crypto.createHash("sha1").update(base, "utf8").digest("hex");
}

function toDoc(t: IncomingTxn): BankTxnDoc {
  const dep = t.amount > 0 ? t.amount : 0;
  const wdr = t.amount < 0 ? Math.abs(t.amount) : 0;

  return {
    doctype: "Bank Transaction",
    bank_account: normalizeText(t.bank_account),
    date: t.date,
    deposit: dep,
    withdrawal: wdr,
    description: normalizeText(t.description),
    reference_number: t.reference_number ?? t.id ?? null,
    party_type: t.party_type ?? null,
    party: t.party ?? null,
    external_id: makeExternalId(t),
  };
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as { transactions: IncomingTxn[] };
    const txns = payload?.transactions ?? [];

    if (!Array.isArray(txns) || txns.length === 0) {
      return NextResponse.json({ ok: false, error: "No transactions provided." }, { status: 400 });
    }

    const results: Array<{ external_id: string; status: "created" | "exists" | "error"; message?: string }> = [];

    // batch for safety (ERPNext rate limiting)
    const batchSize = 75;
    for (let i = 0; i < txns.length; i += batchSize) {
      const slice = txns.slice(i, i + batchSize);

      // Process sequentially to keep it simple/robust; can parallelize if needed
      for (const t of slice) {
        const doc = toDoc(t);
        try {
          // idempotency check
          const exists = await findResource("Bank Transaction", [["external_id", "=", doc.external_id]]);
          if (exists) {
            results.push({ external_id: doc.external_id, status: "exists" });
            continue;
          }
          await createResource("Bank Transaction", doc);
          results.push({ external_id: doc.external_id, status: "created" });
        } catch (e: any) {
          results.push({ external_id: doc.external_id, status: "error", message: e?.message ?? String(e) });
        }
      }
    }
    
    const summary = {
        created: results.filter(r => r.status === 'created').length,
        exists: results.filter(r => r.status === 'exists').length,
        errors: results.filter(r => r.status === 'error').length,
    }

    return NextResponse.json({ ok: true, count: results.length, summary, results });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
