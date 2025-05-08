// next-auth.d.ts (в корне проекта или, лучше, в папке types/)
declare module "next-auth" {
    interface Session {
      user: {
        id: string;
        name?: string | null;
        email?: string | null;
        image?: string | null;
      };
    }
  }
  