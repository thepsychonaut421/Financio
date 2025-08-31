
import { describe, it, expect } from 'vitest';
import { isShippingFee } from '@/lib/is-shipping-fee';

describe('isShippingFee', () => {
  it('matches obvious shipping words', () => {
    expect(isShippingFee('Versandkostenpauschale DHL', 'X')).toBe(true);
    expect(isShippingFee('Postage label', 'X')).toBe(true);
    expect(isShippingFee('Fracht & Speditionskosten', '')).toBe(true);
  });

  it('does not match substrings that are part of a larger word', () => {
    expect(isShippingFee('Transporteur Adapter 12mm', '')).toBe(false);
    expect(isShippingFee('Portobello Messer', '')).toBe(false);
    expect(isShippingFee('Transporthülle', '')).toBe(false);
    expect(isShippingFee('GLS-Schneidergerät', 'X')).toBe(false);
  });

  it('matches custom keywords safely', () => {
    expect(isShippingFee('Taxa curier', '', ['curier'])).toBe(true);
    expect(isShippingFee('Livrare speciala', '', ['livrare'])).toBe(true);
    // This tests if a user providing regex characters breaks the function
    expect(isShippingFee('X', 'Y', ['(weird)*+?'])).toBe(false); 
  });

  it('matches explicit code "VERSAND"', () => {
    expect(isShippingFee('Some description', 'VERSAND')).toBe(true);
  });
  
  it('matches code starting with "VERSAND"', () => {
    expect(isShippingFee('Another description', 'VERSAND-123')).toBe(true);
  });

  it('handles various cases and diacritics in keywords', () => {
    expect(isShippingFee('Speditionskosten', 'x')).toBe(true);
    expect(isShippingFee('Kosten für TRANSPORTKOSTEN', 'x')).toBe(true);
  });

  it('handles empty or undefined inputs gracefully', () => {
    expect(isShippingFee(undefined, undefined, [])).toBe(false);
    expect(isShippingFee('', '', [])).toBe(false);
  });

  it('matches keywords with dashes or slashes in text', () => {
     expect(isShippingFee('Porto/Verpackung', '')).toBe(true);
     expect(isShippingFee('Versand-Pauschale', '')).toBe(true);
     expect(isShippingFee('DHL Paket', 'xyz')).toBe(true);
  });
});
