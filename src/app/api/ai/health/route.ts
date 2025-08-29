
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_NAME = process.env.GENAI_MODEL || 'gemini-1.5-flash';

export async function GET() {
  try {
    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_GENAI_API_KEY is not set.");
    }
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });
    
    const result = await model.generateContent("Say OK");
    const response = result.response;
    const text = response.text();

    if (text.trim().toLowerCase().includes('ok')) {
      return NextResponse.json({ ok: true, model: MODEL_NAME, provider: 'Google AI' });
    } else {
      throw new Error(`Unexpected response from model: ${text}`);
    }

  } catch (e: any) {
    console.error("[AI Health Check Error]", e);
    return NextResponse.json({ 
        ok: false, 
        error: e.message || 'An unknown error occurred.',
        model: MODEL_NAME, 
        provider: 'Google AI' 
    }, { status: 500 });
  }
}
