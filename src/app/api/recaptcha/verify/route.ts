import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const { token } = await request.json();

        if (!token) {
            return NextResponse.json({ success: false, message: 'Token reCAPTCHA lipsește.' }, { status: 400 });
        }

        const secretKey = process.env.RECAPTCHA_SECRET_KEY;
        if (!secretKey) {
            console.error('[reCAPTCHA] Cheia secretă nu este setată în variabilele de mediu.');
            return NextResponse.json({ success: false, message: 'Configurare incorectă pe server.' }, { status: 500 });
        }

        const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `secret=${secretKey}&response=${token}`,
        });

        const data = await response.json();

        if (data.success) {
            return NextResponse.json({ success: true, message: 'Verificare reCAPTCHA reușită.' });
        } else {
            return NextResponse.json({ success: false, message: 'Verificarea reCAPTCHA a eșuat.', 'error-codes': data['error-codes'] }, { status: 400 });
        }

    } catch (e: any) {
        console.error('[API reCAPTCHA Error]', e);
        return NextResponse.json({ success: false, message: e.message || 'Eroare de server neașteptată.' }, { status: 500 });
    }
}
