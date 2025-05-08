// src/lib/auth.ts
import type { NextAuthOptions } from 'next-auth';
import DiscordProvider from 'next-auth/providers/discord';

export const authOptions: NextAuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, account, profile }) {
      // благодаря декларациям TS теперь знает, что profile is DiscordProfile
      if (account && profile) {
        token.name = profile.username;
        token.picture = profile.avatar
          ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
          : null;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.picture) {
        session.user = {
          ...session.user,
          name: token.name!,
          image: token.picture,
        };
      }
      return session;
    },
  },
};
