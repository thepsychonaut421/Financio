import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  // Force rebuild to resolve EADDRINUSE error
  // This comment is to force a rebuild
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
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.ebayimg.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
