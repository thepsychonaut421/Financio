import { NextResponse } from 'next/server';
import { createBankTransaction } from '@/lib/erpnext-api';
import type { BankTransaction } from '@/lib/erpnext/types';
import { logError, logInfo } from '@/lib/logger';

export async function POST(request: Request) {
  try {
    const transactionData: BankTransaction | BankTransaction[] = await request.json();
    const transactions = Array.isArray(transactionData) ? transactionData : [transactionData];

    logInfo(
      { workflow: 'erpnext-api', docType: 'Bank Transaction', action: 'create-batch' },
      `Received request to create ${transactions.length} bank transaction(s).`
    );

    const results = [];
    for (const tx of transactions) {
      try {
        const response = await createBankTransaction(tx);
        results.push({ success: true, data: response.data, original: tx });
        logInfo(
          { workflow: 'erpnext-api', docType: 'Bank Transaction', action: 'success', reference: tx.reference_number },
          `Successfully created bank transaction.`
        );
      } catch (error: any) {
        results.push({ success: false, error: error.message, original: tx });
        logError(
            { workflow: 'erpnext-api', docType: 'Bank Transaction', action: 'item-error' },
            error,
            `Failed to create individual bank transaction.`
          );
      }
    }
    
    const successfulCreations = results.filter(r => r.success);
    if(successfulCreations.length === transactions.length) {
        return NextResponse.json({ ok: true, message: `Successfully created ${successfulCreations.length} transaction(s).`, results });
    } else {
         return NextResponse.json({ ok: false, message: `Created ${successfulCreations.length} of ${transactions.length} transaction(s).`, results }, { status: 207 });
    }

  } catch (e: any) {
    logError(
        { workflow: 'erpnext-api', docType: 'Bank Transaction', action: 'batch-error' },
        e,
        'A critical error occurred while processing bank transactions.'
      );
    return NextResponse.json(
      { ok: false, error: e.message || 'An unknown error occurred during the batch request.' },
      { status: 500 }
    );
  }
}
