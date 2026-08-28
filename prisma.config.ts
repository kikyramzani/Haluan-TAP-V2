import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

// The Prisma CLI does not read Next.js's .env.local convention on its own,
// unlike `next dev`/`next build` — load it explicitly so `prisma migrate`/
// `studio` see the same POSTGRES_* values the app uses locally.
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

// CLI-only config (migrate/introspect/studio). The running app never reads
// this file — see lib/db.ts for the runtime client, which uses the pooled
// connection string via a driver adapter.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("POSTGRES_URL_NON_POOLING"),
  },
});
