import { redis } from "./redis.ts";

// Ownership keys are handed from one holder to the next. Read-then-delete lets a
// previous owner remove the successor's value in the gap between the two calls,
// so every release compares and deletes inside one script. The tags let the test
// datastore recognise each script by intent rather than by parsing Lua.
const DELETE_IF_EQUALS = '-- __delete_if_equals__\nif redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
const RENEW_IF_EQUALS = '-- __renew_if_equals__\nif redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("pexpire", KEYS[1], ARGV[2]) else return 0 end';
// KEYS: 1 lease, 2 code guard, 3 record, 4 receipt, then one key per index the
// record owns. ARGV mirrors that, offset by the receipt TTL at position 5.
//
// Every check runs before the first write, so a refusal leaves the code unspent
// and nothing else touched. An index is only claimed when it is free or already
// held by this account: a plain SET let a code that was minted before the claim
// expired take an address or a number that now belongs to somebody else.
const COMMIT_WITH_CHALLENGE = [
  '-- __commit_with_challenge__',
  'if redis.call("get", KEYS[1]) ~= ARGV[1] then return -1 end',
  'if redis.call("get", KEYS[2]) ~= ARGV[2] then return -2 end',
  'for i = 5, #KEYS do',
  '  local owner = redis.call("get", KEYS[i])',
  '  if owner and owner ~= ARGV[i + 1] then return -(100 + i - 5) end',
  'end',
  'redis.call("del", KEYS[2])',
  'redis.call("set", KEYS[3], ARGV[3])',
  'redis.call("set", KEYS[4], ARGV[4], "EX", ARGV[5])',
  'for i = 5, #KEYS do redis.call("set", KEYS[i], ARGV[i + 1]) end',
  'return 1',
].join("\n");

/**
 * Deletes a key only while it still holds the expected value.
 *
 * This throws. Swallowing the error here is what made a failed claim release
 * look like a completed one: the caller went on to clear the intent that
 * described the half-done move, leaving two live claims and nothing for the
 * reconciler to find. A caller that genuinely does not care about the outcome
 * must say so by using `tryDeleteIfEquals`.
 */
export async function deleteIfEquals(storageKey: string, expected: string) {
  return Number(await redis<number>("EVAL", DELETE_IF_EQUALS, 1, storageKey, expected) ?? 0) === 1;
}

/** For cleanup whose failure changes nothing, such as releasing an expiring lease. */
export async function tryDeleteIfEquals(storageKey: string, expected: string) {
  try { return await deleteIfEquals(storageKey, expected); }
  catch { return false; }
}

/** Extends a lease only while this holder still owns it. */
export async function renewIfEquals(storageKey: string, expected: string, ttlMs: number) {
  return Number(await redis<number>("EVAL", RENEW_IF_EQUALS, 1, storageKey, expected, ttlMs) ?? 0) === 1;
}

export type ChallengeCommitOutcome =
  | { status: "committed" }
  | { status: "lock_lost" }
  | { status: "challenge_spent" }
  /** Named after the index that is held by another account, so the caller can say which. */
  | { status: "index_conflict"; index: string };

/**
 * Spends a one-time code and writes the record it authorises as a single step.
 * Splitting the two lets a lease change hands in between, which would leave the
 * code gone and the record untouched — the worst of both outcomes for the person
 * holding that code.
 *
 * Indexes that decide who owns an address travel with the record for the same
 * reason. A verification that flipped the record but not the email claim left
 * the claim on its thirty-minute registration expiry, so the account could lose
 * its own address to the next signup; that write does not belong to the
 * housekeeping that follows the commit.
 */
export async function commitWithChallenge(input: {
  lockKey: string;
  lockToken: string;
  challengeGuardKey: string;
  challengeGuardValue: string;
  recordKey: string;
  recordValue: string;
  receiptKey: string;
  receiptValue: string;
  receiptTtlSeconds: number;
  indexes?: Array<{ name: string; storageKey: string; value: string }>;
}): Promise<ChallengeCommitOutcome> {
  const indexes = input.indexes ?? [];
  const result = Number(await redis<number>(
    "EVAL",
    COMMIT_WITH_CHALLENGE,
    4 + indexes.length,
    input.lockKey,
    input.challengeGuardKey,
    input.recordKey,
    input.receiptKey,
    ...indexes.map((index) => index.storageKey),
    input.lockToken,
    input.challengeGuardValue,
    input.recordValue,
    input.receiptValue,
    input.receiptTtlSeconds,
    ...indexes.map((index) => index.value),
  ) ?? -1);
  if (result === 1) return { status: "committed" };
  if (result === -2) return { status: "challenge_spent" };
  if (result <= -100) return { status: "index_conflict", index: indexes[-result - 100]?.name ?? "unknown" };
  return { status: "lock_lost" };
}
