
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from '@/lib/firebase-admin';
import { AuthError } from './auth-error';


export async function getUidFromRequest(req: Request): Promise<string> {
  const idToken = req.headers.get('authorization')?.replace(/^Bearer\s+/i,'').trim();
  if (!idToken) throw new AuthError('Missing Firebase ID token');

  const app = getAdminApp();
  if (!app) throw new AuthError('Firebase Admin not initialized');

  try {
    // Diagnostic log
    const backendProject = process.env.GOOGLE_CLOUD_PROJECT || process.env.FB_PROJECT_ID;
    console.log('[auth] backendProject=', backendProject, 'tokenPrefix=', idToken.slice(0, 12));

    const decoded = await getAuth(app).verifyIdToken(idToken, true);
    
    // Optional: Log issuer and audience for deep debugging
    const decodedPayload = decoded as any;
    console.log('[auth] decoded.project_id=', decoded.firebase?.project_id, 'aud=', decodedPayload.aud, 'iss=', decodedPayload.iss);

    return decoded.uid;
  } catch (e: any) {
    console.error('[auth] verifyIdToken failed:', e?.code || e?.message || e);
    // Throw a more specific error based on the Firebase error code
    throw new AuthError(
      e?.code === 'auth/id-token-expired' ? 'ID token expired' :
      e?.code === 'auth/invalid-id-token' ? 'ID token invalid' :
      e?.code === 'auth/id-token-revoked' ? 'ID token revoked' :
      'ID token is invalid, expired, or revoked.'
    );
  }
}
