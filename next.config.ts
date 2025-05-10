/** @type {import('next').NextConfig} */
module.exports = {
  // 1) Прокси /.proxy/* → /api/* для того, чтобы внутри iframe
  //    вы могли писать fetch('/.proxy/api/...') и Next.js попадал в ваш
  //    код API Route под app/api/...
  async rewrites() {
    return [
      {
        source: '/.proxy/:path*',
        destination: '/api/:path*',
      },
    ];
  },

  // 2) CSP, чтобы Discord позволил вам грузить ваше приложение в iframe
  async headers() {
    return [
      {
        source: '/(.*)',   // можно делать уже конкретнее, но для начала —
        headers: [
          {
            key: 'Content-Security-Policy',
            // Включаем свой домен (self) и домен Discord
            // И подключаем прокси, чтобы ваши fetch() не блокировались
            value: [
              "default-src 'self'",
              "frame-ancestors 'self' https://discord.com",
              "connect-src 'self' https://*.vercel.app https://discord.com https://canary.discord.com https://ptb.discord.com",
              "img-src 'self' blob: data: https://cdn.discordapp.com https://media.discordapp.net",
            ].join('; '),
          },
        ],
      },
    ];
  },
}
