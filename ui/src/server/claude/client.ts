import Anthropic from '@anthropic-ai/sdk';
import { AnthropicAuth } from '@/server/settings';

/**
 * Create an Anthropic SDK client that supports both API key and
 * Claude Code OAuth token authentication.
 *
 * OAuth tokens require a custom fetch that:
 * - Sets Authorization: Bearer <token> (instead of x-api-key)
 * - Adds the oauth-2025-04-20 beta header
 * - Appends ?beta=true to the /v1/messages URL
 */
export function createAnthropicClient(auth: AnthropicAuth): Anthropic {
  if (auth.oauthToken) {
    const token = auth.oauthToken;
    return new Anthropic({
      apiKey: '', // required by constructor but overridden by custom fetch
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);

        // Replace API-key auth with OAuth Bearer auth
        headers.delete('x-api-key');
        headers.set('authorization', `Bearer ${token}`);

        // Required beta flag for OAuth-authenticated requests
        const existingBeta = headers.get('anthropic-beta');
        const oauthBeta = 'oauth-2025-04-20';
        if (existingBeta) {
          if (!existingBeta.includes(oauthBeta)) {
            headers.set('anthropic-beta', `${existingBeta},${oauthBeta}`);
          }
        } else {
          headers.set('anthropic-beta', oauthBeta);
        }

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

        return globalThis.fetch(url, { ...init, headers });
      },
    });
  }

  return new Anthropic({ apiKey: auth.apiKey });
}
