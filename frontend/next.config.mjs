/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Rewrites only needed in development (local proxy to backend).
  // In production (Vercel), NEXT_PUBLIC_API_URL env var points directly to the tunnel.
  async rewrites() {
    // Skip rewrites when NEXT_PUBLIC_API_URL is set (production/Vercel)
    if (process.env.NEXT_PUBLIC_API_URL) {
      return [];
    }
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:8000/api/:path*',
      },
      {
        source: '/analyze/:path*',
        destination: 'http://127.0.0.1:8000/analyze/:path*',
      },
      {
        source: '/chat',
        destination: 'http://127.0.0.1:8000/chat',
      },
      {
        source: '/export/:path*',
        destination: 'http://127.0.0.1:8000/export/:path*',
      },
      {
        source: '/simulate/:path*',
        destination: 'http://127.0.0.1:8000/simulate/:path*',
      },
      {
        source: '/health',
        destination: 'http://127.0.0.1:8000/health',
      },
    ];
  },
};

export default nextConfig;
