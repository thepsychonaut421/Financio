
import type { IncomingInvoiceItem, ERPIncomingInvoiceItem } from '@/types/incoming-invoice';

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
      escapeCSVField(invoice.datum), // Should be YYYY-MM-DD from AI/processing
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
      const emptyItemData = Array(itemHeaders.length).fill('');
      csvString += mainInvoiceData.join(',') + ',' + emptyItemData.join(',') + '\n'; 
    }
  });

  return csvString;
}

// Minimal ERPNext CSV Export (pentru import Purchase Invoice)
export function incomingInvoicesToERPNextCSV(invoices: ERPIncomingInvoiceItem[]): string {
  if (!invoices || invoices.length === 0) return '';

  // Antete standard pentru importul simplu de Purchase Invoice în ERPNext
  const headers = [
    "supplier", 
    "bill_no",
    "posting_date", // Data facturii
    "due_date", // Data scadenței (opțional, dar bun de avut)
    "currency", 
    "item_code",
    "item_name",
    "qty",
    "rate",
    "is_paid" // 0 or 1
  ];
  
  let csvString = headers.map(escapeCSVField).join(',') + '\n';

  invoices.forEach((invoice) => {
    const mainInvoiceData = [
      escapeCSVField(invoice.lieferantName), 
      escapeCSVField(invoice.rechnungsnummer),
      escapeCSVField(invoice.datum), // Acesta este posting_date, ar trebui să fie YYYY-MM-DD
      escapeCSVField(invoice.dueDate), // dueDate, ar trebui să fie YYYY-MM-DD
      escapeCSVField(invoice.wahrung || 'EUR'),
    ];

    if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
      invoice.rechnungspositionen.forEach(item => {
        const itemData = [
          escapeCSVField(item.productCode), 
          escapeCSVField(item.productName), 
          item.quantity.toString(), 
          item.unitPrice.toString(), 
        ];
        // Adaugă și is_paid la fiecare rând, deoarece ERPNext îl poate dori per linie de import
        // dacă nu este la nivel de antet general al facturii în șablonul de import.
        // Pentru un import simplu, is_paid la nivel de factură este mai comun.
        // Totuși, pentru a mapa la antetele definite, îl punem aici.
        const row = [
            ...mainInvoiceData,
            ...itemData,
            invoice.istBezahlt?.toString() ?? '0'
        ];
        csvString += row.map(escapeCSVField).join(',') + '\n';
      });
    } else {
       // Dacă nu există articole, ERPNext ar putea să nu importe factura sau să dea eroare,
       // dar includem datele principale cu articole goale pentru consistență.
       const emptyItemData = ['', '', '', '']; 
       const row = [
           ...mainInvoiceData,
           ...emptyItemData,
           invoice.istBezahlt?.toString() ?? '0'
       ];
       csvString += row.map(escapeCSVField).join(',') + '\n';
    }
  });

  return csvString;
}


// "Complete" ERPNext CSV Export, adaptat pentru un șablon de import Purchase Invoice
export function incomingInvoicesToERPNextCSVComplete(invoices: ERPIncomingInvoiceItem[]): string {
  if (!invoices || invoices.length === 0) return '';

  // Antete tipice pentru un import mai detaliat de Purchase Invoice
  // Acestea pot varia ușor în funcție de versiunea ERPNext și configurații
  const headers = [
    // Invoice Level
    "name", // Lasă gol pentru nou; ERPNext generează ID-ul
    "supplier",
    "bill_no",          // Nr. factură furnizor
    "bill_date",        // Data facturii furnizor (YYYY-MM-DD)
    "posting_date",     // Data contabilă (YYYY-MM-DD)
    "due_date",         // Data scadenței (YYYY-MM-DD)
    "currency",         // ex: EUR
    "buying_price_list",// Lista de prețuri de achiziție (opțional)
    "company",          // Compania din ERPNext (opțional, dacă e una singură, ERPNext o alege)
    "credit_to",        // Contul de datorii (ex: "Debts - ERP") - Trebuie să existe în ERPNext
    "is_paid",          // 0 sau 1
    "remarks",          // Observații (poate conține kundenNummer, bestellNummer)
    "update_stock",     // 1 dacă actualizează stocul, 0 altfel

    // Item Level (prefixate automat de ERPNext la import, sau separate în fișiere CSV)
    // Pentru un singur CSV, se repetă datele facturii pentru fiecare articol.
    "item_code",
    "item_name",
    "description",      // Descriere articol (poate fi la fel ca item_name)
    "qty",
    "uom",              // Unitate de măsură (ex: Stk, Buc)
    "rate",             // Preț unitar
    "warehouse",        // Depozit (opțional, dacă e specificat per articol)
    "cost_center"       // Centru de cost (opțional)
  ];
  
  let csvString = headers.map(escapeCSVField).join(',') + '\n';

  invoices.forEach((invoice) => {
    const seriesFormat = `ACC-PINV-${invoice.datum?.substring(0,4) || 'YYYY'}.-`; // ex: ACC-PINV-2024.-

    const invoiceLevelData = [
      "", // name (lasă gol)
      escapeCSVField(invoice.lieferantName),
      escapeCSVField(invoice.rechnungsnummer),
      escapeCSVField(invoice.billDate), // Asigură-te că e YYYY-MM-DD
      escapeCSVField(invoice.datum),    // Asigură-te că e YYYY-MM-DD
      escapeCSVField(invoice.dueDate),  // Asigură-te că e YYYY-MM-DD
      escapeCSVField(invoice.wahrung || 'EUR'),
      "", // buying_price_list
      "", // company
      escapeCSVField(invoice.kontenrahmen), // Contul de datorii
      invoice.istBezahlt?.toString() ?? '0',
      escapeCSVField(invoice.remarks),
      '1', // update_stock (presupunem că actualizează stocul)
    ];

    if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
      invoice.rechnungspositionen.forEach(item => {
        const itemData = [
          escapeCSVField(item.productCode),
          escapeCSVField(item.productName),
          escapeCSVField(item.productName), // description
          item.quantity?.toString() ?? '0',
          "Stk", // uom (default "Stk" - bucăți)
          item.unitPrice?.toString() ?? '0.00',
          "", // warehouse (lasă gol sau pune un default)
          ""  // cost_center (lasă gol sau pune un default)
        ];
        csvString += [...invoiceLevelData, ...itemData].join(',') + '\n';
      });
    } else {
      // Pentru facturi fără articole, ERPNext ar putea necesita cel puțin o linie de articol "dummy"
      // sau ar putea fi importată ca o factură fără articole dacă sistemul o permite.
      // Pentru un import standard, este mai sigur să se asigure că există articole sau să se omită factura.
      // Aici, vom crea o linie cu datele facturii și articole goale, dar ERPNext ar putea să o respingă.
      const emptyItemData = Array(8).fill(''); // 8 coloane de articol
      csvString += [...invoiceLevelData, ...emptyItemData].join(',') + '\n';
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
    
    if (useMinimalErpExport) {
      headers = ["supplier", "bill_no", "posting_date", "due_date", "currency", "item_code", "item_name", "qty", "rate", "is_paid"];
    } else {
      headers = [
        "supplier", "bill_no", "bill_date", "posting_date", "due_date", "currency", 
        "credit_to", "is_paid", "remarks", "update_stock",
        "item_code", "item_name", "description", "qty", "uom", "rate", "warehouse", "cost_center"
      ];
    }
    tsvString = headers.map(h => escapeTSVField(h)).join('\t') + '\n';

    erpInvoices.forEach((invoice) => {
      let mainInvoiceData: (string|number|undefined|null)[];
      if (useMinimalErpExport) {
        mainInvoiceData = [
            invoice.lieferantName,
            invoice.rechnungsnummer,
            invoice.datum, // posting_date
            invoice.dueDate,
            invoice.wahrung || 'EUR',
        ];
      } else {
         mainInvoiceData = [
            invoice.lieferantName,
            invoice.rechnungsnummer, // bill_no
            invoice.billDate || invoice.datum, // bill_date
            invoice.datum, // posting_date
            invoice.dueDate,
            invoice.wahrung || 'EUR',
            invoice.kontenrahmen, // credit_to
            invoice.istBezahlt?.toString() ?? '0',
            invoice.remarks,
            '1', // update_stock
         ];
      }
      const mainInvoiceDataEscaped = mainInvoiceData.map(f => escapeTSVField(f));

      if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
        invoice.rechnungspositionen.forEach(item => {
          let itemData: (string|number|undefined|null)[];
          if (useMinimalErpExport) {
            itemData = [
                item.productCode,
                item.productName,
                item.quantity.toString(),
                item.unitPrice.toString(),
                // For minimal, is_paid is conceptually at invoice level, but if header expects it per line:
                invoice.istBezahlt?.toString() ?? '0' 
            ];
          } else {
            itemData = [
                item.productCode,
                item.productName,
                item.productName, // description
                item.quantity.toString(),
                "Stk", // uom
                item.unitPrice.toString(),
                "", // warehouse
                "", // cost_center
            ];
          }
          const itemDataEscaped = itemData.map(f => escapeTSVField(f));
          const rowParts = useMinimalErpExport 
            ? [...mainInvoiceDataEscaped, ...itemDataEscaped.slice(0,4), itemDataEscaped[4] ] // ensure is_paid is last for minimal
            : [...mainInvoiceDataEscaped, ...itemDataEscaped];
          tsvString += rowParts.join('\t') + '\n';
        });
      } else {
        const emptyItemCount = useMinimalErpExport ? 5 : 8; // 4 item fields + is_paid for minimal; 8 for complete
        const emptyItemData = Array(emptyItemCount).fill('');
        if (useMinimalErpExport) {
            emptyItemData[emptyItemCount -1] = invoice.istBezahlt?.toString() ?? '0'; // ensure is_paid is set
        }
        tsvString += mainInvoiceDataEscaped.join('\t') + '\t' + emptyItemData.join('\t') + '\n';
      }
    });

  } else { 
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
        escapeTSVField(invoice.datum), // Should be YYYY-MM-DD
        escapeTSVField(invoice.lieferantName),
        escapeTSVField(invoice.lieferantAdresse),
        escapeTSVField(invoice.zahlungsziel),
        escapeTSVField(invoice.zahlungsart),
        invoice.gesamtbetrag?.toString() ?? '',
        escapeTSVField(invoice.mwstSatz),
        escapeTSVField(invoice.kundenNummer),
        escapeTSVField(invoice.bestellNummer),
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

