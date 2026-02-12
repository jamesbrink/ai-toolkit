import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: {
    // Remove this. Build fails because of route types
    ignoreBuildErrors: true,
  },
  serverActions: {
    bodySizeLimit: '100gb',
  },
};

export default nextConfig;
