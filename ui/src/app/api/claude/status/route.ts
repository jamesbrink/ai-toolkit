import { NextResponse } from 'next/server';
import { getAnthropicAuth } from '@/server/settings';

export async function GET() {
  const auth = await getAnthropicAuth();
  return NextResponse.json({ configured: !!(auth.apiKey || auth.oauthToken) });
}
