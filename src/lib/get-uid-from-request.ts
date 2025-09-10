
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from '@/lib/firebase-admin';
import { AuthError } from '@/lib/auth-error';


export async function getUidFromRequest(req: Request): Promise<string> {
  const authHeader = req.headers.get('authorization')?.replace(/^Bearer\s+/i,'').trim();
  const xFirebaseToken = req.headers.get('x-firebase-token')?.trim();
  const xIdToken = req.headers.get('x-id-token')?.trim();

  const idToken = authHeader || xFirebaseToken || xIdToken;

  if (!idToken) throw new AuthError('Missing Firebase ID token from any of the expected headers.');

  const app = getAdminApp();
  if (!app) throw new AuthError('Firebase Admin not initialized');

  try {
    const decoded = await getAuth(app).verifyIdToken(idToken, true);
    return decoded.uid;
  } catch (e: any) {
    console.error('[auth] verifyIdToken failed:', e?.code || e?.message || e);
    // Throw a more specific error based on the Firebase error code
    if (e.code === 'auth/id-token-expired') {
      throw new AuthError("ID token is expired. Please refresh and retry.");
    }
    if (e.code === 'auth/argument-error') {
      throw new AuthError("ID token is malformed or missing.");
    }
    throw new AuthError(`Token validation failed: ${e.code || e.message}`);
  }
}
