'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Info, Loader2, RefreshCw, AlertTriangle, Check, Trash2 } from 'lucide-react';

const fetcher = (url:string) => fetch(url).then(r=>r.json());

interface DocInfo {
    id: string;
    status: string;
    createdAt: { seconds: number };
    filename: string;
}

interface DuplicateGroup {
    fingerprint: string;
    count: number;
    supplier: string;
    invoiceNo: string;
    invoiceDate: string;
    total: number;
    docs: DocInfo[];
}

export function DeduplicateView() {
  const { data, mutate, isLoading, error } = useSWR('/api/dedupe/groups', fetcher);
  const [isScanning, setIsScanning] = useState(false);
  const [isResolving, setIsResolving] = useState<Record<string, boolean>>({});
  const [selection, setSelection] = useState<Record<string, { keep: string }>>({});
  const { toast } = useToast();

  const handleScan = async () => {
    setIsScanning(true);
    try {
        const res = await fetch('/api/dedupe/scan', { method: 'POST' });
        if (!res.ok) throw new Error('Scan failed');
        await mutate();
        toast({ title: "Scan Complete", description: "Fingerprints have been updated for all processed invoices." });
    } catch (e) {
        toast({ title: "Scan Error", description: "Could not complete the scan.", variant: "destructive" });
    } finally {
        setIsScanning(false);
    }
  }

  const handleResolve = async (group: DuplicateGroup) => {
    const { fingerprint, docs } = group;
    const selectedToKeep = selection[fingerprint]?.keep;

    if (!selectedToKeep) {
        toast({ title: "No Selection", description: "Please select one invoice to keep.", variant: "destructive"});
        return;
    }

    setIsResolving(prev => ({ ...prev, [fingerprint]: true }));
    try {
        const deleteIds = docs.filter(d => d.id !== selectedToKeep).map(d => d.id);
        const res = await fetch('/api/dedupe/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keepId: selectedToKeep, deleteIds }),
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Failed to resolve group.');
        }

        toast({ title: "Group Resolved", description: `${deleteIds.length} duplicate(s) removed.` });
        await mutate();

    } catch (e: any) {
        toast({ title: "Resolution Failed", description: e.message, variant: "destructive"});
    } finally {
        setIsResolving(prev => ({ ...prev, [fingerprint]: false }));
    }
  }
  
  const handleMarkAllOk = async (group: DuplicateGroup) => {
    const { fingerprint, docs } = group;
    setIsResolving(prev => ({ ...prev, [fingerprint]: true }));
     try {
        const markOkIds = docs.map(d => d.id);
        const res = await fetch('/api/dedupe/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ markOkIds }),
        });
        if (!res.ok) throw new Error('Failed to mark as OK.');
        toast({ title: "Marked as OK", description: `All ${docs.length} invoices in this group are marked as not duplicates.` });
        await mutate();
    } catch (e: any) {
        toast({ title: "Action Failed", description: e.message, variant: "destructive"});
    } finally {
        setIsResolving(prev => ({ ...prev, [fingerprint]: false }));
    }
  }

  if (isLoading) return <div className="p-4 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (error) return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>Could not load duplicate groups.</AlertDescription></Alert>;

  const groups: DuplicateGroup[] = data?.groups || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Duplicate Detection</CardTitle>
          <CardDescription>Scan for potential duplicates based on supplier, invoice number, date, and total amount. Review groups and decide which version to keep.</CardDescription>
        </CardHeader>
        <CardContent>
            <Button onClick={handleScan} disabled={isScanning}>
              {isScanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {isScanning ? 'Scanning...' : 'Scan All Invoices for Duplicates'}
            </Button>
        </CardContent>
      </Card>
      
      {groups.length === 0 ? (
        <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>No Duplicates Found</AlertTitle>
            <AlertDescription>The scan did not find any potential duplicates based on the current data.</AlertDescription>
        </Alert>
      ) : (
        groups.map(group => (
            <Card key={group.fingerprint} className="shadow-md">
                <CardHeader>
                    <CardTitle className="text-lg">
                        {group.supplier || 'Unknown Supplier'} - #{group.invoiceNo || 'N/A'}
                    </CardTitle>
                    <CardDescription>
                        Found {group.count} potential duplicates for an invoice dated {group.invoiceDate?.slice(0,10)} with a total of {group.total?.toFixed(2)}.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <RadioGroup 
                        onValueChange={(value) => setSelection(s => ({...s, [group.fingerprint]: { keep: value }}))}
                        defaultValue={selection[group.fingerprint]?.keep}
                    >
                        <div className="space-y-2">
                        {group.docs.map(doc => (
                            <div key={doc.id} className="flex items-center space-x-3 rounded-md border p-3">
                                <RadioGroupItem value={doc.id} id={`${group.fingerprint}-${doc.id}`} />
                                <Label htmlFor={`${group.fingerprint}-${doc.id}`} className="flex-grow cursor-pointer">
                                    <div className="flex justify-between items-center">
                                        <span className="font-mono text-xs">{doc.id}</span>
                                        <span className="text-xs text-muted-foreground">{new Date(doc.createdAt.seconds * 1000).toLocaleString()}</span>
                                    </div>
                                    <p className="text-sm text-muted-foreground">{doc.filename}</p>
                                </Label>
                            </div>
                        ))}
                        </div>
                    </RadioGroup>
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => handleMarkAllOk(group)} disabled={isResolving[group.fingerprint]}>
                        <Check className="mr-2 h-4 w-4" /> Not Duplicates
                    </Button>
                    <Button variant="destructive" onClick={() => handleResolve(group)} disabled={isResolving[group.fingerprint] || !selection[group.fingerprint]?.keep}>
                        {isResolving[group.fingerprint] ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                        Keep Selected, Delete Others
                    </Button>
                </CardFooter>
            </Card>
        ))
      )}
    </div>
  );
}
