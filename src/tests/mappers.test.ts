import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { mapPurchaseInvoice } from '@/lib/erpnext/mappers/invoice';
import { mapBankTransaction } from '@/lib/erpnext/mappers/bank';
import type { ERPIncomingInvoiceItem } from '@/types/incoming-invoice';
import type { BankTransaction as InternalBankTransaction } from '@/lib/bank-matcher/types';

describe('mapPurchaseInvoice duplicate reruns', () => {
  const invoice: ERPIncomingInvoiceItem = {
    pdfFileName: 'inv.pdf',
    rechnungsnummer: 'INV-1',
    datum: '2024-01-01',
    lieferantName: 'Supplier',
    gesamtbetrag: 100,
    rechnungspositionen: [
      { productCode: 'SKU1', productName: 'Widget', quantity: 1, unitPrice: 100 },
    ],
  };

  beforeEach(() => {
    vi.resetModules();
    process.env.FINANCIO_MODE = 'api';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.FINANCIO_MODE;
  });

  test('detects duplicate invoice reruns', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) })
      .mockResolvedValueOnce({ json: async () => ({ name: 'INV-ERP' }) });

    // @ts-ignore - assign to global fetch
    global.fetch = fetchMock;

    const endpoint = 'http://example.com/purchase';
    await mapPurchaseInvoice(invoice, { endpoint });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const second = await mapPurchaseInvoice(invoice, { endpoint });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((second.response as any).duplicate).toBe(true);
  });
});

describe('mapBankTransaction with partial payments or missing references', () => {
  test('handles partial payment and missing party', async () => {
    const tx: InternalBankTransaction = {
      id: 'tx1',
      date: '2024-01-01',
      description: 'Partial payment',
      amount: -50,
    };
    const res = await mapBankTransaction(tx);
    expect(res.payload.withdrawal).toBe(50);
    expect(res.payload.party).toBeUndefined();

    const tx2: InternalBankTransaction = {
      id: 'tx2',
      date: '2024-01-02',
      description: 'Deposit',
      amount: 30,
      recipientOrPayer: 'Customer',
    };
    const res2 = await mapBankTransaction(tx2);
    expect(res2.payload.deposit).toBe(30);
    expect(res2.payload.party).toBe('Customer');
  });
});
