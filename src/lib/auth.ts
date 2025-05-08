// src/lib/auth.ts
import type { NextAuthOptions } from 'next-auth';
import DiscordProvider from 'next-auth/providers/discord';
import type { JWT } from 'next-auth/jwt';
import type { Session, Account } from 'next-auth';
import type { DiscordProfile } from 'next-auth/providers/discord';

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
    async jwt({ token, account, profile }: { token: JWT; account?: Account; profile?: DiscordProfile }) {
      if (account && profile) {
        token.name = profile.username;
        token.picture = profile.avatar
          ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
          : null;
      }
      return token;
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      if (token.picture) {
        session.user = {
          ...session.user,
          name: token.name as string,
          image: token.picture,
        };
      }
      return session;
    },
  },
};
