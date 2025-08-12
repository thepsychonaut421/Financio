// src/app/api/invoices/upload/route.ts
import { NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/lib/firebase';
import { v4 as uuidv4 } from 'uuid';
import { Writable } from 'stream';

// This forces Node.js runtime instead of Edge runtime
export const runtime = 'nodejs';

// Helper to buffer a stream
const streamToBuffer = (stream: ReadableStream<Uint8Array>): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];

    const pump = () => {
      reader.read().then(({ done, value }) => {
        if (done) {
          resolve(Buffer.concat(chunks));
          return;
        }
        if (value) {
          chunks.push(value);
        }
        pump();
      }).catch(reject);
    };
    pump();
  });
};

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
    
    // For now, we use UUID. In a full implementation, we'd use SHA256.
    const fileId = uuidv4();
    const year = new Date().getFullYear();
    const storagePath = `invoices/${year}/${fileId}.pdf`;

    // Upload to Firebase Storage
    const bucket = adminStorage.bucket();
    const storageFile = bucket.file(storagePath);
    
    await storageFile.save(buffer, {
        metadata: {
            contentType: 'application/pdf',
        },
    });

    // Create document in Firestore
    const docRef = adminDb.collection('invoices').doc(fileId);
    await docRef.set({
      id: fileId, // Storing the ID in the doc as well
      status: 'uploaded',
      originalFilename: file.name,
      files: {
          pdfPath: storagePath,
      },
      size: file.size,
      mimeType: file.type,
      // In a real app, you would get the authenticated user's ID
      // uploaderId: 'some-user-id', 
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ 
        message: 'File uploaded successfully', 
        docId: fileId,
        path: storagePath 
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error during file upload:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
