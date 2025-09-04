
'use client';

import React from 'react';
import { IncomingInvoicesPageContent } from '@/components/incoming-invoices/IncomingInvoicesPageContent';

export default function SalesPageContent() {
    // This will render the UI, but processing logic for 'sales' is not fully implemented yet.
    // The hook and component structure is now in place for easy extension.
    return <IncomingInvoicesPageContent kind="sales" />;
}
