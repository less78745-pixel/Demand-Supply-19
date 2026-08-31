/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        https: false,
        http: false,
        stream: false,
        child_process: false,
      };
      
      // Handle node: protocol imports by stripping the prefix
      // so the fallback above catches them
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, '');
        })
      );
    }
    return config;
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
