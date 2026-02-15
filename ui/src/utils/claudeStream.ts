import { StreamEvent } from '@/types/claude';

export async function streamClaude(
  messages: { role: string; content: string | unknown[] }[],
  context?: unknown,
  tools?: unknown[],
  onEvent: (event: StreamEvent) => void = () => {},
  onDone: () => void = () => {},
  onError: (error: string) => void = () => {},
  signal?: AbortSignal,
): Promise<void> {
  const token = localStorage.getItem('AI_TOOLKIT_AUTH');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  console.log('[claude-stream] Fetching /api/claude/chat');
  let res: Response;
  try {
    res = await fetch('/api/claude/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages, context, tools }),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.log('[claude-stream] Fetch aborted');
      onDone();
      return;
    }
    console.error('[claude-stream] Fetch error:', err);
    throw err;
  }

  console.log(`[claude-stream] Response status: ${res.status}`);

  if (!res.ok) {
    const text = await res.text();
    console.error(`[claude-stream] HTTP error ${res.status}: ${text.slice(0, 200)}`);
    onError(text || `HTTP ${res.status}`);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    console.error('[claude-stream] No response body');
    onError('No response body');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let eventCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed) as StreamEvent;
          eventCount++;
          console.log(`[claude-stream] Event #${eventCount}: type=${event.type}`);
          onEvent(event);
        } catch {
          console.warn(`[claude-stream] Malformed line: ${trimmed.slice(0, 100)}`);
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer.trim()) as StreamEvent;
        eventCount++;
        console.log(`[claude-stream] Event #${eventCount} (final): type=${event.type}`);
        onEvent(event);
      } catch {
        console.warn(`[claude-stream] Malformed final buffer: ${buffer.trim().slice(0, 100)}`);
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.log(`[claude-stream] Stream aborted after ${eventCount} events`);
      onDone();
      return;
    }
    console.error('[claude-stream] Stream read error:', err);
    throw err;
  }

  console.log(`[claude-stream] Stream complete: ${eventCount} events received`);
  onDone();
}
