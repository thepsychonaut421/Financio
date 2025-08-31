
'use client';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import type { ProductDoc } from '@/types/product';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHeader, TableHead, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Package } from 'lucide-react';
import Image from 'next/image';

export function ProductList() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [rows, setRows] = useState<ProductDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(()=> {
    if (isAuthLoading) return;
    if (!user) {
        setRows([]);
        setIsLoading(false);
        return;
    };
    
    setIsLoading(true);
    const q = query(
        collection(db,'products'), 
        where('userId','==',user.uid), 
        orderBy('updatedAt','desc')
    );
    
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        setRows(snapshot.docs.map(d=>d.data() as ProductDoc));
        setIsLoading(false);
      },
      (error) => {
        console.error("Error fetching product catalog:", error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();

  }, [user, isAuthLoading]);

  if (!user && !isAuthLoading) return null;

  return (
    <Card className="mt-8 shadow-lg">
        <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2">
                <Package className="w-6 h-6 text-primary" />
                Persistierter Produktkatalog
            </CardTitle>
            <CardDescription>
                Dies sind die Produkte, die derzeit in Ihrer Datenbank gespeichert sind.
            </CardDescription>
        </CardHeader>
        <CardContent>
            {isLoading ? (
                 <div className="space-y-4">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                </div>
            ) : rows.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">Ihr Katalog ist noch leer. Speichern Sie einige Produkte, um sie hier zu sehen.</p>
            ) : (
                <div className="rounded-md border overflow-x-auto">
                    <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[80px]">Bild</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead>Titel</TableHead>
                            <TableHead>ME</TableHead>
                            <TableHead>Zuletzt aktualisiert</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map(r=>(
                        <TableRow key={r.productCode} className="hover:bg-accent/10">
                            <TableCell>
                                <Image 
                                    src={r.imageUrl || 'https://placehold.co/60x60.png'} 
                                    alt={r.titleSEO} 
                                    width={40} 
                                    height={40}
                                    className="rounded-md object-cover border"
                                    data-ai-hint="product photo"
                                />
                            </TableCell>
                            <TableCell className="font-mono text-xs">{r.productCode}</TableCell>
                            <TableCell className="font-medium">{r.titleSEO || r.titleRaw}</TableCell>
                            <TableCell>{r.uom}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{(r as any).updatedAt?.toDate?.().toLocaleString() || '-'}</TableCell>
                        </TableRow>
                        ))}
                    </TableBody>
                    </Table>
                </div>
            )}
        </CardContent>
    </Card>
  );
}
