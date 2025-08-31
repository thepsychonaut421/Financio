
require('dotenv').config();

import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  experimental: {
    // This is intentionally left empty to satisfy the Next.js config schema
    // and prevent the "unrecognized key" warning for 'allowedDevOrigins',
    // which seems to be injected by the development environment.
  }
};

export default nextConfig;
