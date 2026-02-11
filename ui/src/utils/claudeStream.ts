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
      onDone();
      return;
    }
    throw err;
  }

  if (!res.ok) {
    const text = await res.text();
    onError(text || `HTTP ${res.status}`);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    onError('No response body');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

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
          onEvent(event);
        } catch {
          // skip malformed lines
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer.trim()) as StreamEvent;
        onEvent(event);
      } catch {
        // skip
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      onDone();
      return;
    }
    throw err;
  }

  onDone();
}
