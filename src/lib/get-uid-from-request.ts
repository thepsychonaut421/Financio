
import { getAdminApp } from '@/lib/firebase-admin';
import { AuthError } from '@/lib/auth-error';

export async function getUidFromRequest(req: Request): Promise<string> {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i,'').trim();
  const legacy = req.headers.get('x-fb-idtoken')?.trim();
  const idToken = bearer || legacy;
  if (!idToken) throw new AuthError('Missing Firebase ID token');

  try {
    const adminApp = getAdminApp(); // This will throw a specific AuthError on init failure
    const { getAuth } = await import('firebase-admin/auth');
    const decoded = await getAuth(adminApp).verifyIdToken(idToken, true); // true checks for revocation
    return decoded.uid;
  } catch (e: any) {
    if (e instanceof AuthError) {
        throw e; // Re-throw our specific initialization error
    }

    const msg = e?.code || e?.message || '';
    if (
      msg.includes('auth/id-token-expired') ||
      msg.includes('auth/id-token-revoked') ||
      msg.includes('auth/argument-error') ||
      msg.includes('auth/invalid-id-token')
    ) {
      throw new AuthError('ID token is invalid, expired, or revoked.');
    }
    
    console.error("Unexpected error during token verification:", e);
    throw new AuthError('An unexpected error occurred during authentication.');
  }
}
