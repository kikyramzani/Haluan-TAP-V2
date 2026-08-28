import { createHash } from "node:crypto";

/**
 * A raw IP must never reach persistent storage (LinkClick.ipHash,
 * RateLimitBucket.identity) — this is the one place that boundary is
 * enforced. Salted so a hash alone can't be reversed by a rainbow table even
 * given the small IPv4 address space.
 */
export function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT ?? "";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}
