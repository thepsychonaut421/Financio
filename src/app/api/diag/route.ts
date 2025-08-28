
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return new Response(JSON.stringify({
    ok: true,
    ts: new Date().toISOString(),
    // Check for the presence of secrets without exposing them
    hasErpBase: !!process.env.ERPNEXT_BASE_URL,
    hasErpKey: !!process.env.ERPNEXT_API_KEY,
    hasErpSecret: !!process.env.ERPNEXT_API_SECRET,
  }), { headers: { 'Content-Type': 'application/json' }});
}
