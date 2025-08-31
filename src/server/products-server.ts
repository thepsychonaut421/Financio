
'use server';

import { getAdminDbSafe } from '@/lib/firebase-admin';
import type { ProductDoc } from '@/types/product';
import { FieldValue } from 'firebase-admin/firestore';


function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}


export async function upsertProducts(uid: string, items: ProductDoc[]) {
  const db = await getAdminDbSafe(); 
  if (!db) {
      console.error("Database connection not available. Skipping upsert.");
      throw new Error('Database connection is not available for product upsert.');
  }

  const chunks = chunk(items, 450); // Firestore batch limit is 500 operations

  for (const part of chunks) {
      const batch = db.batch();
      for (const p of part) {
        const normCode = (p.productCode || '').toString().trim().toUpperCase();
        if (!normCode) continue; // Skip items without a valid product code

        // Generate a consistent document ID based on user and normalized product code
        const id = `${uid}__${normCode}`;
        const docRef = db.collection('products').doc(id);
        
        // Ensure all required fields are present and add server timestamp
        const dataToSet = { 
            ...p,
            productCode: normCode, 
            userId: uid, 
            updatedAt: FieldValue.serverTimestamp(),
            createdAt: p.createdAt || FieldValue.serverTimestamp(),
        };

        batch.set(docRef, dataToSet, { merge: true });
      }
      await batch.commit();
  }
}
