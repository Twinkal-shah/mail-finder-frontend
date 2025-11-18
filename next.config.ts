import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // Increase from default 1MB to 10MB for large CSV uploads
    },
  },
  async rewrites() {
    const target = 'http://localhost:8000'
    return [
      { source: '/api/:path*', destination: `${target}/:path*` },
    ]
  },
};

export default nextConfig;
