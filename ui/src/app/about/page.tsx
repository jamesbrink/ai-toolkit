'use client';

import { TopBar, MainContent } from '@/components/layout';
import { Heading, Subheading } from '@/components/catalyst/heading';
import { Text, TextLink } from '@/components/catalyst/text';
import { Badge } from '@/components/catalyst/badge';
import { Divider } from '@/components/catalyst/divider';
import {
  ExternalLink,
  Cpu,
  Snowflake,
  Network,
  Cloud,
  Bot,
  Image,
  Search,
  Container,
  LayoutDashboard,
  GitBranch,
} from 'lucide-react';

const forkFeatures = [
  {
    title: 'Apple Silicon (MPS) Training',
    description:
      'Full training support on Apple Silicon Macs with safe MPS patches for torch.cat/stack, float32 VAE decoding, gradual device migration, and auto-detection of MPS-safe defaults in the job creation UI.',
    tags: ['MPS', 'Apple Silicon', 'M-series'],
    icon: Cpu,
  },
  {
    title: 'Nix Packaging',
    description:
      'Reproducible builds via Nix flakes. Derivations for the Python training CLI, Next.js UI, and Docker image. Includes NixOS and nix-darwin service modules, a Nix overlay, and a developer shell.',
    tags: ['Nix', 'Flakes', 'NixOS', 'Darwin'],
    icon: Snowflake,
  },
  {
    title: 'Multi-Host Management',
    description:
      'Discover and manage other AI Toolkit instances on your LAN via mDNS. The hub proxies all API calls server-side -- view remote GPUs, jobs, queues, and datasets from a single dashboard.',
    tags: ['mDNS', 'Networking', 'Proxy'],
    icon: Network,
  },
  {
    title: 'RunPod Cloud Integration',
    description:
      'Deploy, manage, and monitor RunPod GPU pods from the UI. Includes GPU type browser with real-time pricing, one-click deploy, pod lifecycle management, live GPU utilization, and SSH access.',
    tags: ['RunPod', 'Cloud GPU', 'Deploy'],
    icon: Cloud,
  },
  {
    title: 'Claude AI Assistant',
    description:
      'Integrated Claude chat with dataset-aware tools: analyze quality, detect duplicates, view images, crop faces, delete files, and manage configs through natural conversation.',
    tags: ['Claude', 'AI', 'Chat'],
    icon: Bot,
  },
  {
    title: 'AI-Powered Captioning',
    description:
      'Batch image captioning via Claude with style presets (descriptive, booru, natural language, trigger word). Per-image accept/reject, bulk apply, and automatic refusal detection with retry.',
    tags: ['Captions', 'Vision', 'Batch'],
    icon: Image,
  },
  {
    title: 'Dataset Quality Analysis',
    description:
      'Automated quality scoring with blur detection, brightness/contrast analysis, size validation, perceptual hash duplicate detection, and YuNet face detection with automated face cropping.',
    tags: ['Quality', 'pHash', 'Faces', 'OpenCV'],
    icon: Search,
  },
  {
    title: 'Enhanced Docker Support',
    description:
      'Production-ready Docker image with CUDA 12.8, Node.js 22, Prisma migrations, SSH server, mDNS, and RunPod environment persistence. Includes docker-compose with GPU passthrough.',
    tags: ['Docker', 'CUDA', 'RunPod'],
    icon: Container,
  },
  {
    title: 'UI Overhaul',
    description:
      'Responsive three-mode sidebar, Tailwind CSS 4.1, skeleton loading states, dark theme with WCAG AA contrast, sortable tables, dataset export/rename, and sample image navigation.',
    tags: ['Responsive', 'Tailwind 4', 'Accessibility'],
    icon: LayoutDashboard,
  },
  {
    title: 'CI/CD Pipeline',
    description:
      'GitHub Actions with TypeScript type checking, ESLint, Vitest tests, Prettier formatting, and Nix flake checks. Automated Docker image builds with layer caching.',
    tags: ['CI', 'Testing', 'Automation'],
    icon: GitBranch,
  },
];

const supportedModels = [
  'FLUX',
  'SDXL',
  'SD 1.5',
  'SD 3.5',
  'WAN 2.1 / 2.2',
  'Lumina',
  'CHROMA',
  'CogView4',
  'OmniGen2',
  'PixArt',
  'AuraFlow',
];

const trainingMethods = ['LoRA', 'LoKr', 'Full Fine-Tuning'];

const upstreamLinks = [
  { label: 'GitHub Repository', href: 'https://github.com/ostris/ai-toolkit' },
  { label: 'Ostris Website', href: 'https://ostris.com' },
  { label: 'Support Ostris', href: 'https://ostris.com/support' },
  { label: 'Discord Community', href: 'https://discord.gg/VXmU2f5WEU' },
];

const forkLinks = [{ label: 'Fork Repository', href: 'https://github.com/jamesbrink/ai-toolkit' }];

export default function AboutPage() {
  return (
    <>
      <TopBar>
        <div>
          <Heading level={1} className="text-lg">
            About
          </Heading>
        </div>
      </TopBar>
      <MainContent>
        <div className="max-w-7xl space-y-6 pb-12">
          {/* Top row: Overview + Technical Details */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Overview */}
            <section className="flex flex-col rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className="px-6 py-4">
                <Subheading>Kiln Remix</Subheading>
                <Text className="mt-1">
                  A fork of{' '}
                  <TextLink href="https://github.com/ostris/ai-toolkit" target="_blank">
                    AI-Toolkit by Ostris
                  </TextLink>
                  , maintained by{' '}
                  <TextLink href="https://github.com/jamesbrink" target="_blank">
                    James Brink
                  </TextLink>
                  .
                </Text>
              </div>
              <Divider soft />
              <div className="flex-1 px-6 py-5">
                <Text>
                  This fork adds Nix packaging, Apple Silicon (MPS) training support, multi-host orchestration, RunPod
                  cloud integration, Claude AI tools for dataset management, and a modernized web UI. All original
                  training functionality from the upstream project is preserved.
                </Text>

                <div className="mt-5">
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Fork Links
                  </h4>
                  <div className="flex flex-wrap gap-3">
                    {forkLinks.map(link => (
                      <TextLink
                        key={link.label}
                        href={link.href}
                        target="_blank"
                        className="flex items-center gap-1.5 text-sm"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {link.label}
                      </TextLink>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Technical Details */}
            <section className="flex flex-col rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className="px-6 py-4">
                <Subheading>Training Capabilities</Subheading>
                <Text className="mt-1">
                  Supported model architectures and training methods from the upstream engine.
                </Text>
              </div>
              <Divider soft />
              <div className="flex-1 px-6 py-5 space-y-5">
                <div>
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Supported Models
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {supportedModels.map(model => (
                      <Badge key={model} color="blue">
                        {model}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Training Methods
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {trainingMethods.map(method => (
                      <Badge key={method} color="purple">
                        {method}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Platforms
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge color="green">NVIDIA CUDA</Badge>
                    <Badge color="green">Apple Silicon MPS</Badge>
                    <Badge color="green">CPU</Badge>
                  </div>
                </div>

                <div>
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Media Types
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge color="amber">Image Generation</Badge>
                    <Badge color="amber">Video Generation</Badge>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Fork features grid */}
          <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="px-6 py-4">
              <Subheading>What This Fork Adds</Subheading>
              <Text className="mt-1">Features and improvements added on top of the upstream AI-Toolkit.</Text>
            </div>
            <Divider soft />
            <div className="px-6 py-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {forkFeatures.map(feature => {
                  const Icon = feature.icon;
                  return (
                    <div
                      key={feature.title}
                      className="rounded-lg border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-200 dark:bg-zinc-800">
                          <Icon className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{feature.title}</h4>
                          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{feature.description}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5 pl-11">
                        {feature.tags.map(tag => (
                          <Badge key={tag} color="zinc">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Bottom row: Upstream Attribution + Tech Stack */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Upstream Attribution */}
            <section className="flex flex-col rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className="px-6 py-4">
                <Subheading>Upstream: AI-Toolkit by Ostris</Subheading>
                <Text className="mt-1">The core training engine this fork is built on.</Text>
              </div>
              <Divider soft />
              <div className="flex-1 px-6 py-5">
                <Text>
                  The training engine -- including LoRA, LoKr, and full fine-tuning across all supported model
                  architectures -- is created by{' '}
                  <TextLink href="https://ostris.com" target="_blank">
                    Ostris, LLC
                  </TextLink>
                  . AI-Toolkit supports both image and video diffusion model training on consumer-grade hardware.
                  Licensed under MIT.
                </Text>
                <div className="mt-4 flex flex-wrap gap-3">
                  {upstreamLinks.map(link => (
                    <TextLink
                      key={link.label}
                      href={link.href}
                      target="_blank"
                      className="flex items-center gap-1.5 text-sm"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {link.label}
                    </TextLink>
                  ))}
                </div>
              </div>
            </section>

            {/* Tech Stack */}
            <section className="flex flex-col rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className="px-6 py-4">
                <Subheading>Technology Stack</Subheading>
                <Text className="mt-1">Key technologies used in this project.</Text>
              </div>
              <Divider soft />
              <div className="flex-1 px-6 py-5 space-y-4">
                <div>
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Training Engine
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge>Python</Badge>
                    <Badge>PyTorch</Badge>
                    <Badge>Diffusers</Badge>
                    <Badge>OpenCV</Badge>
                  </div>
                </div>
                <div>
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Web UI
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge>Next.js 16</Badge>
                    <Badge>React 19</Badge>
                    <Badge>TypeScript</Badge>
                    <Badge>Tailwind CSS 4</Badge>
                    <Badge>Prisma 7</Badge>
                    <Badge>SQLite</Badge>
                  </div>
                </div>
                <div>
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Infrastructure
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge>Nix Flakes</Badge>
                    <Badge>Docker</Badge>
                    <Badge>CUDA 12.8</Badge>
                    <Badge>GitHub Actions</Badge>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </MainContent>
    </>
  );
}
