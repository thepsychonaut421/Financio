// src/lib/firebase-admin.ts
export async function getAdminDbSafe() {
  try {
    const { getApps, initializeApp, applicationDefault, cert } =
      await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');

    if (!getApps().length) {
      const pid = process.env.FB_PROJECT_ID;
      const email = process.env.FB_CLIENT_EMAIL;
      const pkRaw = process.env.FB_PRIVATE_KEY;

      if (pid && email && pkRaw) {
        // .env sau secret cu \n escapate
        const privateKey = pkRaw.replace(/\\n/g, '\n');
        initializeApp({ credential: cert({ projectId: pid, clientEmail: email, privateKey }) });
      } else {
        // pe App Hosting/Cloud: folosește ADC
        initializeApp({ credential: applicationDefault() });
      }
    }

    return getFirestore();
  } catch (e) {
    console.error('[admin] init failed, translations disabled:', e);
    return null; // NICIODATĂ nu arunca spre route – evită 500
  }
}
