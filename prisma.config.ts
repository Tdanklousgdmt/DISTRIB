import { config as dotenvConfig } from "dotenv";
import { defineConfig } from "prisma/config";

// Charge .env.local (convention Next.js) puis .env en fallback.
// Prisma ne lit pas .env.local par défaut — il faut le faire manuellement ici.
dotenvConfig({ path: ".env.local" });
dotenvConfig();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
