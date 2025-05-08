// src/app/api/auth/[...nextauth]/route.ts

import NextAuth from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
import type { JWT } from "next-auth/jwt";

export const authOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      // захватываем и идентификацию, и гильдии
      authorization: { params: { scope: "identify guilds" } },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    // Здесь мы сохраняем access_token от Discord в JWT
    async jwt({
      token,
      account,
    }: {
      token: JWT;
      account?: { access_token?: string };
    }) {
      if (account?.access_token) {
       
        token.accessToken = account.access_token;
      }
      return token;
    },

    // Здесь мы расширяем session.user.id и прокидываем токен
    async session({
      session,
      token,
    }: {
      session: any;
      token: JWT & { accessToken?: string };
    }) {
      if (session.user) {
        // стандартное поле id у нас отсутствует, поэтому добавляем
        session.user.id = token.sub!;
      }
      
      session.accessToken = token.accessToken;
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
