import { describe, expect, test, vi, beforeEach } from 'vitest';

// Tests for the SKU resolver service

describe('resolveOrCreateItem', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test('creates provisional code when SKU is missing', async () => {
    const { resolveOrCreateItem } = await import('@/lib/erpnext/services/sku-resolver');
    const code = await resolveOrCreateItem({ name: 'Unknown Product' });
    expect(code).toMatch(/^TMP-/);
  });

  test('returns same code for known supplier SKU', async () => {
    const mod = await import('@/lib/erpnext/services/sku-resolver');
    const first = await mod.resolveOrCreateItem({ supplierCode: 'SUP1', name: 'Widget' });
    const second = await mod.resolveOrCreateItem({ supplierCode: 'SUP1', name: 'Widget' });
    expect(second).toBe(first);
  });

  test('maps wrong supplier code to existing item by name', async () => {
    const mod = await import('@/lib/erpnext/services/sku-resolver');
    const original = await mod.resolveOrCreateItem({ supplierCode: 'SUP1', name: 'Widget' });
    const mapped = await mod.resolveOrCreateItem({ supplierCode: 'WRONG', name: 'Widget' });
    expect(mapped).toBe(original);
  });
});
