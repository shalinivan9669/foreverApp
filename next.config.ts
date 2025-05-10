/** @type {import('next').NextConfig} */
module.exports = {
  // 1) CSP, чтобы ваш фрейм мог рендериться внутри Discord
  async headers() {
    return [
      {
        source: '/discord-activity/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' discord.com",
          },
        ],
      },
    ]
  },

  // 2) Проксируем все запросы /.proxy/... → /api/...
  async rewrites() {
    return [
      {
        source: '/.proxy/:path*',
        destination: '/api/:path*',
      },
    ]
  },
}
