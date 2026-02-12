import { NextResponse } from 'next/server';
import { getAccountInfo } from '@/server/runpod';

export async function GET() {
  try {
    const account = await getAccountInfo();
    return NextResponse.json({ account });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch account info';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
