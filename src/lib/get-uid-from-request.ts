
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
    const { uid } = await auth().verifyIdToken(idToken);
    return uid;
  } catch(e: any) {
    console.error("Token verification failed:", e.message);
    throw new AuthError('Invalid or expired Firebase ID token');
  }
}
