import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      'posthog-js': 'posthog-js/dist/module.slim.no-external.js',
    }
    return config
  },
}

export default nextConfig
