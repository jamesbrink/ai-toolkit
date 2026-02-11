import { NextRequest, NextResponse } from 'next/server';
import { dismissDuplicateGroup } from '@/server/datasetAnalysis';

export async function POST(req: NextRequest) {
  try {
    const { groupId } = await req.json();

    if (groupId === undefined || typeof groupId !== 'number') {
      return NextResponse.json({ error: 'groupId (number) is required' }, { status: 400 });
    }

    await dismissDuplicateGroup(groupId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error dismissing duplicate group:', error);
    return NextResponse.json({ error: 'Failed to dismiss duplicate group' }, { status: 500 });
  }
}
