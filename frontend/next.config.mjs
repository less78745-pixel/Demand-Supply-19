/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Increase proxy timeout for heavy ML computation endpoints
  serverRuntimeConfig: {
    proxyTimeout: 300000, // 5 minutes
  },
  // In development, proxy /api/v1/* to local FastAPI at port 8000
  // In production (Vercel), the /api/* path is handled by Python serverless function via vercel.json
  async rewrites() {
    if (process.env.NODE_ENV === 'production') {
      return [];
    }
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:8000/api/:path*',
      },
      {
        source: '/health',
        destination: 'http://127.0.0.1:8000/health',
      },
    ];
  },
};

export default nextConfig;
