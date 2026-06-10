import type { DefaultSession } from "next-auth";

// Ajoute `id` sur session.user (renseigné dans le callback `session` de auth.ts).
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
