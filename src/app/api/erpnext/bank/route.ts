
import { NextResponse } from 'next/server';
import { createBankTransaction, findResource } from '@/lib/erpnext-api';
import type { BankTransaction } from '@/lib/erpnext/types';
import { logError, logInfo } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const transactionData: BankTransaction[] = await request.json();
    const transactions = Array.isArray(transactionData) ? transactionData : [transactionData];

    logInfo(
      { workflow: 'erpnext-api', docType: 'Bank Transaction', action: 'create-batch' },
      `Received request to create ${transactions.length} bank transaction(s).`
    );

    const results = [];
    for (const tx of transactions) {
      try {
        // Idempotency Check: Use reference_number to check for existence
        if (tx.reference_number) {
            const existing = await findResource("Bank Transaction", [["reference_number", "=", tx.reference_number]]);
            if (existing) {
                results.push({ success: true, status: 'skipped_duplicate', data: existing, original: tx });
                logInfo(
                    { workflow: 'erpnext-api', docType: 'Bank Transaction', action: 'duplicate-check', reference: tx.reference_number },
                    `Skipped duplicate bank transaction.`
                );
                continue; // Skip to the next transaction
            }
        }
        
        const response = await createBankTransaction(tx);
        results.push({ success: true, status: 'created', data: response, original: tx });
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
    const status = successfulCreations.length > 0 ? 207 : 500; // 207 Multi-Status

    return NextResponse.json({ 
      ok: successfulCreations.length > 0, 
      message: `Processed ${results.length} transaction(s). See results for details.`, 
      results 
    }, { status });

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
