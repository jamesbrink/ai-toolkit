'use client';

import { useState } from 'react';
import useSettings from '@/hooks/useSettings';
import useClaudeUsage from '@/hooks/useClaudeUsage';
import { TopBar, MainContent } from '@/components/layout';
import { apiClient } from '@/utils/api';

const ROUTE_LABELS: Record<string, string> = {
  chat: 'Chat',
  caption: 'Caption',
  caption_batch: 'Batch Caption',
  view_image: 'View Image',
};

function formatModel(model: string): string {
  if (model.includes('haiku')) return 'Haiku 4.5';
  if (model.includes('sonnet')) return 'Sonnet 4.5';
  if (model.includes('opus')) return 'Opus 4.6';
  return model;
}

const ENV_MASK = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';

export default function Settings() {
  const { settings, setSettings, envFlags } = useSettings();
  const { data: usage, isLoading: usageLoading } = useClaudeUsage(30);
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  // Track which env-sourced fields the user has started editing (overriding)
  const [envOverrides, setEnvOverrides] = useState<Record<string, boolean>>({});

  const isEnvSourced = (key: string) => envFlags[key] && !settings[key as keyof typeof settings] && !envOverrides[key];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('saving');

    apiClient
      .post('/api/settings', settings)
      .then(() => {
        setStatus('success');
      })
      .catch(error => {
        console.error('Error saving settings:', error);
        setStatus('error');
      })
      .finally(() => {
        setTimeout(() => setStatus('idle'), 2000);
      });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: value }));
  };

  const handleSecretFocus = (key: string) => {
    if (isEnvSourced(key)) {
      setEnvOverrides(prev => ({ ...prev, [key]: true }));
    }
  };

  return (
    <>
      <TopBar>
        <div>
          <h1 className="text-lg">Settings</h1>
        </div>
        <div className="flex-1"></div>
      </TopBar>
      <MainContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <div className="space-y-4">
                <div>
                  <label htmlFor="HF_TOKEN" className="block text-sm font-medium mb-2">
                    Hugging Face Token
                    <div className="text-gray-400 text-sm ml-1">
                      Create a Read token on{' '}
                      <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noreferrer">
                        {' '}
                        Huggingface
                      </a>{' '}
                      if you need to access gated/private models.
                    </div>
                  </label>
                  <input
                    type="password"
                    id="HF_TOKEN"
                    name="HF_TOKEN"
                    value={settings.HF_TOKEN}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-transparent"
                    placeholder="Enter your Hugging Face token"
                  />
                </div>

                <div>
                  <label htmlFor="TRAINING_FOLDER" className="block text-sm font-medium mb-2">
                    Training Folder Path
                    <div className="text-gray-400 text-sm ml-1">
                      We will store your training information here. Must be an absolute path. If blank, it will default
                      to the output folder in the project root.
                    </div>
                  </label>
                  <input
                    type="text"
                    id="TRAINING_FOLDER"
                    name="TRAINING_FOLDER"
                    value={settings.TRAINING_FOLDER}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-transparent"
                    placeholder="Enter training folder path"
                  />
                </div>

                <div>
                  <label htmlFor="DATASETS_FOLDER" className="block text-sm font-medium mb-2">
                    Dataset Folder Path
                    <div className="text-gray-400 text-sm ml-1">
                      Where we store and find your datasets.{' '}
                      <span className="text-orange-400">
                        Warning: This software may modify datasets so it is recommended you keep a backup somewhere else
                        or have a dedicated folder for this software.
                      </span>
                    </div>
                  </label>
                  <input
                    type="text"
                    id="DATASETS_FOLDER"
                    name="DATASETS_FOLDER"
                    value={settings.DATASETS_FOLDER}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-transparent"
                    placeholder="Enter datasets folder path"
                  />
                </div>

                <div>
                  <label htmlFor="ANTHROPIC_API_KEY" className="block text-sm font-medium mb-2">
                    Anthropic API Key
                    <div className="text-gray-400 text-sm ml-1">
                      Enable the Claude AI assistant for config help, log analysis, and dataset captioning. Get a key
                      from{' '}
                      <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
                        console.anthropic.com
                      </a>
                      .
                    </div>
                  </label>
                  <input
                    type={isEnvSourced('ANTHROPIC_API_KEY') ? 'text' : 'password'}
                    id="ANTHROPIC_API_KEY"
                    name="ANTHROPIC_API_KEY"
                    value={isEnvSourced('ANTHROPIC_API_KEY') ? ENV_MASK : settings.ANTHROPIC_API_KEY}
                    onChange={handleChange}
                    onFocus={() => handleSecretFocus('ANTHROPIC_API_KEY')}
                    readOnly={isEnvSourced('ANTHROPIC_API_KEY')}
                    className={`w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-transparent ${isEnvSourced('ANTHROPIC_API_KEY') ? 'text-gray-400' : ''}`}
                    placeholder="Enter your Anthropic API key"
                  />
                  {isEnvSourced('ANTHROPIC_API_KEY') && (
                    <p className="text-xs text-gray-400 mt-1">Set via ANTHROPIC_API_KEY environment variable</p>
                  )}
                </div>

                <div>
                  <label htmlFor="CLAUDE_CODE_OAUTH_TOKEN" className="block text-sm font-medium mb-2">
                    Claude Code OAuth Token
                    <div className="text-gray-400 text-sm ml-1">
                      Alternative to an API key. Only one is needed — if both are set, the API key takes priority.
                    </div>
                  </label>
                  <input
                    type={isEnvSourced('CLAUDE_CODE_OAUTH_TOKEN') ? 'text' : 'password'}
                    id="CLAUDE_CODE_OAUTH_TOKEN"
                    name="CLAUDE_CODE_OAUTH_TOKEN"
                    value={isEnvSourced('CLAUDE_CODE_OAUTH_TOKEN') ? ENV_MASK : settings.CLAUDE_CODE_OAUTH_TOKEN}
                    onChange={handleChange}
                    onFocus={() => handleSecretFocus('CLAUDE_CODE_OAUTH_TOKEN')}
                    readOnly={isEnvSourced('CLAUDE_CODE_OAUTH_TOKEN')}
                    className={`w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-transparent ${isEnvSourced('CLAUDE_CODE_OAUTH_TOKEN') ? 'text-gray-400' : ''}`}
                    placeholder="Enter your Claude Code OAuth token"
                  />
                  {isEnvSourced('CLAUDE_CODE_OAUTH_TOKEN') && (
                    <p className="text-xs text-gray-400 mt-1">Set via CLAUDE_CODE_OAUTH_TOKEN environment variable</p>
                  )}
                </div>

                <div>
                  <label htmlFor="CLAUDE_CHAT_MODEL" className="block text-sm font-medium mb-2">
                    Claude Chat Model
                    <div className="text-gray-400 text-sm ml-1">
                      Model used for the AI chat assistant. More capable models give better advice but cost more.
                    </div>
                  </label>
                  <select
                    id="CLAUDE_CHAT_MODEL"
                    name="CLAUDE_CHAT_MODEL"
                    value={settings.CLAUDE_CHAT_MODEL}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-transparent"
                  >
                    <option value="">Sonnet 4.5 (default)</option>
                    <option value="claude-haiku-4-5-20251001">Haiku 4.5 (fast, low cost)</option>
                    <option value="claude-sonnet-4-5-20250929">Sonnet 4.5 (balanced)</option>
                    <option value="claude-opus-4-6">Opus 4.6 (most capable)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="CLAUDE_CAPTION_MODEL" className="block text-sm font-medium mb-2">
                    Claude Caption Model
                    <div className="text-gray-400 text-sm ml-1">
                      Model used for generating image captions. Haiku is recommended for speed and cost when captioning
                      many images.
                    </div>
                  </label>
                  <select
                    id="CLAUDE_CAPTION_MODEL"
                    name="CLAUDE_CAPTION_MODEL"
                    value={settings.CLAUDE_CAPTION_MODEL}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-transparent"
                  >
                    <option value="">Haiku 4.5 (default)</option>
                    <option value="claude-haiku-4-5-20251001">Haiku 4.5 (fast, low cost)</option>
                    <option value="claude-sonnet-4-5-20250929">Sonnet 4.5 (balanced)</option>
                    <option value="claude-opus-4-6">Opus 4.6 (most capable)</option>
                  </select>
                </div>

                {/* Claude Usage Section */}
                <div className="pt-4 border-t border-gray-700">
                  <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">Claude Usage</h2>
                  {usageLoading ? (
                    <p className="text-gray-400 text-sm">Loading usage data...</p>
                  ) : usage ? (
                    <div className="space-y-4">
                      {/* All-time stats */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-gray-800 rounded-lg p-3">
                          <div className="text-gray-400 text-xs mb-1">API Calls</div>
                          <div className="text-lg font-semibold">{usage.allTime.calls.toLocaleString()}</div>
                        </div>
                        <div className="bg-gray-800 rounded-lg p-3">
                          <div className="text-gray-400 text-xs mb-1">Input Tokens</div>
                          <div className="text-lg font-semibold">{usage.allTime.inputTokens.toLocaleString()}</div>
                        </div>
                        <div className="bg-gray-800 rounded-lg p-3">
                          <div className="text-gray-400 text-xs mb-1">Output Tokens</div>
                          <div className="text-lg font-semibold">{usage.allTime.outputTokens.toLocaleString()}</div>
                        </div>
                      </div>

                      {/* By model (last 30 days) */}
                      {usage.byModel.length > 0 && (
                        <div>
                          <h3 className="text-xs font-medium text-gray-400 mb-2">Last 30 days by model</h3>
                          <div className="bg-gray-800 rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-gray-400 text-xs border-b border-gray-700">
                                  <th className="text-left px-3 py-2">Model</th>
                                  <th className="text-right px-3 py-2">Calls</th>
                                  <th className="text-right px-3 py-2">Input</th>
                                  <th className="text-right px-3 py-2">Output</th>
                                </tr>
                              </thead>
                              <tbody>
                                {usage.byModel.map(m => (
                                  <tr key={m.model} className="border-b border-gray-700/50 last:border-0">
                                    <td className="px-3 py-2">{formatModel(m.model)}</td>
                                    <td className="text-right px-3 py-2 text-gray-400">{m.calls.toLocaleString()}</td>
                                    <td className="text-right px-3 py-2 text-gray-400">
                                      {m.inputTokens.toLocaleString()}
                                    </td>
                                    <td className="text-right px-3 py-2 text-gray-400">
                                      {m.outputTokens.toLocaleString()}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* By route (last 30 days) */}
                      {usage.byRoute.length > 0 && (
                        <div>
                          <h3 className="text-xs font-medium text-gray-400 mb-2">Last 30 days by route</h3>
                          <div className="bg-gray-800 rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-gray-400 text-xs border-b border-gray-700">
                                  <th className="text-left px-3 py-2">Route</th>
                                  <th className="text-right px-3 py-2">Calls</th>
                                  <th className="text-right px-3 py-2">Input</th>
                                  <th className="text-right px-3 py-2">Output</th>
                                </tr>
                              </thead>
                              <tbody>
                                {usage.byRoute.map(r => (
                                  <tr key={r.routeType} className="border-b border-gray-700/50 last:border-0">
                                    <td className="px-3 py-2">{ROUTE_LABELS[r.routeType] || r.routeType}</td>
                                    <td className="text-right px-3 py-2 text-gray-400">{r.calls.toLocaleString()}</td>
                                    <td className="text-right px-3 py-2 text-gray-400">
                                      {r.inputTokens.toLocaleString()}
                                    </td>
                                    <td className="text-right px-3 py-2 text-gray-400">
                                      {r.outputTokens.toLocaleString()}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {usage.allTime.calls === 0 && <p className="text-gray-400 text-sm">No usage recorded yet.</p>}
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm">Could not load usage data.</p>
                  )}
                </div>

                {/* Network Section */}
                <div className="pt-4 border-t border-gray-700">
                  <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">Network</h2>
                  <div>
                    <label htmlFor="MDNS_ENABLED" className="block text-sm font-medium mb-2">
                      mDNS Discovery
                      <div className="text-gray-400 text-sm ml-1">
                        Automatically discover other AI Toolkit instances on your local network.
                      </div>
                    </label>
                    <select
                      id="MDNS_ENABLED"
                      name="MDNS_ENABLED"
                      value={settings.MDNS_ENABLED}
                      onChange={handleChange}
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-transparent"
                    >
                      <option value="true">Enabled</option>
                      <option value="false">Disabled</option>
                    </select>
                  </div>
                </div>

                {/* Cloud Providers Section */}
                <div className="pt-4 border-t border-gray-700">
                  <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">Cloud Providers</h2>
                  <div>
                    <label htmlFor="RUNPOD_SSH_PUBLIC_KEY" className="block text-sm font-medium mb-2">
                      SSH Public Key
                      <div className="text-gray-400 text-sm ml-1">
                        SSH key for accessing RunPod pods. Pre-populated in the deploy modal for convenience.
                      </div>
                    </label>
                    <textarea
                      id="RUNPOD_SSH_PUBLIC_KEY"
                      name="RUNPOD_SSH_PUBLIC_KEY"
                      value={settings.RUNPOD_SSH_PUBLIC_KEY}
                      onChange={e => setSettings(prev => ({ ...prev, RUNPOD_SSH_PUBLIC_KEY: e.target.value }))}
                      rows={3}
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-transparent text-xs font-mono"
                      placeholder="ssh-ed25519 AAAA..."
                    />
                  </div>

                  <div>
                    <label htmlFor="RUNPOD_DEFAULT_PASSWORD" className="block text-sm font-medium mb-2">
                      Default RunPod Password
                      <div className="text-gray-400 text-sm ml-1">
                        Set a static password for new RunPod pods. If empty, a random password is generated for each
                        pod.
                      </div>
                    </label>
                    <input
                      type="password"
                      id="RUNPOD_DEFAULT_PASSWORD"
                      name="RUNPOD_DEFAULT_PASSWORD"
                      value={settings.RUNPOD_DEFAULT_PASSWORD}
                      onChange={handleChange}
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-transparent"
                      placeholder="Leave empty for random passwords"
                    />
                  </div>

                  <div>
                    <label htmlFor="RUNPOD_API_KEY" className="block text-sm font-medium mb-2">
                      RunPod API Key
                      <div className="text-gray-400 text-sm ml-1">
                        Deploy and manage cloud GPU pods directly from AI Toolkit. Get a key from{' '}
                        <a href="https://www.runpod.io/console/user/settings" target="_blank" rel="noreferrer">
                          runpod.io/console/user/settings
                        </a>
                        .
                      </div>
                    </label>
                    <input
                      type="password"
                      id="RUNPOD_API_KEY"
                      name="RUNPOD_API_KEY"
                      value={settings.RUNPOD_API_KEY}
                      onChange={handleChange}
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-transparent"
                      placeholder="Enter your RunPod API key"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={status === 'saving'}
            className="w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'saving' ? 'Saving...' : 'Save Settings'}
          </button>

          {status === 'success' && <p className="text-green-500 text-center">Settings saved successfully!</p>}
          {status === 'error' && <p className="text-red-500 text-center">Error saving settings. Please try again.</p>}
        </form>
      </MainContent>
    </>
  );
}
