
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from '@/lib/firebase-admin';
import { AuthError } from './auth-error';

/**
 * Verifies a Firebase ID token and returns the user's UID.
 * This function now accepts the token directly as an argument.
 * @param idToken The Firebase ID token string.
 * @returns The UID of the authenticated user.
 * @throws {AuthError} if the token is invalid, expired, or missing.
 */
export async function getUidFromRequest(idToken: string): Promise<string> {
  if (!idToken) {
    throw new AuthError('Missing Firebase ID token.');
  }

  const app = getAdminApp();
  if (!app) {
    throw new AuthError('Firebase Admin not initialized');
  }

  try {
    const decoded = await getAuth(app).verifyIdToken(idToken, true);
    return decoded.uid;
  } catch (e: any) {
    console.error('[auth] verifyIdToken failed:', e?.code || e?.message || e);
    if (e.code === 'auth/id-token-expired') {
      throw new AuthError("ID token is expired. Please refresh and retry.");
    }
    if (e.code === 'auth/argument-error') {
      throw new AuthError("ID token is malformed or missing.");
    }
    throw new AuthError(`Token validation failed: ${e.code || e.message}`);
  }
}

    