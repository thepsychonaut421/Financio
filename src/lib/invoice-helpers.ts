
import type { ERPIncomingInvoiceItem, IncomingInvoiceItem } from '@/types/incoming-invoice';
import { format as formatDateFns, parseISO, isValid } from 'date-fns';


export function formatDateForERP(dateString?: string): string | undefined {
    if (!dateString || dateString.trim() === '') return undefined;
    // Check if it's already in YYYY-MM-DD format and valid
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) { 
        const d = parseISO(dateString); 
        return isValid(d) ? dateString : undefined;
    }
    // Attempt to parse other common formats
    try {
        const d = new Date(dateString);
        if (isValid(d)) {
          const year = d.getFullYear();
          // Basic sanity check for year to avoid very old/future dates
          if (year > 1900 && year < 2100) {
            return formatDateFns(d, 'yyyy-MM-dd');
          }
        }
    } catch (e) { /* ignore parsing errors */ }
    // Return original string if it cannot be parsed into a valid date
    // or as a last resort if it's a format we don't handle automatically.
    return dateString;
};


export const createInvoiceKey = (invoice: ERPIncomingInvoiceItem | IncomingInvoiceItem): string => {
    const supplier = (invoice.lieferantName || '').trim().toLowerCase();
    const number = (invoice.rechnungsnummer || '').trim().toLowerCase();
    const dateNorm = invoice?.datum ? formatDateForERP(invoice.datum) : undefined;
    return `${supplier}||${number}||${dateNorm || 'NO_DATE'}`;
};
