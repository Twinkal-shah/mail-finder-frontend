import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // Increase from default 1MB to 10MB for large CSV uploads
    },
  },
  async rewrites() {
    const target = process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:8000'
    return [
      { source: '/api/:path*', destination: `${target}/api/:path*` },
    ]
  },
};

export default nextConfig;
