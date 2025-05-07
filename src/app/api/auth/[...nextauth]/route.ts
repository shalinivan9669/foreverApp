// src/app/api/auth/[...nextauth]/route.ts

// 1) Мы НЕ указываем `edge`-runtime, а отдаем по умолчанию Node.js-функцию.
//    Если вы хотите явно — можете здесь написать `export const runtime = 'nodejs';`,
//    но для Node.js–runtime это необязательно.

import NextAuth, {
    type NextAuthOptions,
    type Session,
    type Account
  } from 'next-auth';
  import DiscordProvider, {
    type DiscordProfile
  } from 'next-auth/providers/discord';
  import type { JWT } from 'next-auth/jwt';
  
  export const authOptions: NextAuthOptions = {
    // 2) Указываем провайдер Discord
    providers: [
      DiscordProvider({
        clientId: process.env.DISCORD_CLIENT_ID!,
        clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      }),
    ],
    // 3) Секрет для подписи JWT
    secret: process.env.NEXTAUTH_SECRET,
    // 4) Храним сессию в JWT-токене
    session: { strategy: 'jwt' },
    callbacks: {
      // 5) В jwt-callback кладем username и картинку
      async jwt({ token, account, profile }: { token: JWT; account?: Account; profile?: DiscordProfile }) {
        if (account && profile) {
          token.name = profile.username;
          token.picture = profile.avatar
            ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
            : null;
        }
        return token;
      },
      // 6) В session-callback прокидываем картинку и имя в session.user
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
  
  // 7) Единый handler на GET и POST
  const handler = NextAuth(authOptions);
  export { handler as GET, handler as POST };
  