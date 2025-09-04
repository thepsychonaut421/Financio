

'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { IncomingInvoicesPageContent } from '@/components/incoming-invoices/IncomingInvoicesPageContent';


export default function PurchasesPage() {
  return (
    <ProtectedRoute>
      <IncomingInvoicesPageContent kind="purchase" />
    </ProtectedRoute>
  );
}
