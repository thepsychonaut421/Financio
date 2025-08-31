
'use client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { getErpSettings, saveErpSettings } from '@/lib/erp-settings';
import type { ErpPaymentPrefs } from '@/types/erp-settings';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Loader2 } from 'lucide-react';

function ErpnextSettingsPageContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<ErpPaymentPrefs>({
    company: '',
    defaultModeOfPayment: 'Bank Transfer',
    defaultBankGLAccount: '',
    defaultBankAccountName: '',
    defaultCurrency: 'EUR'
  });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    getErpSettings(user.uid).then(v => {
        if (v) {
            setForm(prev => ({...prev, ...v}));
        }
    }).finally(() => setLoading(false));
  }, [user]);

  const save = async () => {
    if (!user) return;
    setBusy(true);
    try {
        await saveErpSettings(user.uid, form);
        toast({ title: "Settings Saved", description: "Your ERPNext payment defaults have been updated."});
    } catch (e: any) {
        toast({ title: "Error", description: `Failed to save settings: ${e.message}`, variant: "destructive"});
    } finally {
        setBusy(false);
    }
  };
  
  if (loading) {
      return <div className="flex justify-center items-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
        <Card>
            <CardHeader>
                <CardTitle className="text-2xl font-bold">ERPNext – Payment Defaults</CardTitle>
                <CardDescription>Configure default values for creating payments in ERPNext. These settings are stored per user.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <Label htmlFor="company">Company</Label>
                    <Input id="company" value={form.company} onChange={e=>setForm({...form, company:e.target.value})}/>
                </div>
                <div>
                    <Label htmlFor="mode-of-payment">Default Mode of Payment</Label>
                    <Input id="mode-of-payment" value={form.defaultModeOfPayment} onChange={e=>setForm({...form, defaultModeOfPayment:e.target.value})}/>
                </div>
                <div>
                    <Label htmlFor="bank-gl-account">Default Bank GL Account</Label>
                    <Input id="bank-gl-account" placeholder="e.g. 1000 - Bank - BRUG" value={form.defaultBankGLAccount} onChange={e=>setForm({...form, defaultBankGLAccount:e.target.value})}/>
                </div>
                <div>
                    <Label htmlFor="bank-account-name">Bank Account Name (optional)</Label>
                    <Input id="bank-account-name" value={form.defaultBankAccountName||''} onChange={e=>setForm({...form, defaultBankAccountName:e.target.value})}/>
                </div>
                <div>
                    <Label htmlFor="currency">Default Currency</Label>
                    <Input id="currency" value={form.defaultCurrency||'EUR'} onChange={e=>setForm({...form, defaultCurrency:e.target.value})}/>
                </div>
            </CardContent>
            <CardFooter>
                 <Button onClick={save} disabled={busy}>
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                    Save Settings
                </Button>
            </CardFooter>
        </Card>
    </div>
  );
}

export default function ErpnextSettingsPage() {
    return (
        <ProtectedRoute>
            <ErpnextSettingsPageContent />
        </ProtectedRoute>
    );
}

