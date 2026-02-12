import { NextRequest, NextResponse } from 'next/server';
import { executeServerTool, SERVER_TOOL_NAMES } from '@/server/claude/serverTools';

/**
 * POST /api/claude/tools/execute
 *
 * Accepts { toolName, input } and executes the named server tool locally.
 * This endpoint allows remote AI Toolkit instances to delegate tool execution
 * to this instance (the hub proxies tool calls here when hostId is set).
 */
export async function POST(req: NextRequest) {
  const { toolName, input } = await req.json();

  if (!toolName || typeof toolName !== 'string') {
    return NextResponse.json({ error: 'toolName is required' }, { status: 400 });
  }

  if (!SERVER_TOOL_NAMES.has(toolName)) {
    return NextResponse.json({ error: `Unknown tool: ${toolName}` }, { status: 400 });
  }

  try {
    const result = await executeServerTool(toolName, input || {});
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
