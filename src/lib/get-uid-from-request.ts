
import { auth } from 'firebase-admin';
import { getAdminDbSafe } from '@/lib/firebase-admin';
import { AuthError } from '@/lib/auth-error';

export async function getUidFromRequest(req: Request): Promise<string> {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i,'').trim();
  const legacy = req.headers.get('x-fb-idtoken')?.trim();
  const idToken = bearer || legacy;
  if (!idToken) throw new AuthError('Missing Firebase ID token');

  await getAdminDbSafe(); // ensures admin init
  try {
    const { getAuth } = await import('firebase-admin/auth');
    const decoded = await getAuth().verifyIdToken(idToken, true); // true checks for revocation
    return decoded.uid;
  } catch (e: any) {
    const msg = e?.code || e?.message || '';
    // Check for specific Firebase Auth error codes
    if (
      msg.includes('auth/id-token-expired') ||
      msg.includes('auth/id-token-revoked') ||
      msg.includes('auth/argument-error') || // Catches malformed tokens
      msg.includes('auth/invalid-id-token')
    ) {
      throw new AuthError('ID token is invalid, expired, or revoked.');
    }
    // For other unexpected errors, log them but still throw a generic auth error
    console.error("Unexpected error during token verification:", e);
    throw new AuthError('An unexpected error occurred during authentication.');
  }
}
