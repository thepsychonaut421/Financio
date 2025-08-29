
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { downloadFile } from '@/lib/export-helpers';
import JSZip from 'jszip';
import { incomingInvoicesToERPNextCSVComplete } from '@/lib/export-helpers';
import ProtectedRoute from '@/components/auth/ProtectedRoute';

const REG_KEY = 'financio:processed-registry:v1';

type RegistryEntry = {
  id: string;
  filename: string;
  status: 'OK' | 'WARN' | 'ERROR' | 'DUPLICATE';
  erpMode: boolean;
  payload: any;
  createdAt: string;
};

function ProcessedInvoicesPageContent() {
  const [registry, setRegistry] = useState<RegistryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(REG_KEY);
      setRegistry(raw ? JSON.parse(raw) : []);
    } catch {
      setRegistry([]);
    }
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return registry;
    return registry.filter(r => {
      const p = r.payload || {};
      return (
        r.filename.toLowerCase().includes(q) ||
        (p.rechnungsnummer || '').toLowerCase().includes(q) ||
        (p.lieferantName || '').toLowerCase().includes(q)
      );
    });
  }, [registry, query]);

  const allSelectedIds = useMemo(
    () => Object.keys(selected).filter(k => selected[k]),
    [selected]
  );

  const toggle = (id: string) =>
    setSelected(s => ({ ...s, [id]: !s[id] }));

  const selectAll = () => {
    const map: Record<string, boolean> = {};
    rows.forEach(r => (map[r.id] = true));
    setSelected(map);
  };

  const clearSelection = () => setSelected({});

  const removeByIds = (ids: string[]) => {
    const next = registry.filter(r => !ids.includes(r.id));
    setRegistry(next);
    localStorage.setItem(REG_KEY, JSON.stringify(next));
    clearSelection();
  };

  const clearAll = () => {
    setRegistry([]);
    localStorage.removeItem(REG_KEY);
    clearSelection();
  };

  const resendToERP = async (ids: string[]) => {
    const payloads = registry
      .filter(r => ids.includes(r.id))
      .map(r => r.payload)
      .filter(Boolean);
    if (payloads.length === 0) return;

    setBusy(true);
    try {
      const resp = await fetch('/api/erpnext/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoices: payloads }),
      });
      const res = await resp.json();
      // opțional: marchează ca OK pe cele reușite
      // lăsăm notificările UI existente (toast) din backend
      console.log('ERP resend result', res);
    } catch (e) {
      console.error('Resend failed', e);
    } finally {
      setBusy(false);
    }
  };

  const downloadJSON = (ids: string[]) => {
    const data = registry.filter(r => ids.includes(r.id));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadFile(blob, 'processed_invoices.json', 'application/json');
  };

  const exportZip = async (ids: string[]) => {
    const zip = new JSZip();
    let count = 0;
    registry.forEach((r, i) => {
      if (!ids.includes(r.id)) return;
      const csv = incomingInvoicesToERPNextCSVComplete([r.payload]);
      const safe = (r.payload?.rechnungsnummer || `inv_${i+1}`).toString().replace(/[^a-zA-Z0-9_.-]/g,'_').slice(0,50);
      zip.file(`ERPNext_Invoice_${safe}.csv`, csv);
      count++;
    });
    if (!count) return;
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadFile(blob, 'processed_invoices.zip', 'application/zip');
  };

  const badge = (s: RegistryEntry['status']) => {
    const tone =
      s === 'OK' ? 'bg-emerald-600' :
      s === 'WARN' ? 'bg-amber-600' :
      s === 'DUPLICATE' ? 'bg-slate-500' :
      'bg-rose-600';
    return <Badge className={`text-white text-xs px-2 py-1 rounded ${tone}`}>{s}</Badge>;
  };

  return (
    <div className="container mx-auto px-4 py-8 md:px-8 md:py-12">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Processed Invoices Registry</span>
            <div className="flex gap-2">
              <Input placeholder="Search filename / supplier / invoice no."
                     value={query} onChange={e=>setQuery(e.target.value)}
                     className="w-80" />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-3 flex-wrap">
            <Button variant="secondary" onClick={selectAll}>Select All</Button>
            <Button variant="secondary" onClick={clearSelection}>Clear Selection</Button>
            <Button onClick={()=>resendToERP(allSelectedIds)} disabled={busy || allSelectedIds.length===0}>
              Resend to ERPNext
            </Button>
            <Button onClick={()=>downloadJSON(allSelectedIds)} variant="outline" disabled={allSelectedIds.length===0}>
              Download JSON
            </Button>
            <Button onClick={()=>exportZip(allSelectedIds)} variant="outline" disabled={allSelectedIds.length===0}>
              Export ZIP (CSV)
            </Button>
            <Button onClick={()=>removeByIds(allSelectedIds)} variant="destructive" disabled={allSelectedIds.length===0}>
              Delete Selected
            </Button>
            <Button onClick={clearAll} variant="destructive">Clear All</Button>
          </div>

          <div className="border rounded-md overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-2">Select</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Invoice No.</th>
                  <th className="text-left p-2">Supplier</th>
                  <th className="text-left p-2">Date</th>
                  <th className="text-left p-2">Total</th>
                  <th className="text-left p-2">Filename</th>
                  <th className="text-left p-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={!!selected[r.id]}
                        onChange={()=>toggle(r.id)}
                      />
                    </td>
                    <td className="p-2">{badge(r.status)}</td>
                    <td className="p-2">{r.payload?.rechnungsnummer || '-'}</td>
                    <td className="p-2">{r.payload?.lieferantName || '-'}</td>
                    <td className="p-2">{r.payload?.datum || '-'}</td>
                    <td className="p-2">{r.payload?.gesamtbetrag ?? '-'}</td>
                    <td className="p-2">{r.filename}</td>
                    <td className="p-2">{new Date(r.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td className="p-4 text-center text-muted-foreground" colSpan={8}>
                      No processed invoices yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ProcessedInvoices() {
    return (
        <ProtectedRoute>
            <ProcessedInvoicesPageContent />
        </ProtectedRoute>
    );
}