
'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PackageX } from 'lucide-react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';

function ProductCatalogFeatureRemoved() {
  return (
    <div className="container mx-auto px-4 py-8 md:px-8 md:py-12">
        <Alert variant="destructive">
            <PackageX className="h-4 w-4" />
            <AlertTitle>Feature Removed</AlertTitle>
            <AlertDescription>
                The Product Catalog feature has been removed due to persistent errors.
            </AlertDescription>
        </Alert>
    </div>
  );
}


export default function ProductCatalogPage() {
  return (
    <ProtectedRoute>
      <ProductCatalogFeatureRemoved />
    </ProtectedRoute>
  );
}
