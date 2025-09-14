
import { NextResponse } from 'next/server';
import { RecaptchaEnterpriseServiceClient } from '@google-cloud/recaptcha-enterprise';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT;
const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY; 

// A threshold score for considering the action legitimate.
// For login/signup, a score of 0.7 or higher is often a good starting point.
const RISK_SCORE_THRESHOLD = 0.7;

export async function POST(request: Request) {
    try {
        const { token, recaptchaAction } = await request.json();

        if (!token) {
            return NextResponse.json({ success: false, message: 'reCAPTCHA token is missing.' }, { status: 400 });
        }
        if (!recaptchaAction) {
            return NextResponse.json({ success: false, message: 'reCAPTCHA action is missing.' }, { status: 400 });
        }
        
        if (!PROJECT_ID || !RECAPTCHA_SITE_KEY) {
            console.error('[reCAPTCHA] Server configuration error: GOOGLE_CLOUD_PROJECT or NEXT_PUBLIC_RECAPTCHA_SITE_KEY is not set.');
            return NextResponse.json({ success: false, message: 'Server configuration error.' }, { status: 500 });
        }

        const client = new RecaptchaEnterpriseServiceClient();
        const projectPath = client.projectPath(PROJECT_ID);

        const assessmentRequest = {
            assessment: {
                event: {
                    token: token,
                    siteKey: RECAPTCHA_SITE_KEY,
                    // recaptchaAction is verified below, not sent in the event
                },
            },
            parent: projectPath,
        };

        const [response] = await client.createAssessment(assessmentRequest);

        if (!response.tokenProperties?.valid) {
            console.log(`The CreateAssessment call failed because the token was: ${response.tokenProperties?.invalidReason}`);
            return NextResponse.json({ success: false, message: 'reCAPTCHA token is invalid.' }, { status: 400 });
        }

        if (response.tokenProperties.action !== recaptchaAction) {
            console.log(`reCAPTCHA action mismatch. Expected: "${recaptchaAction}", Got: "${response.tokenProperties.action}"`);
            return NextResponse.json({ success: false, message: 'reCAPTCHA action mismatch.' }, { status: 400 });
        }
        
        const score = response.riskAnalysis?.score ?? 0;
        console.log(`The reCAPTCHA score for action "${recaptchaAction}" is: ${score}`);

        if (score < RISK_SCORE_THRESHOLD) {
             console.log(`reCAPTCHA score ${score} is below the threshold of ${RISK_SCORE_THRESHOLD}.`);
             return NextResponse.json({ success: false, message: 'Verification failed due to low score.'}, { status: 400 });
        }

        return NextResponse.json({ success: true, message: 'reCAPTCHA verification successful.', score: score });

    } catch (e: any) {
        console.error('[API reCAPTCHA Error]', e);
        return NextResponse.json({ success: false, message: e.message || 'An unexpected server error occurred.' }, { status: 500 });
    }
}
