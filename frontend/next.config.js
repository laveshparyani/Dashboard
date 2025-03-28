/**
 * Next.js configuration for the dashboard project
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  typescript: {
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig 