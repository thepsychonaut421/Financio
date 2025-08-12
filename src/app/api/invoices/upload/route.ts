// src/app/api/invoices/upload/route.ts
import { NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/lib/firebase';
import { v4 as uuidv4 } from 'uuid';
import * as admin from 'firebase-admin';
import { extractIncomingInvoiceData } from '@/ai/flows/extract-incoming-invoice-data';

// This forces Node.js runtime instead of Edge runtime, which is needed for Buffer operations
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Invalid file type. Only PDFs are allowed.' }, { status: 400 });
    }
    
    const fileBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(fileBuffer);
    
    // In a production system, a SHA256 hash of the file content would be a better ID
    const fileId = uuidv4();
    const year = new Date().getFullYear();
    const storagePath = `invoices/${year}/${fileId}.pdf`;

    // 1. Upload to Firebase Storage
    const bucket = adminStorage.bucket();
    const storageFile = bucket.file(storagePath);
    
    await storageFile.save(buffer, {
        metadata: {
            contentType: 'application/pdf',
        },
    });

    // 2. Create initial document in Firestore
    const docRef = adminDb.collection('invoices').doc(fileId);
    const initialDocData = {
      id: fileId,
      status: 'uploaded',
      originalFilename: file.name,
      files: {
          pdfPath: storagePath,
      },
      size: file.size,
      mimeType: file.type,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await docRef.set(initialDocData);

    // 3. Trigger AI Extraction immediately after upload
    const dataUri = `data:${file.type};base64,${buffer.toString('base64')}`;
    const extractionResult = await extractIncomingInvoiceData({ invoiceDataUri: dataUri });

    // 4. Update Firestore document with extracted data
    const updateData = {
      status: extractionResult.error ? 'error' : 'extracted',
      ai: {
        extracted: extractionResult,
        model: 'googleai/gemini-1.5-flash-latest', // Assuming this model, can be made dynamic
        error: extractionResult.error || null,
      },
      // Map top-level fields for easier querying
      extractedData: {
        rechnungsnummer: extractionResult.rechnungsnummer || null,
        datum: extractionResult.datum || null,
        lieferantName: extractionResult.lieferantName || null,
        gesamtbetrag: extractionResult.gesamtbetrag || null,
        wahrung: extractionResult.waehrung || null,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await docRef.update(updateData);

    return NextResponse.json({ 
        message: 'File uploaded and processed successfully.', 
        docId: fileId,
        path: storagePath,
        extractionStatus: updateData.status
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error during file upload and processing:', error);
    // If the error happens after doc creation, we could try to update its status to 'error'
    // For now, returning a generic server error is sufficient.
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
