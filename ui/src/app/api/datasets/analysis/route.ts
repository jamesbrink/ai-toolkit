import { NextRequest, NextResponse } from 'next/server';
import { getStoredAnalysis } from '@/server/datasetAnalysis';

export async function POST(req: NextRequest) {
  try {
    const { datasetName } = await req.json();

    if (!datasetName || typeof datasetName !== 'string') {
      return NextResponse.json({ error: 'datasetName is required' }, { status: 400 });
    }

    const analysis = await getStoredAnalysis(datasetName);

    if (!analysis) {
      return NextResponse.json({ error: 'No analysis found for this dataset' }, { status: 404 });
    }

    return NextResponse.json(analysis);
  } catch (error) {
    console.error('Error fetching stored analysis:', error);
    return NextResponse.json({ error: 'Failed to fetch analysis' }, { status: 500 });
  }
}
