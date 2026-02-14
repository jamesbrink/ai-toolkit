'use client';

import { useState } from 'react';
import useSettings from '@/hooks/useSettings';
import useClaudeUsage from '@/hooks/useClaudeUsage';
import { TopBar, MainContent } from '@/components/layout';
import { apiClient } from '@/utils/api';
import { Heading, Subheading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';
import { Divider } from '@/components/catalyst/divider';
import { Field, FieldGroup, Label, Description } from '@/components/catalyst/fieldset';
import { Input } from '@/components/catalyst/input';
import { Select } from '@/components/catalyst/select';
import { Textarea } from '@/components/catalyst/textarea';
import { Button } from '@/components/catalyst/button';
import { Badge } from '@/components/catalyst/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/catalyst/table';
import { SwitchField } from '@/components/catalyst/switch';
import { Switch } from '@/components/catalyst/switch';

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
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
        <Heading>Settings</Heading>
        <div className="flex-1"></div>
      </TopBar>
      <MainContent>
        <form id="settings-form" onSubmit={handleSubmit} className="max-w-7xl space-y-6">
          {/* Row 1: Paths & Tokens + Claude AI */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Paths & Tokens Section */}
            <section className="flex flex-col rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className="px-6 py-4">
                <Subheading>Paths &amp; Tokens</Subheading>
              </div>
              <Divider soft />
              <div className="flex-1 px-6 py-5">
                <FieldGroup>
                  <Field>
                    <Label>Hugging Face Token</Label>
                    <Description>
                      Create a Read token on{' '}
                      <a
                        href="https://huggingface.co/settings/tokens"
                        target="_blank"
                        rel="noreferrer"
                        className="text-zinc-950 underline decoration-zinc-950/50 hover:decoration-zinc-950 dark:text-white dark:decoration-white/50 dark:hover:decoration-white"
                      >
                        Hugging Face
                      </a>{' '}
                      if you need to access gated/private models.
                    </Description>
                    <Input
                      type={isEnvSourced('HF_TOKEN') ? 'text' : 'password'}
                      name="HF_TOKEN"
                      value={isEnvSourced('HF_TOKEN') ? ENV_MASK : settings.HF_TOKEN}
                      onChange={handleChange}
                      onFocus={() => handleSecretFocus('HF_TOKEN')}
                      readOnly={isEnvSourced('HF_TOKEN')}
                      placeholder="Enter your Hugging Face token"
                    />
                    {isEnvSourced('HF_TOKEN') && (
                      <Text className="!mt-1 !text-xs">
                        <Badge color="zinc">ENV</Badge> Set via HF_TOKEN environment variable
                      </Text>
                    )}
                  </Field>

                  <Field>
                    <Label>Training Folder Path</Label>
                    <Description>
                      We will store your training information here. Must be an absolute path. If blank, it will default
                      to the output folder in the project root.
                    </Description>
                    <Input
                      type="text"
                      name="TRAINING_FOLDER"
                      value={settings.TRAINING_FOLDER}
                      onChange={handleChange}
                      placeholder="Enter training folder path"
                    />
                  </Field>

                  <Field>
                    <Label>Dataset Folder Path</Label>
                    <Description>
                      Where we store and find your datasets.{' '}
                      <span className="text-orange-600 dark:text-orange-400">
                        Warning: This software may modify datasets so it is recommended you keep a backup somewhere else
                        or have a dedicated folder for this software.
                      </span>
                    </Description>
                    <Input
                      type="text"
                      name="DATASETS_FOLDER"
                      value={settings.DATASETS_FOLDER}
                      onChange={handleChange}
                      placeholder="Enter datasets folder path"
                    />
                  </Field>
                </FieldGroup>
              </div>
            </section>

            {/* Claude AI Section */}
            <section className="flex flex-col rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className="px-6 py-4">
                <Subheading>Claude AI</Subheading>
              </div>
              <Divider soft />
              <div className="flex-1 px-6 py-5">
                <FieldGroup>
                  <Field>
                    <Label>Anthropic API Key</Label>
                    <Description>
                      Enable the Claude AI assistant for config help, log analysis, and dataset captioning. Get a key
                      from{' '}
                      <a
                        href="https://console.anthropic.com/settings/keys"
                        target="_blank"
                        rel="noreferrer"
                        className="text-zinc-950 underline decoration-zinc-950/50 hover:decoration-zinc-950 dark:text-white dark:decoration-white/50 dark:hover:decoration-white"
                      >
                        console.anthropic.com
                      </a>
                      .
                    </Description>
                    <Input
                      type={isEnvSourced('ANTHROPIC_API_KEY') ? 'text' : 'password'}
                      name="ANTHROPIC_API_KEY"
                      value={isEnvSourced('ANTHROPIC_API_KEY') ? ENV_MASK : settings.ANTHROPIC_API_KEY}
                      onChange={handleChange}
                      onFocus={() => handleSecretFocus('ANTHROPIC_API_KEY')}
                      readOnly={isEnvSourced('ANTHROPIC_API_KEY')}
                      placeholder="Enter your Anthropic API key"
                    />
                    {isEnvSourced('ANTHROPIC_API_KEY') && (
                      <Text className="!mt-1 !text-xs">
                        <Badge color="zinc">ENV</Badge> Set via ANTHROPIC_API_KEY environment variable
                      </Text>
                    )}
                  </Field>

                  <Field>
                    <Label>Claude Code OAuth Token</Label>
                    <Description>
                      Alternative to an API key. Only one is needed -- if both are set, the API key takes priority.
                    </Description>
                    <Input
                      type={isEnvSourced('CLAUDE_CODE_OAUTH_TOKEN') ? 'text' : 'password'}
                      name="CLAUDE_CODE_OAUTH_TOKEN"
                      value={isEnvSourced('CLAUDE_CODE_OAUTH_TOKEN') ? ENV_MASK : settings.CLAUDE_CODE_OAUTH_TOKEN}
                      onChange={handleChange}
                      onFocus={() => handleSecretFocus('CLAUDE_CODE_OAUTH_TOKEN')}
                      readOnly={isEnvSourced('CLAUDE_CODE_OAUTH_TOKEN')}
                      placeholder="Enter your Claude Code OAuth token"
                    />
                    {isEnvSourced('CLAUDE_CODE_OAUTH_TOKEN') && (
                      <Text className="!mt-1 !text-xs">
                        <Badge color="zinc">ENV</Badge> Set via CLAUDE_CODE_OAUTH_TOKEN environment variable
                      </Text>
                    )}
                  </Field>

                  <Field>
                    <Label>Claude Chat Model</Label>
                    <Description>
                      Model used for the AI chat assistant. More capable models give better advice but cost more.
                    </Description>
                    <Select name="CLAUDE_CHAT_MODEL" value={settings.CLAUDE_CHAT_MODEL} onChange={handleChange}>
                      <option value="">Sonnet 4.5 (default)</option>
                      <option value="claude-haiku-4-5-20251001">Haiku 4.5 (fast, low cost)</option>
                      <option value="claude-sonnet-4-5-20250929">Sonnet 4.5 (balanced)</option>
                      <option value="claude-opus-4-6">Opus 4.6 (most capable)</option>
                    </Select>
                  </Field>

                  <Field>
                    <Label>Claude Caption Model</Label>
                    <Description>
                      Model used for generating image captions. Haiku is recommended for speed and cost when captioning
                      many images.
                    </Description>
                    <Select name="CLAUDE_CAPTION_MODEL" value={settings.CLAUDE_CAPTION_MODEL} onChange={handleChange}>
                      <option value="">Haiku 4.5 (default)</option>
                      <option value="claude-haiku-4-5-20251001">Haiku 4.5 (fast, low cost)</option>
                      <option value="claude-sonnet-4-5-20250929">Sonnet 4.5 (balanced)</option>
                      <option value="claude-opus-4-6">Opus 4.6 (most capable)</option>
                    </Select>
                  </Field>
                </FieldGroup>
              </div>
            </section>
          </div>

          {/* Row 2: Network + Cloud Providers */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Network Section */}
            <section className="flex flex-col rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className="px-6 py-4">
                <Subheading>Network</Subheading>
              </div>
              <Divider soft />
              <div className="flex-1 px-6 py-5">
                <SwitchField>
                  <Label>mDNS Discovery</Label>
                  <Description>Automatically discover other AI Toolkit instances on your local network.</Description>
                  <Switch
                    color="blue"
                    checked={settings.MDNS_ENABLED === 'true'}
                    onChange={(checked: boolean) =>
                      setSettings(prev => ({ ...prev, MDNS_ENABLED: checked ? 'true' : 'false' }))
                    }
                  />
                </SwitchField>
              </div>
            </section>

            {/* Cloud Providers Section */}
            <section className="flex flex-col rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className="px-6 py-4">
                <Subheading>Cloud Providers</Subheading>
                <Text className="mt-1">Configure cloud GPU providers for remote training.</Text>
              </div>
              <Divider soft />
              <div className="flex-1 px-6 py-5">
                <FieldGroup>
                  <Field>
                    <Label>SSH Public Key</Label>
                    <Description>
                      SSH key for accessing RunPod pods. Pre-populated in the deploy modal for convenience.
                    </Description>
                    <Textarea
                      name="RUNPOD_SSH_PUBLIC_KEY"
                      value={settings.RUNPOD_SSH_PUBLIC_KEY}
                      onChange={handleChange}
                      rows={3}
                      className="font-mono text-xs"
                      placeholder="ssh-ed25519 AAAA..."
                    />
                  </Field>

                  <Field>
                    <Label>Default RunPod Password</Label>
                    <Description>
                      Set a static password for new RunPod pods. If empty, a random password is generated for each pod.
                    </Description>
                    <Input
                      type="password"
                      name="RUNPOD_DEFAULT_PASSWORD"
                      value={settings.RUNPOD_DEFAULT_PASSWORD}
                      onChange={handleChange}
                      placeholder="Leave empty for random passwords"
                    />
                  </Field>

                  <Field>
                    <Label>RunPod API Key</Label>
                    <Description>
                      Deploy and manage cloud GPU pods directly from AI Toolkit. Get a key from{' '}
                      <a
                        href="https://www.runpod.io/console/user/settings"
                        target="_blank"
                        rel="noreferrer"
                        className="text-zinc-950 underline decoration-zinc-950/50 hover:decoration-zinc-950 dark:text-white dark:decoration-white/50 dark:hover:decoration-white"
                      >
                        runpod.io/console/user/settings
                      </a>
                      .
                    </Description>
                    <Input
                      type="password"
                      name="RUNPOD_API_KEY"
                      value={settings.RUNPOD_API_KEY}
                      onChange={handleChange}
                      placeholder="Enter your RunPod API key"
                    />
                  </Field>
                </FieldGroup>
              </div>
            </section>
          </div>

          {/* Row 3: Claude Usage (full-width) */}
          <section className="flex flex-col rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="px-6 py-4">
              <Subheading>Claude Usage</Subheading>
              <Text className="mt-1">Token usage and API call statistics.</Text>
            </div>
            <Divider soft />
            <div className="flex-1 px-6 py-5">
              {usageLoading ? (
                <Text>Loading usage data...</Text>
              ) : usage ? (
                <div className="space-y-4">
                  {/* All-time stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg bg-zinc-100 p-3 dark:bg-white/5">
                      <Text className="!text-xs">API Calls</Text>
                      <div className="text-lg font-semibold text-zinc-950 dark:text-white">
                        {usage.allTime.calls.toLocaleString()}
                      </div>
                    </div>
                    <div className="rounded-lg bg-zinc-100 p-3 dark:bg-white/5">
                      <Text className="!text-xs">Input Tokens</Text>
                      <div className="text-lg font-semibold text-zinc-950 dark:text-white">
                        {usage.allTime.inputTokens.toLocaleString()}
                      </div>
                    </div>
                    <div className="rounded-lg bg-zinc-100 p-3 dark:bg-white/5">
                      <Text className="!text-xs">Output Tokens</Text>
                      <div className="text-lg font-semibold text-zinc-950 dark:text-white">
                        {usage.allTime.outputTokens.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* By model (last 30 days) */}
                  {usage.byModel.length > 0 && (
                    <div>
                      <Text className="mb-2 !text-xs font-medium">Last 30 days by model</Text>
                      <Table dense>
                        <TableHead>
                          <TableRow>
                            <TableHeader>Model</TableHeader>
                            <TableHeader className="text-right">Calls</TableHeader>
                            <TableHeader className="text-right">Input</TableHeader>
                            <TableHeader className="text-right">Output</TableHeader>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {usage.byModel.map(m => (
                            <TableRow key={m.model}>
                              <TableCell>{formatModel(m.model)}</TableCell>
                              <TableCell className="text-right text-zinc-500 dark:text-zinc-400">
                                {m.calls.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right text-zinc-500 dark:text-zinc-400">
                                {m.inputTokens.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right text-zinc-500 dark:text-zinc-400">
                                {m.outputTokens.toLocaleString()}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {/* By route (last 30 days) */}
                  {usage.byRoute.length > 0 && (
                    <div>
                      <Text className="mb-2 !text-xs font-medium">Last 30 days by route</Text>
                      <Table dense>
                        <TableHead>
                          <TableRow>
                            <TableHeader>Route</TableHeader>
                            <TableHeader className="text-right">Calls</TableHeader>
                            <TableHeader className="text-right">Input</TableHeader>
                            <TableHeader className="text-right">Output</TableHeader>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {usage.byRoute.map(r => (
                            <TableRow key={r.routeType}>
                              <TableCell>{ROUTE_LABELS[r.routeType] || r.routeType}</TableCell>
                              <TableCell className="text-right text-zinc-500 dark:text-zinc-400">
                                {r.calls.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right text-zinc-500 dark:text-zinc-400">
                                {r.inputTokens.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right text-zinc-500 dark:text-zinc-400">
                                {r.outputTokens.toLocaleString()}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {usage.allTime.calls === 0 && <Text>No usage recorded yet.</Text>}
                </div>
              ) : (
                <Text>Could not load usage data.</Text>
              )}
            </div>
          </section>
        </form>

        {/* Sticky save bar */}
        <div className="sticky bottom-0 -mx-4 mt-6 border-t border-zinc-200 bg-white/80 px-4 py-3 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/80">
          <div className="flex max-w-7xl items-center gap-4">
            <Button type="submit" form="settings-form" color="blue" disabled={status === 'saving'}>
              {status === 'saving' ? 'Saving...' : 'Save Settings'}
            </Button>
            {status === 'success' && <Badge color="green">Settings saved successfully!</Badge>}
            {status === 'error' && <Badge color="red">Error saving settings. Please try again.</Badge>}
          </div>
        </div>
      </MainContent>
    </>
  );
}
