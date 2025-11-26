import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
	reactStrictMode: true,
	// Production optimizations
	swcMinify: true,
	// Enable standalone output for Docker deployments
	output: 'standalone',
	// Ensure proper handling of environment variables
	env: {
		CUSTOM_KEY: process.env.CUSTOM_KEY,
	},
	// Security headers
	async headers() {
		return [
			{
				source: '/:path*',
				headers: [
					{
						key: 'X-DNS-Prefetch-Control',
						value: 'on'
					},
					{
						key: 'X-Frame-Options',
						value: 'SAMEORIGIN'
					},
					{
						key: 'X-Content-Type-Options',
						value: 'nosniff'
					},
					{
						key: 'Referrer-Policy',
						value: 'origin-when-cross-origin'
					},
				],
			},
		]
	},
}

export default nextConfig

