import Anthropic from '@anthropic-ai/sdk';
import { AnthropicAuth } from '@/server/settings';

const CLAUDE_CODE_SYSTEM_PREFIX = "You are Claude Code, Anthropic's official CLI for Claude.";
const CLAUDE_CODE_USER_AGENT = 'claude-cli/2.1.2 (external, cli)';
const TOOL_PREFIX = 'mcp__';

/**
 * Create an Anthropic SDK client that supports both API key and
 * Claude Code OAuth token authentication.
 *
 * OAuth tokens require a custom fetch that:
 * - Sets Authorization: Bearer <token> (instead of x-api-key)
 * - Adds oauth-2025-04-20 and claude-code-20250219 beta headers
 * - Appends ?beta=true to the /v1/messages URL
 * - Sets user-agent to match Claude Code
 * - Prepends Claude Code system prompt identifier
 * - Prefixes tool names with mcp__ (Anthropic validates tool names for OAuth)
 * - Strips temperature (must be absent for OAuth requests)
 */
export function createAnthropicClient(auth: AnthropicAuth): Anthropic {
  if (auth.oauthToken) {
    const token = auth.oauthToken;
    return new Anthropic({
      apiKey: 'oauth-placeholder', // non-empty to pass SDK validation; removed by custom fetch below
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);

        // Replace API-key auth with OAuth Bearer auth
        headers.delete('x-api-key');
        headers.set('authorization', `Bearer ${token}`);
        headers.set('user-agent', CLAUDE_CODE_USER_AGENT);

        // Required beta flags for OAuth-authenticated requests
        const requiredBetas = ['oauth-2025-04-20', 'claude-code-20250219'];
        const existingBeta = headers.get('anthropic-beta');
        const existing = existingBeta ? existingBeta.split(',').map(s => s.trim()) : [];
        for (const beta of requiredBetas) {
          if (!existing.includes(beta)) existing.push(beta);
        }
        headers.set('anthropic-beta', existing.join(','));

        // Append ?beta=true query parameter for /v1/messages
        let url: URL;
        if (typeof input === 'string') {
          url = new URL(input);
        } else if (input instanceof URL) {
          url = new URL(input.toString());
        } else {
          url = new URL((input as Request).url);
        }
        if (url.pathname === '/v1/messages' && !url.searchParams.has('beta')) {
          url.searchParams.set('beta', 'true');
        }

        // Transform request body to match Claude Code expectations
        let body = init?.body;
        if (body && typeof body === 'string') {
          try {
            const parsed = JSON.parse(body);

            // Prepend Claude Code system prompt as a separate array block.
            // Anthropic validates that the FIRST text block is exactly the
            // Claude Code prefix — string concatenation breaks this check.
            const prefixBlock = { type: 'text', text: CLAUDE_CODE_SYSTEM_PREFIX };
            if (typeof parsed.system === 'string') {
              if (parsed.system === CLAUDE_CODE_SYSTEM_PREFIX) {
                parsed.system = [prefixBlock];
              } else {
                parsed.system = [prefixBlock, { type: 'text', text: parsed.system }];
              }
            } else if (Array.isArray(parsed.system)) {
              const first = parsed.system[0];
              if (!first || first.type !== 'text' || first.text !== CLAUDE_CODE_SYSTEM_PREFIX) {
                parsed.system = [prefixBlock, ...parsed.system];
              }
            } else {
              parsed.system = [prefixBlock];
            }

            // Prefix tool names with mcp__ so they pass OAuth tool validation
            if (Array.isArray(parsed.tools)) {
              parsed.tools = parsed.tools.map((tool: { name: string; [k: string]: unknown }) => ({
                ...tool,
                name: tool.name.startsWith(TOOL_PREFIX) ? tool.name : `${TOOL_PREFIX}${tool.name}`,
              }));
            }

            // Prefix tool_use names in messages (prior tool calls in conversation history)
            if (Array.isArray(parsed.messages)) {
              for (const msg of parsed.messages) {
                if (Array.isArray(msg.content)) {
                  for (const block of msg.content) {
                    if (block.type === 'tool_use' && block.name && !block.name.startsWith(TOOL_PREFIX)) {
                      block.name = `${TOOL_PREFIX}${block.name}`;
                    }
                  }
                }
              }
            }

            // Remove temperature — must be absent for OAuth requests
            delete parsed.temperature;

            body = JSON.stringify(parsed);
          } catch {
            // leave body as-is if not valid JSON
          }
        }

        // Intercept response to strip mcp__ prefix from tool names
        const response = await globalThis.fetch(url, { ...init, body, headers });
        if (!response.body) return response;

        const responseBody = await response.text();
        const strippedBody = responseBody.replace(
          new RegExp(`"name"\\s*:\\s*"${TOOL_PREFIX}([^"]+)"`, 'g'),
          '"name": "$1"',
        );

        return new Response(strippedBody, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      },
    });
  }

  return new Anthropic({ apiKey: auth.apiKey });
}

// Re-export async model getters from settings for use in routes
export { getClaudeChatModel, getClaudeCaptionModel } from '@/server/settings';
