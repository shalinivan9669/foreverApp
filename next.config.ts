// next.config.ts
import { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    domains: [
      // сюда может прилетать ваш аватар
      "cdn.discordapp.com",
      "images.discordapp.net",
    ],
  },
};

export default nextConfig;
