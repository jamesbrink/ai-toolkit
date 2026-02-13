'use client';

import { TopBar, MainContent } from '@/components/layout';
import { Heading, Subheading } from '@/components/catalyst/heading';
import { Text, TextLink } from '@/components/catalyst/text';
import { Badge } from '@/components/catalyst/badge';
import { ExternalLink } from 'lucide-react';

const features = [
  {
    title: 'Apple Silicon (MPS) Training',
    description:
      'Full training support on Apple Silicon Macs. Includes safe MPS patches for torch.cat/stack, float32 VAE decoding, gradual device migration to avoid memory spikes, and auto-detection of MPS-safe defaults in the job creation UI.',
    tags: ['MPS', 'Apple Silicon', 'M-series'],
  },
  {
    title: 'Nix Packaging',
    description:
      'Fully reproducible builds via Nix flakes. Includes derivations for the Python training CLI, Next.js UI, and Docker image. Ships with NixOS and nix-darwin service modules, a Nix overlay for use in other flakes, and a devshell with categorized commands.',
    tags: ['Nix', 'Flakes', 'NixOS', 'Darwin'],
  },
  {
    title: 'Multi-Host Management',
    description:
      'Discover and manage other AI Toolkit instances on your LAN via mDNS. The hub instance proxies all API calls server-side — view remote GPUs, jobs, queues, and datasets from a single dashboard. Supports both auto-discovered and manually added hosts.',
    tags: ['mDNS', 'Networking', 'Proxy'],
  },
  {
    title: 'RunPod Cloud Integration',
    description:
      'Deploy, manage, and monitor RunPod GPU pods directly from the UI. Includes GPU type browser with real-time pricing, one-click deploy, pod lifecycle management (stop/resume/terminate), live GPU utilization, SSH access, and automatic host registration.',
    tags: ['RunPod', 'Cloud GPU', 'Deploy'],
  },
  {
    title: 'Claude AI Assistant',
    description:
      'Integrated Claude chat assistant with dataset-aware tools — analyze quality, detect duplicates, view images, crop faces, delete files, and manage training configs through natural conversation. Supports both API keys and Claude Code OAuth tokens.',
    tags: ['Claude', 'AI', 'Chat'],
  },
  {
    title: 'AI-Powered Captioning',
    description:
      'Batch image captioning via Claude with multiple style presets: descriptive, booru tags, natural language, and trigger word mode. Includes per-image accept/reject, "Apply All", and automatic refusal detection with retry.',
    tags: ['Captions', 'Vision', 'Batch'],
  },
  {
    title: 'Dataset Quality Analysis',
    description:
      'Automated image quality scoring with blur detection (Laplacian variance), brightness/contrast analysis, size validation, and perceptual hash-based near-duplicate detection. Face detection via OpenCV YuNet DNN with automated face cropping for portrait datasets.',
    tags: ['Quality', 'pHash', 'Faces', 'OpenCV'],
  },
  {
    title: 'Enhanced Docker Support',
    description:
      'Production-ready Docker image with CUDA 12.8, Node.js 22, Prisma migrations on startup, SSH server, mDNS, and environment variable persistence for RunPod. Includes docker-compose with GPU passthrough and volume mounts.',
    tags: ['Docker', 'CUDA', 'RunPod'],
  },
  {
    title: 'UI Overhaul',
    description:
      'Responsive three-mode sidebar (mobile drawer, tablet icon rail, desktop full), Tailwind CSS 4.1, skeleton loading states, dark theme with WCAG AA contrast compliance, sortable tables, dataset export/rename, sample image swipe navigation, and comprehensive form controls.',
    tags: ['Responsive', 'Tailwind 4', 'Accessibility'],
  },
  {
    title: 'CI/CD Pipeline',
    description:
      'GitHub Actions workflow with TypeScript type checking, ESLint, Vitest tests, Prettier formatting, and Nix flake checks. Automated Docker image builds with layer caching.',
    tags: ['CI', 'Testing', 'Automation'],
  },
];

const upstreamLinks = [
  { label: 'Ostris AI-Toolkit', href: 'https://github.com/ostris/ai-toolkit' },
  { label: 'Ostris Website', href: 'https://ostris.com' },
  { label: 'Support Ostris', href: 'https://ostris.com/support' },
  { label: 'Discord', href: 'https://discord.gg/VXmU2f5WEU' },
];

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
        <div className="max-w-3xl pb-12 space-y-8">
          {/* Header */}
          <div>
            <Heading level={2}>Kiln Remix</Heading>
            <Text className="mt-2">
              A community fork of{' '}
              <TextLink href="https://github.com/ostris/ai-toolkit" target="_blank">
                Ostris AI-Toolkit
              </TextLink>{' '}
              that adds Nix packaging, Apple Silicon training, multi-host orchestration, RunPod cloud integration,
              Claude AI tools, and a modernized UI. All original training functionality is preserved — Kiln Remix builds
              on top of the upstream project&apos;s core engine.
            </Text>
          </div>

          {/* Features */}
          <div>
            <Subheading level={3} className="text-sm uppercase tracking-wider mb-4">
              What Kiln Remix Adds
            </Subheading>
            <div className="space-y-3">
              {features.map(feature => (
                <div
                  key={feature.title}
                  className="bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{feature.title}</h4>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{feature.description}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {feature.tags.map(tag => (
                      <Badge key={tag} color="zinc">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Upstream Attribution */}
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
            <Subheading level={3} className="mb-2">
              Built on AI-Toolkit by Ostris
            </Subheading>
            <Text className="mb-4">
              Kiln Remix is made possible by the excellent foundation of{' '}
              <TextLink href="https://github.com/ostris/ai-toolkit" target="_blank">
                AI-Toolkit
              </TextLink>
              , created by Ostris, LLC. The core training engine — including LoRA/LoKr/full fine-tuning across FLUX,
              SDXL, SD, WAN, Lumina, CHROMA, CogView4, OmniGen2, and more — is entirely their work. Licensed under MIT.
            </Text>
            <div className="flex flex-wrap gap-3">
              {upstreamLinks.map(link => (
                <TextLink
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  className="flex items-center gap-1.5 text-sm"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {link.label}
                </TextLink>
              ))}
            </div>
          </div>
        </div>
      </MainContent>
    </>
  );
}
