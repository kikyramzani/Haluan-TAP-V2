/**
 * Split out of lib/rate-limit.ts so it stays a pure, DB-free import — that
 * file's checkRateLimit() now needs a live Postgres connection at import
 * time (lib/db.ts throws if unconfigured), which would otherwise drag every
 * test that only needs this formatting helper into requiring a database.
 */
export function retryAfterMessage(retryAfterSeconds: number) {
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return minutes > 1 ? `${minutes} menit` : "kurang dari satu menit";
}
