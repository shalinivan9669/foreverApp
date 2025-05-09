/** @type {import('next').NextConfig} */
module.exports = {
  async headers() {
    return [
      {
        source: '/discord-activity/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self' discord.com" }
        ]
      }
    ];
  }
}
