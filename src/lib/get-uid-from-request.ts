
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from '@/lib/firebase-admin';
import { AuthError } from './auth-error';

/**
 * Verifies a Firebase ID token from request headers and returns the user's UID.
 * This function now accepts the Request object directly.
 * It checks 'Authorization' (Bearer) and 'x-firebase-token' headers.
 * @param req The incoming Request object.
 * @returns The UID of the authenticated user.
 * @throws {AuthError} if the token is invalid, expired, or missing.
 */
export async function getUidFromRequest(req: Request): Promise<string> {
    const authHeader = req.headers.get('authorization') || req.headers.get('x-firebase-token') || req.headers.get('x-id-token');

    if (!authHeader) {
        throw new AuthError('Missing Firebase ID token in request headers.');
    }

    // Strip "Bearer " prefix if it exists
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;

    if (!idToken) {
        throw new AuthError('ID token is empty after processing header.');
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
