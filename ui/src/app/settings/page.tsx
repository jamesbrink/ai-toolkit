'use client';

import { useState } from 'react';
import useSettings from '@/hooks/useSettings';
import { TopBar, MainContent } from '@/components/layout';
import { apiClient } from '@/utils/api';

export default function Settings() {
  const { settings, setSettings } = useSettings();
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

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
                    type="password"
                    id="ANTHROPIC_API_KEY"
                    name="ANTHROPIC_API_KEY"
                    value={settings.ANTHROPIC_API_KEY}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-transparent"
                    placeholder="Enter your Anthropic API key"
                  />
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
                    <label htmlFor="RUNPOD_API_KEY" className="block text-sm font-medium mb-2">
                      RunPod API Key
                      <div className="text-gray-400 text-sm ml-1">
                        Deploy and manage cloud GPU pods directly from AI Toolkit. Get a key from{' '}
                        <a
                          href="https://www.runpod.io/console/user/settings"
                          target="_blank"
                          rel="noreferrer"
                        >
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
