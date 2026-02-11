import { NextRequest, NextResponse } from 'next/server';
import { deleteAnalyzedImages } from '@/server/datasetAnalysis';

export async function POST(req: NextRequest) {
  try {
    const { imagePaths } = await req.json();

    if (!imagePaths || !Array.isArray(imagePaths) || imagePaths.length === 0) {
      return NextResponse.json({ error: 'imagePaths array is required' }, { status: 400 });
    }

    const result = await deleteAnalyzedImages(imagePaths);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error deleting analyzed images:', error);
    return NextResponse.json({ error: 'Failed to delete images' }, { status: 500 });
  }
}
