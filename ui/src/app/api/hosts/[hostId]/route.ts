import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(_request: NextRequest, { params }: { params: Promise<{ hostId: string }> }) {
  try {
    const { hostId } = await params;
    const host = await prisma.host.findUnique({ where: { id: hostId } });

    if (!host) {
      return NextResponse.json({ error: 'Host not found' }, { status: 404 });
    }

    return NextResponse.json(host);
  } catch (error) {
    console.error('Error fetching host:', error);
    return NextResponse.json({ error: 'Failed to fetch host' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ hostId: string }> }) {
  try {
    const { hostId } = await params;
    const body = await request.json();

    // Only allow updating specific fields
    const allowedFields: Record<string, unknown> = {};
    if ('name' in body) allowedFields.name = body.name;
    if ('authToken' in body) allowedFields.authToken = body.authToken;
    if ('isHidden' in body) allowedFields.isHidden = body.isHidden;

    if (Object.keys(allowedFields).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const host = await prisma.host.update({
      where: { id: hostId },
      data: allowedFields,
    });

    return NextResponse.json(host);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'Host not found' }, { status: 404 });
    }
    console.error('Error updating host:', error);
    return NextResponse.json({ error: 'Failed to update host' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ hostId: string }> }) {
  try {
    const { hostId } = await params;

    await prisma.host.delete({ where: { id: hostId } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'Host not found' }, { status: 404 });
    }
    console.error('Error deleting host:', error);
    return NextResponse.json({ error: 'Failed to delete host' }, { status: 500 });
  }
}
