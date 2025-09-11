
'use client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { getStockSettings, saveStockSettings } from '@/lib/stock-settings';
import type { StockSettings } from '@/types/stock-settings';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Loader2 } from 'lucide-react';

function StockSettingsPageContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<StockSettings>({ defaultWarehouse: '', shippingKeywords: [], company: '' });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      setLoading(true);
      getStockSettings(user.uid)
        .then(settings => {
            // Ensure all form fields are controlled from the start
            setForm({
                company: settings?.company || '',
                defaultWarehouse: settings?.defaultWarehouse || '',
                shippingKeywords: settings?.shippingKeywords || [],
            });
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [user]);

  const save = async () => {
    if (!user) return;
    setBusy(true);
    try {
        await saveStockSettings(user.uid, form);
        toast({ title: "Settings Saved", description: "Your stock settings have been updated."});
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
              <CardTitle className="text-2xl font-bold">Stock Settings</CardTitle>
              <CardDescription>Configure your default warehouse and keywords to exclude shipping fees from stock calculations.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
              <div>
                  <Label htmlFor="company" className="font-medium">Company (ERPNext)</Label>
                  <Input 
                    id="company"
                    value={form.company} 
                    onChange={e=>setForm({...form, company:e.target.value})} 
                    placeholder="e.g., Your Company Name GmbH" 
                  />
              </div>
              <div>
                  <Label htmlFor="default-warehouse" className="font-medium">Default Warehouse (ERPNext)</Label>
                  <Input 
                    id="default-warehouse"
                    value={form.defaultWarehouse} 
                    onChange={e=>setForm({...form, defaultWarehouse:e.target.value})} 
                    placeholder="e.g., Main Warehouse - MyCo" 
                  />
              </div>

              <div>
                  <Label htmlFor="shipping-keywords" className="font-medium">Shipping Keywords (one per line or comma-separated)</Label>
                  <Textarea
                    id="shipping-keywords"
                    value={form.shippingKeywords.join('\n')}
                    onChange={e=>setForm({...form, shippingKeywords: e.target.value.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean)})}
                    className="min-h-[150px]"
                    placeholder="versand&#10;porto&#10;shipping fee&#10;..."
                  />
                  <p className="text-xs text-muted-foreground mt-1">These keywords (case-insensitive) will be used to filter out shipping line items from stock aggregation.</p>
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

export default function StockSettingsPage() {
    return (
        <ProtectedRoute>
            <StockSettingsPageContent />
        </ProtectedRoute>
    )
}

