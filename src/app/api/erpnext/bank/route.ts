import { NextResponse } from 'next/server';
import type { BankTransaction } from '@/lib/erpnext/types';
import { parseCsvLines, upsertBankTransactions, applyMatchingRules } from '@/lib/erpnext/services/bank';
import type { ERPIncomingInvoiceItem } from '@/types/incoming-invoice';

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get('dryRun') === 'true';

  if (!dryRun) {
    if (!process.env.ERNEXT_BANK_TRANSACTION_URL || !process.env.ERNEXT_API_KEY || !process.env.ERNEXT_API_SECRET) {
      return NextResponse.json(
        { error: 'Server configuration error: ERPNext credentials not set.' },
        { status: 500 },
      );
    }
  }

  const headers = !dryRun
    ? {
        Authorization: `token ${process.env.ERNEXT_API_KEY}:${process.env.ERNEXT_API_SECRET}`,
        Accept: 'application/json',
      }
    : undefined;

  let transactions: BankTransaction[] = [];
  const contentType = request.headers.get('content-type') || '';

  try {
    if (contentType.includes('text/csv')) {
      const csv = await request.text();
      const account = process.env.ERNEXT_BANK_ACCOUNT || '';
      transactions = parseCsvLines(csv, account);
    } else {
      const body = await request.json();
      transactions = (body.transactions || []) as BankTransaction[];
      if (!dryRun && body.invoices) {
        await applyMatchingRules(
          transactions,
          body.invoices as ERPIncomingInvoiceItem[],
          {
            endpoint: process.env.ERNEXT_BANK_TRANSACTION_URL!,
            paymentEndpoint: process.env.ERNEXT_PAYMENT_ENTRY_URL,
            headers,
            createPayments: true,
          },
        );
      }
    }

    if (transactions.length === 0) {
      return NextResponse.json({ error: 'No transactions provided.' }, { status: 400 });
    }

    if (!dryRun) {
      await upsertBankTransactions(transactions, {
        endpoint: process.env.ERNEXT_BANK_TRANSACTION_URL!,
        headers,
      });
    }

    return NextResponse.json({ message: `${transactions.length} transaction(s) processed.` });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to process transactions.' }, { status: 500 });
  }
}
