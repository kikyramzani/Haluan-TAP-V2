import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The mock datastore recognises each script by its tag and then reimplements the
 * semantics in JavaScript, which means the E2E suite can stay green while the Lua
 * that production actually runs says something else. This file closes that gap:
 * a real `redis-server` executes the real script text, reached through the same
 * `redis()` transport the application uses, so KEYS/ARGV construction and outcome
 * mapping are exercised too — not just the branch table.
 */
// Reaching a real server by port is not safe enough for a test that clears the
// datastore: a fixed port that is already taken means the child fails to bind
// while PING still answers — from somebody else's Redis, which then gets flushed.
// A unix socket in a private temp directory can only ever be this test's server,
// and TCP is switched off entirely so no port is involved.
const socketDir = mkdtempSync(join(tmpdir(), "tap-contract-redis-"));
const socketPath = join(socketDir, "redis.sock");

function redisCli(args) {
  return execFileSync("redis-cli", ["-s", socketPath, ...args.map(String)], { encoding: "utf8" }).trim();
}

let server;
let bridge;

before(async () => {
  try { execFileSync("redis-server", ["--version"], { encoding: "utf8" }); }
  catch {
    throw new Error("redis-server is required for the atomic contract test (macOS: brew install redis; CI: apt-get install -y redis-server)");
  }
  server = spawn("redis-server", ["--port", "0", "--unixsocket", socketPath, "--save", "", "--appendonly", "no"], { stdio: "ignore" });

  // A REST facade over that server, so lib/redis.ts can talk to it unchanged. The
  // port is whatever the OS hands out, so parallel runs cannot collide either.
  bridge = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      try {
        const result = redisCli(JSON.parse(body));
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ result: result === "" ? null : result }));
      } catch (error) {
        response.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: String(error) }));
      }
    });
  });
  await new Promise((resolve) => bridge.listen(0, "127.0.0.1", resolve));
  process.env.KV_REST_API_URL = `http://127.0.0.1:${bridge.address().port}`;
  process.env.KV_REST_API_TOKEN = "contract-test";

  for (let attempt = 0; attempt < 50 && server.exitCode === null; attempt += 1) {
    try { if (redisCli(["PING"]) === "PONG") return; } catch { /* still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`redis-server did not answer PING on ${socketPath}`);
});

after(async () => {
  await new Promise((resolve) => bridge?.close(resolve));
  if (server && server.exitCode === null) {
    const stopped = new Promise((resolve) => server.once("exit", resolve));
    server.kill("SIGTERM");
    await stopped;
  }
  rmSync(socketDir, { recursive: true, force: true });
});

const { commitWithChallenge, deleteIfEquals, renewIfEquals } = await import("../lib/atomic.ts");

const lockKey = "contract:lock";
const guardKey = "contract:guard";
const recordKey = "contract:record";
const receiptKey = "contract:receipt";
const emailKey = "contract:email";
const phoneKey = "contract:phone";

function commit(overrides = {}) {
  return commitWithChallenge({
    lockKey,
    lockToken: "token-a",
    challengeGuardKey: guardKey,
    challengeGuardValue: "guard-a",
    recordKey,
    recordValue: '{"id":"owner"}',
    receiptKey,
    receiptValue: '{"v":1}',
    receiptTtlSeconds: 60,
    indexes: [
      { name: "email", storageKey: emailKey, value: "owner" },
      { name: "phone", storageKey: phoneKey, value: "owner" },
    ],
    ...overrides,
  });
}

function arrange({ lock = "token-a", guard = "guard-a", email = null, phone = null } = {}) {
  redisCli(["FLUSHDB"]);
  if (lock) redisCli(["SET", lockKey, lock]);
  if (guard) redisCli(["SET", guardKey, guard]);
  if (email) redisCli(["SET", emailKey, email]);
  if (phone) redisCli(["SET", phoneKey, phone]);
}

function untouched() {
  assert.equal(redisCli(["EXISTS", recordKey]), "0", "record must not be written");
  assert.equal(redisCli(["EXISTS", receiptKey]), "0", "receipt must not be written");
  assert.equal(redisCli(["GET", guardKey]), "guard-a", "code must not be spent");
}

test("commit writes the record, spends the code, and makes both claims permanent", async () => {
  arrange();
  assert.deepEqual(await commit(), { status: "committed" });
  assert.equal(redisCli(["GET", recordKey]), '{"id":"owner"}');
  assert.equal(redisCli(["EXISTS", guardKey]), "0");
  assert.equal(redisCli(["GET", emailKey]), "owner");
  assert.equal(redisCli(["GET", phoneKey]), "owner");
  // A claim that kept an expiry would hand the address to the next signup.
  assert.equal(redisCli(["TTL", emailKey]), "-1");
  assert.equal(redisCli(["TTL", phoneKey]), "-1");
  assert.ok(Number(redisCli(["TTL", receiptKey])) > 0, "receipt must expire");
});

test("a claim this account already holds is simply extended", async () => {
  arrange({ email: "owner", phone: "owner" });
  redisCli(["EXPIRE", emailKey, "60"]);
  assert.deepEqual(await commit(), { status: "committed" });
  assert.equal(redisCli(["TTL", emailKey]), "-1");
});

test("a lease that moved on is refused and nothing is written", async () => {
  arrange({ lock: "token-rival" });
  assert.deepEqual(await commit(), { status: "lock_lost" });
  untouched();
});

test("a code already spent is refused and nothing is written", async () => {
  arrange({ guard: "guard-other" });
  assert.deepEqual(await commit(), { status: "challenge_spent" });
  assert.equal(redisCli(["EXISTS", recordKey]), "0");
  assert.equal(redisCli(["EXISTS", receiptKey]), "0");
});

test("an email held by another account is refused, named, and left alone", async () => {
  arrange({ email: "rival" });
  assert.deepEqual(await commit(), { status: "index_conflict", index: "email" });
  assert.equal(redisCli(["GET", emailKey]), "rival", "the other account keeps its claim");
  assert.equal(redisCli(["EXISTS", phoneKey]), "0", "no index is written when one conflicts");
  untouched();
});

test("a phone held by another account is refused and named", async () => {
  arrange({ phone: "rival" });
  assert.deepEqual(await commit(), { status: "index_conflict", index: "phone" });
  assert.equal(redisCli(["GET", phoneKey]), "rival");
  assert.equal(redisCli(["EXISTS", emailKey]), "0");
  untouched();
});

test("compare-and-delete only removes the value it was given", async () => {
  arrange();
  assert.equal(await deleteIfEquals(lockKey, "token-rival"), false);
  assert.equal(redisCli(["GET", lockKey]), "token-a", "another holder's value survives");
  assert.equal(await deleteIfEquals(lockKey, "token-a"), true);
  assert.equal(redisCli(["EXISTS", lockKey]), "0");
});

test("lease renewal only extends the holder that still owns it", async () => {
  arrange();
  redisCli(["PEXPIRE", lockKey, "500"]);
  assert.equal(await renewIfEquals(lockKey, "token-rival", 60_000), false);
  assert.ok(Number(redisCli(["PTTL", lockKey])) <= 500);
  assert.equal(await renewIfEquals(lockKey, "token-a", 60_000), true);
  assert.ok(Number(redisCli(["PTTL", lockKey])) > 500);
});
