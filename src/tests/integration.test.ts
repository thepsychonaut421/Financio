import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { mapPurchaseInvoice } from '@/lib/erpnext/mappers/invoice';
import { mapBankTransaction } from '@/lib/erpnext/mappers/bank';
import type { ERPIncomingInvoiceItem } from '@/types/incoming-invoice';
import type { BankTransaction as InternalBankTransaction } from '@/lib/bank-matcher/types';

describe('ERPNext upsert integration', () => {
  beforeEach(() => {
    process.env.FINANCIO_MODE = 'api';
    nock.cleanAll();
  });

  afterEach(() => {
    delete process.env.FINANCIO_MODE;
    nock.cleanAll();
  });

  test('purchase invoice upsert is idempotent', async () => {
    const endpoint = 'http://erp.local/purchase';
    const scope = nock('http://erp.local')
      .get('/purchase')
      .query(true)
      .reply(200, { data: [] })
      .post('/purchase')
      .reply(200, { name: 'INV-ERP' });

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

    const first = await mapPurchaseInvoice(invoice, { endpoint });
    expect((first.response as any).name).toBe('INV-ERP');

    const second = await mapPurchaseInvoice(invoice, { endpoint });
    expect((second.response as any).duplicate).toBe(true);

    scope.done();
  });

  test('bank transaction upsert is idempotent', async () => {
    const endpoint = 'http://erp.local/bank';
    const scope = nock('http://erp.local')
      .get('/bank')
      .query(true)
      .reply(200, { data: [] })
      .post('/bank')
      .reply(200, { name: 'BT-1' });

    const tx: InternalBankTransaction = {
      id: 'tx1',
      date: '2024-01-01',
      description: 'Payment',
      amount: -20,
      recipientOrPayer: 'Vendor',
    };

    const first = await mapBankTransaction(tx, { endpoint });
    expect((first.response as any).name).toBe('BT-1');

    const second = await mapBankTransaction(tx, { endpoint });
    expect((second.response as any).duplicate).toBe(true);

    scope.done();
  });
});
