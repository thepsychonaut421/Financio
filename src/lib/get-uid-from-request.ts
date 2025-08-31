
import { auth } from 'firebase-admin';
import { getAdminDbSafe } from '@/lib/firebase-admin';

export class AuthError extends Error {
  status = 401;
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

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
  } catch(e: any) {
    const msg = e?.code || e?.message || '';
    if (msg.includes('auth/id-token-expired') || msg.includes('auth/id-token-revoked') || msg.includes('argument-error')) {
      throw new AuthError('ID token is invalid, expired, or revoked.');
    }
    // For other errors, you might want to log them differently
    console.error("Unexpected error during token verification:", e);
    throw new Error('An unexpected error occurred during authentication.');
  }
}
