import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      'posthog-js': 'posthog-js/dist/module.slim.no-external.js',
    },
  },
}

export default nextConfig
