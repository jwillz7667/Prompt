/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'promptomize.com',
      },
    ],
  },
}

module.exports = nextConfig
