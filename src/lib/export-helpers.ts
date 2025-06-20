
import type { IncomingInvoiceItem, ERPIncomingInvoiceItem } from '@/types/incoming-invoice';
import { format as formatDateFns, parseISO, isValid } from 'date-fns';

export function downloadFile(content: string, fileName: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCSVField(field: string | number | undefined | null): string {
  if (field === undefined || field === null) return '';
  const stringField = String(field);
  if (stringField.includes('"') || stringField.includes(',') || stringField.includes('\n') || stringField.includes('\r')) {
    return `"${stringField.replace(/"/g, '""')}"`;
  }
  return stringField;
}

// This function is not directly used by ERPNext export but kept for standard CSV.
function formatDateToMMDDYY(dateString?: string): string {
  if (!dateString) return '';
  try {
    // Assuming dateString is already YYYY-MM-DD from formatDateForERP
    const date = parseISO(dateString); 
    if (isValid(date)) {
      return formatDateFns(date, 'MM/dd/yy');
    }
  } catch (e) { /* ignore */ }
  // Fallback if already in a different format or parsing fails
  return dateString; 
}


export function incomingInvoicesToCSV(invoices: IncomingInvoiceItem[]): string {
  if (!invoices || invoices.length === 0) return '';

  const mainHeaders = [
    'PDF Datei',
    'Rechnungsnummer',
    'Datum', 
    'Lieferant Name',
    'Lieferant Adresse',
    'Zahlungsziel',
    'Zahlungsart',
    'Gesamtbetrag',
    'MwSt-Satz',
    'Kunden-Nr.',
    'Bestell-Nr.'
  ];
  const itemHeaders = ['Pos. Produkt Code', 'Pos. Produkt Name', 'Pos. Menge', 'Pos. Einzelpreis'];
  
  let csvString = mainHeaders.join(',') + ',' + itemHeaders.join(',') + '\n';

  invoices.forEach((invoice) => {
    const mainInvoiceData = [
      escapeCSVField(invoice.pdfFileName),
      escapeCSVField(invoice.rechnungsnummer),
      escapeCSVField(invoice.datum), 
      escapeCSVField(invoice.lieferantName),
      escapeCSVField(invoice.lieferantAdresse),
      escapeCSVField(invoice.zahlungsziel),
      escapeCSVField(invoice.zahlungsart),
      invoice.gesamtbetrag?.toString() ?? '',
      escapeCSVField(invoice.mwstSatz),
      escapeCSVField(invoice.kundenNummer),
      escapeCSVField(invoice.bestellNummer),
    ];

    if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
      invoice.rechnungspositionen.forEach(item => {
        const itemData = [
          escapeCSVField(item.productCode),
          escapeCSVField(item.productName),
          item.quantity.toString(),
          item.unitPrice.toString(),
        ];
        csvString += mainInvoiceData.join(',') + ',' + itemData.join(',') + '\n';
      });
    } else {
      // If no items, just write the main invoice data with empty item fields
      const emptyItemData = Array(itemHeaders.length).fill('');
      csvString += mainInvoiceData.join(',') + ',' + emptyItemData.join(',') + '\n'; 
    }
  });

  return csvString;
}


export function incomingInvoicesToERPNextCSVComplete(invoices: ERPIncomingInvoiceItem[]): string {
  if (!invoices || invoices.length === 0) return '';

  // Invoice level headers (excluding ID and naming_series as requested)
  const invoiceHeaders = [
    "supplier", "bill_no", "bill_date", "posting_date", "due_date", 
    "currency", "credit_to", "is_paid", "remarks", 
    "update_stock", "set_posting_time"
    // Naming series is handled by ERPNext
  ];

  // Item level headers, aligned with ERPNext Purchase Invoice Item template
  const itemHeaders = [
    "ID (Items)", // Mapped from item.productCode
    "Item Name (Items)", // Mapped from item.productName
    "Description (Items)", // Can be same as Item Name
    "Accepted Qty (Items)", // Mapped from item.quantity
    "UOM (Items)", // Default "Stk"
    "Rate (Items)", // Mapped from item.unitPrice
    "Amount (Items)", // Calculated: qty * rate
    "Accepted Qty in Stock UOM (Items)", // Default to Accepted Qty
    "UOM Conversion Factor (Items)", // Default 1
    "Amount (Company Currency) (Items)", // Default to Amount (assuming invoice currency is company currency)
    "Rate (Company Currency) (Items)", // Default to Rate
    "Warehouse (Items)", // Placeholder - User to fill
    "Cost Center (Items)", // Placeholder - User to fill
    "Expense Account (Items)", // Placeholder - User to fill
  ];
  
  const allHeaders = [...invoiceHeaders, ...itemHeaders];
  let csvString = allHeaders.map(escapeCSVField).join(',') + '\n';

  invoices.forEach((invoice) => {
    const invoiceLevelData = [
      escapeCSVField(invoice.lieferantName),
      escapeCSVField(invoice.rechnungsnummer), // bill_no
      escapeCSVField(invoice.billDate),     
      escapeCSVField(invoice.datum), // posting_date
      escapeCSVField(invoice.dueDate),      
      escapeCSVField(invoice.wahrung || 'EUR'),
      "", // credit_to (intentionally blank)
      invoice.istBezahlt?.toString() ?? '0',
      escapeCSVField(invoice.remarks),
      '1', // update_stock (default)
      '1', // set_posting_time (default)
    ];

    if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
      invoice.rechnungspositionen.forEach(item => {
        const itemAmount = (item.quantity || 0) * (item.unitPrice || 0);
        const itemData = [
          escapeCSVField(item.productCode),                 // ID (Items)
          escapeCSVField(item.productName),                 // Item Name (Items)
          escapeCSVField(item.productName),                 // Description (Items)
          item.quantity?.toString() ?? '0',                 // Accepted Qty (Items)
          "Stk",                                            // UOM (Items)
          item.unitPrice?.toString() ?? '0.00',             // Rate (Items)
          itemAmount.toFixed(2),                            // Amount (Items)
          item.quantity?.toString() ?? '0',                 // Accepted Qty in Stock UOM (Items)
          '1',                                              // UOM Conversion Factor (Items)
          itemAmount.toFixed(2),                            // Amount (Company Currency) (Items)
          item.unitPrice?.toString() ?? '0.00',             // Rate (Company Currency) (Items)
          "",                                               // Warehouse (Items)
          "",                                               // Cost Center (Items)
          "",                                               // Expense Account (Items)
        ];
        csvString += [...invoiceLevelData, ...itemData].map(escapeCSVField).join(',') + '\n';
      });
    } else {
      const emptyItemData = Array(itemHeaders.length).fill(''); 
      csvString += [...invoiceLevelData, ...emptyItemData].map(escapeCSVField).join(',') + '\n';
    }
  });
  return csvString;
}


export function incomingInvoicesToJSON(invoices: IncomingInvoiceItem[] | ERPIncomingInvoiceItem[]): string {
  return JSON.stringify(invoices, null, 2);
}

function escapeTSVField(field: string | number | undefined | null): string {
  if (field === undefined || field === null) return '';
  return String(field).replace(/\t/g, ' ').replace(/\n/g, ' ').replace(/\r/g, ' ');
}

export function incomingInvoicesToTSV(invoices: IncomingInvoiceItem[] | ERPIncomingInvoiceItem[], erpMode: boolean, useMinimalErpExport: boolean): string {
  if (!invoices || invoices.length === 0) return '';
  let tsvString = '';

  if (erpMode) {
    const erpInvoices = invoices as ERPIncomingInvoiceItem[];
    let headers: string[];
     // For TSV, "complete" mode will follow the new detailed CSV structure for invoices
    const invoiceHeaders = [
        "supplier", "bill_no", "bill_date", "posting_date", "due_date", 
        "currency", "credit_to", "is_paid", "remarks", 
        "update_stock", "set_posting_time"
    ];
    const itemHeaders = [
        "ID (Items)", "Item Name (Items)", "Description (Items)", "Accepted Qty (Items)", "UOM (Items)",
        "Rate (Items)", "Amount (Items)", "Accepted Qty in Stock UOM (Items)", "UOM Conversion Factor (Items)",
        "Amount (Company Currency) (Items)", "Rate (Company Currency) (Items)",
        "Warehouse (Items)", "Cost Center (Items)", "Expense Account (Items)"
    ];
    headers = [...invoiceHeaders, ...itemHeaders];
    tsvString = headers.map(h => escapeTSVField(h)).join('\t') + '\n';

    erpInvoices.forEach((invoice) => {
      const mainInvoiceData = [
        invoice.lieferantName,
        invoice.rechnungsnummer, // bill_no
        invoice.billDate,
        invoice.datum, // posting_date
        invoice.dueDate,
        invoice.wahrung || 'EUR',
        "", // credit_to
        invoice.istBezahlt?.toString() ?? '0',
        invoice.remarks,
        '1', // update_stock
        '1', // set_posting_time
      ];
      const mainInvoiceDataEscaped = mainInvoiceData.map(f => escapeTSVField(f));

      if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
        invoice.rechnungspositionen.forEach(item => {
          const itemAmount = (item.quantity || 0) * (item.unitPrice || 0);
          const itemData = [
            item.productCode,                 // ID (Items)
            item.productName,                 // Item Name (Items)
            item.productName,                 // Description (Items)
            item.quantity.toString(),         // Accepted Qty (Items)
            "Stk",                            // UOM (Items)
            item.unitPrice.toString(),        // Rate (Items)
            itemAmount.toFixed(2),            // Amount (Items)
            item.quantity.toString(),         // Accepted Qty in Stock UOM (Items)
            '1',                              // UOM Conversion Factor (Items)
            itemAmount.toFixed(2),            // Amount (Company Currency) (Items)
            item.unitPrice.toString(),        // Rate (Company Currency) (Items)
            "",                               // Warehouse (Items)
            "",                               // Cost Center (Items)
            "",                               // Expense Account (Items)
          ];
          const itemDataEscaped = itemData.map(f => escapeTSVField(f));
          tsvString += [...mainInvoiceDataEscaped, ...itemDataEscaped].join('\t') + '\n';
        });
      } else {
        const emptyItemDataEscaped = Array(itemHeaders.length).fill('').map(f => escapeTSVField(f));
        tsvString += mainInvoiceDataEscaped.join('\t') + '\t' + emptyItemDataEscaped.join('\t') + '\n';
      }
    });
  } else { 
    // Standard (non-ERP) TSV export
    const regularInvoices = invoices as IncomingInvoiceItem[];
    const mainHeaders = [
      'PDF Datei', 'Rechnungsnummer', 'Datum', 'Lieferant Name', 'Lieferant Adresse',
      'Zahlungsziel', 'Zahlungsart', 'Gesamtbetrag', 'MwSt-Satz', 'Kunden-Nr.', 'Bestell-Nr.'
    ];
    const itemHeaders = ['Pos. Produkt Code', 'Pos. Produkt Name', 'Pos. Menge', 'Pos. Einzelpreis'];
    tsvString = mainHeaders.map(h => escapeTSVField(h)).join('\t') + '\t' + itemHeaders.map(h => escapeTSVField(h)).join('\t') + '\n';

    regularInvoices.forEach((invoice) => {
      const mainInvoiceData = [
        escapeTSVField(invoice.pdfFileName),
        escapeTSVField(invoice.rechnungsnummer),
        escapeTSVField(invoice.datum),
        escapeTSVField(invoice.lieferantName),
        escapeTSVField(invoice.lieferantAdresse),
        escapeTSVField(invoice.zahlungsziel),
        escapeTSVField(invoice.zahlungsart),
        invoice.gesamtbetrag?.toString() ?? '',
        escapeTSVField(invoice.mwstSatz),
        escapeCSVField(invoice.kundenNummer),
        escapeCSVField(invoice.bestellNummer),
      ];

      if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
        invoice.rechnungspositionen.forEach(item => {
          const itemData = [
            escapeTSVField(item.productCode),
            escapeTSVField(item.productName),
            item.quantity.toString(),
            item.unitPrice.toString(),
          ];
          tsvString += mainInvoiceData.join('\t') + '\t' + itemData.join('\t') + '\n';
        });
      } else {
        const emptyItemData = Array(itemHeaders.length).fill('');
        tsvString += mainInvoiceData.join('\t') + '\t' + emptyItemData.join('\t') + '\n';
      }
    });
  }
  return tsvString;
}

// New function to export suppliers for ERPNext
export function erpInvoicesToSupplierCSV(invoices: ERPIncomingInvoiceItem[]): string {
  if (!invoices || invoices.length === 0) return '';

  const supplierHeaders = [
    "ID", "Lieferantenname", "Lieferantentyp", "Nummernkreise", "Land", 
    "Lieferantengruppe", "Ist Transporter", "Bild", "Abrechnungswährung", 
    "Standard-Bankkonto des Unternehmens", "Preisliste", "Ist interner Lieferant", 
    "Repräsentiert das Unternehmen", "Lieferantendetails", "Webseite", "Drucksprache", 
    "Steuernummer", "Steuerkategorie", "Steuereinbehalt Kategorie", 
    "Hauptadresse des Lieferanten", "Hauptadresse", "Hauptkontakt des Lieferanten", 
    "Mobilfunknummer", "E-Mail-ID", "Standardvorlage für Zahlungsbedingungen", 
    "Erstellen von Eingangsrechnung ohne Bestellung zulassen", 
    "Erstellen von Eingangsrechnung ohne Eingangsbeleg zulassen", 
    "Ist gesperrt", "Deaktiviert", "Warnung Ausschreibungen", "Warnen Sie POs", 
    "Vermeidung von Ausschreibungen", "Vermeiden Sie POs", "Lieferant blockieren", 
    "Halte-Typ", "Veröffentlichungsdatum", "ID (Erlaubt Transaktionen mit)", 
    "Unternehmen (Erlaubt Transaktionen mit)", "ID (Rechnungswesen)", 
    "Standardkonto (Rechnungswesen)", "Unternehmen (Rechnungswesen)", 
    "Vorauskonto (Rechnungswesen)", "ID (Benutzer des Lieferantenportals)", 
    "Nutzer (Benutzer des Lieferantenportals)"
  ];

  let csvString = supplierHeaders.map(escapeCSVField).join(',') + '\n';

  const uniqueSuppliers = new Map<string, ERPIncomingInvoiceItem>();
  invoices.forEach(invoice => {
    // Use a consistent key for the map, handling potentially undefined or empty supplier names
    const supplierKey = (invoice.lieferantName || 'UNKNOWN_SUPPLIER').trim();
    if (supplierKey && !uniqueSuppliers.has(supplierKey)) {
      uniqueSuppliers.set(supplierKey, invoice);
    }
  });

  uniqueSuppliers.forEach(invoice => { 
    const supplierDataRow = [
      "", // ID (empty for new supplier, ERPNext will assign)
      escapeCSVField(invoice.lieferantName), // Lieferantenname
      "Company", // Lieferantentyp (default)
      "", // Nummernkreise (default empty, ERPNext will use default)
      "Germany", // Land (default)
      "All Supplier Groups", // Lieferantengruppe (default)
      "No", // Ist Transporter (default "No")
      "", // Bild (empty)
      escapeCSVField(invoice.wahrung || "EUR"), // Abrechnungswährung
      "", // Standard-Bankkonto des Unternehmens (empty)
      "", // Preisliste (empty)
      "No", // Ist interner Lieferant (default "No")
      "", // Repräsentiert das Unternehmen (empty)
      "", // Lieferantendetails (empty)
      "", // Webseite (empty)
      "de", // Drucksprache (default "de" for German)
      "", // Steuernummer (To be potentially extracted by AI or filled manually)
      "", // Steuerkategorie (empty)
      "", // Steuereinbehalt Kategorie (empty)
      escapeCSVField(invoice.lieferantAdresse), // Hauptadresse des Lieferanten
      escapeCSVField(invoice.lieferantAdresse), // Hauptadresse (can be same)
      "", // Hauptkontakt des Lieferanten (empty)
      "", // Mobilfunknummer (empty)
      "", // E-Mail-ID (empty)
      "", // Standardvorlage für Zahlungsbedingungen (empty)
      "Yes", // Erstellen von Eingangsrechnung ohne Bestellung zulassen (default "Yes")
      "Yes", // Erstellen von Eingangsrechnung ohne Eingangsbeleg zulassen (default "Yes")
      "No", // Ist gesperrt (default "No")
      "No", // Deaktiviert (default "No")
      "No", // Warnung Ausschreibungen (default "No")
      "No", // Warnen Sie POs (default "No")
      "No", // Vermeidung von Ausschreibungen (default "No")
      "No", // Vermeiden Sie POs (default "No")
      "", // Lieferant blockieren (empty)
      "", // Halte-Typ (empty)
      "", // Veröffentlichungsdatum (empty)
      "", // ID (Erlaubt Transaktionen mit) (empty)
      "", // Unternehmen (Erlaubt Transaktionen mit) (empty)
      "", // ID (Rechnungswesen) (empty)
      "", // Standardkonto (Rechnungswesen) (empty)
      "", // Unternehmen (Rechnungswesen) (empty)
      "", // Vorauskonto (Rechnungswesen) (empty)
      "", // ID (Benutzer des Lieferantenportals) (empty)
      "", // Nutzer (Benutzer des Lieferantenportals) (empty)
    ];
    csvString += supplierDataRow.join(',') + '\n';
  });

  return csvString;
}
