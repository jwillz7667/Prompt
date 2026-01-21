/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'promptomize.app',
      },
    ],
  },
}

module.exports = nextConfig
