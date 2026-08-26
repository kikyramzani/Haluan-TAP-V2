import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const values = new Map();
const expiries = new Map();
const sortedSets = new Map();
const port = Number(process.env.MOCK_REDIS_PORT || 6381);
const token = process.env.MOCK_REDIS_TOKEN || "tap-local-test-token";
let redisAvailable = true;
const failures = [];

// A fault that never fired makes a test pass for the wrong reason, so every
// firing is counted and the count is readable from the test.
let faultsFired = 0;

// Some races cannot be reached by failing a command: a lease that changes hands
// between reading a code and writing the record has to actually change hands.
// A steal rule rewrites one key immediately before a matching command runs, so
// the script's own ownership guard is what refuses — no injected exception.
const steals = [];
let stealsApplied = 0;

function applySteals(command, payload) {
  const serialised = JSON.stringify(payload);
  const index = steals.findIndex((rule) => rule.command === command && rule.times > 0
    && (!rule.match || serialised.includes(rule.match)));
  if (index < 0) return;
  const rule = steals[index];
  rule.times -= 1;
  if (rule.times <= 0) steals.splice(index, 1);
  values.set(rule.key, rule.value);
  if (rule.ttlMs) expiries.set(rule.key, Date.now() + Number(rule.ttlMs));
  else expiries.delete(rule.key);
  stealsApplied += 1;
}

function nextFailure(command, payload) {
  const serialised = JSON.stringify(payload);
  const index = failures.findIndex((rule) => rule.command === command && rule.times > 0
    && (!rule.match || serialised.includes(rule.match)));
  if (index < 0) return null;
  const rule = failures[index];
  rule.times -= 1;
  if (rule.times <= 0) failures.splice(index, 1);
  faultsFired += 1;
  return rule;
}

let emailAvailable = true;
const emails = [];
const fixtures = new Map([
  ["/fixtures/tiktok.csv", readFileSync(new URL("../fixtures/tiktok.csv", import.meta.url), "utf8")],
  ["/fixtures/shopee.csv", readFileSync(new URL("../fixtures/shopee.csv", import.meta.url), "utf8")],
]);

function activeValue(key) {
  const expiresAt = expiries.get(key);
  if (expiresAt && expiresAt <= Date.now()) {
    values.delete(key);
    expiries.delete(key);
  }
  return values.has(key) ? values.get(key) : null;
}

function execute(input) {
  const [rawCommand, ...args] = input;
  const command = String(rawCommand || "").toUpperCase();
  const storageKey = String(args[0] || "");

  // Tests stop a multi-key mutation after a chosen phase, then assert that the
  // reconciler puts the record and its indexes back into agreement.
  const failure = nextFailure(command, input);
  if (failure) throw new Error(failure.message || `Injected failure for ${command}`);
  applySteals(command, input);

  // Two Lua scripts back the record lock. The mock recognises them by body so
  // the same atomic contract is exercised locally as in the deployed datastore.
  if (command === "EVAL") {
    const script = String(args[0] || "");
    const keyCount = Number(args[1] || 0);
    const keys = args.slice(2, 2 + keyCount).map(String);
    const values_ = args.slice(2 + keyCount).map(String);
    if (script.includes("__delete_if_equals__")) {
      if (activeValue(keys[0]) !== values_[0]) return 0;
      values.delete(keys[0]);
      expiries.delete(keys[0]);
      return 1;
    }
    if (script.includes("__renew_if_equals__")) {
      if (activeValue(keys[0]) !== values_[0]) return 0;
      expiries.set(keys[0], Date.now() + Number(values_[1] || 0));
      return 1;
    }
    if (script.includes("__commit_with_challenge__")) {
      if (activeValue(keys[0]) !== values_[0]) return -1;
      if (activeValue(keys[1]) !== values_[1]) return -2;
      // Every ownership check happens before the first write, so a refusal leaves
      // the code unspent and the other account's claim untouched.
      for (let index = 4; index < keys.length; index += 1) {
        const owner = activeValue(keys[index]);
        if (owner !== null && owner !== values_[index + 1]) return -(100 + index - 4);
      }
      values.delete(keys[1]);
      expiries.delete(keys[1]);
      values.set(keys[2], values_[2]);
      expiries.delete(keys[2]);
      values.set(keys[3], values_[3]);
      expiries.set(keys[3], Date.now() + Number(values_[4] || 0) * 1000);
      // Indexes the record owns are written by the same script, and they outlive
      // the temporary claim they replace, so any expiry on them is dropped.
      for (let index = 4; index < keys.length; index += 1) {
        values.set(keys[index], values_[index + 1]);
        expiries.delete(keys[index]);
      }
      return 1;
    }
    throw new Error("Unsupported mock Redis script");
  }
  if (command === "PING") return "PONG";
  if (command === "GET") return activeValue(storageKey);
  if (command === "MGET") return args.map((item) => activeValue(String(item)));
  if (command === "DEL") {
    const existed = values.delete(storageKey) || sortedSets.delete(storageKey);
    expiries.delete(storageKey);
    return existed ? 1 : 0;
  }
  if (command === "SET") {
    const optionArgs = args.slice(2).map((item) => String(item).toUpperCase());
    if (optionArgs.includes("NX") && activeValue(storageKey) !== null) return null;
    values.set(storageKey, args[1]);
    // Both units matter: leases are set in milliseconds, and ignoring PX made
    // every lock look immortal, which quietly disarmed the takeover tests.
    const seconds = optionArgs.indexOf("EX");
    const millis = optionArgs.indexOf("PX");
    if (seconds >= 0) expiries.set(storageKey, Date.now() + Number(args[seconds + 3]) * 1000);
    else if (millis >= 0) expiries.set(storageKey, Date.now() + Number(args[millis + 3]));
    else expiries.delete(storageKey);
    return "OK";
  }
  if (command === "INCR") {
    const next = Number(activeValue(storageKey) || 0) + 1;
    values.set(storageKey, String(next));
    return next;
  }
  // A claim that must outlive its registration window can only be checked by
  // reading the remaining life of the key, so both units are answerable.
  if (command === "TTL" || command === "PTTL") {
    if (activeValue(storageKey) === null) return -2;
    const expiresAt = expiries.get(storageKey);
    if (!expiresAt) return -1;
    const remainingMs = Math.max(0, expiresAt - Date.now());
    return command === "TTL" ? Math.ceil(remainingMs / 1000) : remainingMs;
  }
  if (command === "EXPIRE") {
    if (activeValue(storageKey) === null) return 0;
    expiries.set(storageKey, Date.now() + Number(args[1]) * 1000);
    return 1;
  }
  if (command === "ZADD") {
    const set = sortedSets.get(storageKey) || new Map();
    const member = String(args[2]);
    const isNew = !set.has(member);
    set.set(member, Number(args[1]));
    sortedSets.set(storageKey, set);
    return isNew ? 1 : 0;
  }
  if (command === "ZREVRANGE") {
    const set = sortedSets.get(storageKey) || new Map();
    const start = Number(args[1]);
    const stop = Number(args[2]);
    const members = [...set.entries()].sort((a, b) => b[1] - a[1]).map(([member]) => member);
    return members.slice(start, stop < 0 ? undefined : stop + 1);
  }
  if (command === "ZCARD") return (sortedSets.get(storageKey) || new Map()).size;
  if (command === "ZREM") {
    const set = sortedSets.get(storageKey) || new Map();
    return set.delete(String(args[1])) ? 1 : 0;
  }
  if (command === "ZRANGEBYSCORE") {
    const set = sortedSets.get(storageKey) || new Map();
    const min = args[1] === "-inf" ? Number.NEGATIVE_INFINITY : Number(args[1]);
    const max = args[2] === "+inf" ? Number.POSITIVE_INFINITY : Number(args[2]);
    return [...set.entries()].filter(([, score]) => score >= min && score <= max).sort((a, b) => a[1] - b[1]).map(([member]) => member);
  }
  if (command === "ZREMRANGEBYSCORE") {
    const set = sortedSets.get(storageKey) || new Map();
    const min = args[1] === "-inf" ? Number.NEGATIVE_INFINITY : Number(args[1]);
    const max = args[2] === "+inf" ? Number.POSITIVE_INFINITY : Number(args[2]);
    let removed = 0;
    for (const [member, score] of set) if (score >= min && score <= max) { set.delete(member); removed += 1; }
    return removed;
  }
  throw new Error(`Unsupported mock Redis command: ${command}`);
}

const server = createServer((request, response) => {
  if (request.url === "/__fail" && request.method === "POST") {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      try {
        const rule = JSON.parse(body || "{}");
        if (rule.reset) failures.length = 0;
        else failures.push({ command: String(rule.command || "").toUpperCase(), times: Number(rule.times || 1), match: rule.match ? String(rule.match) : undefined, message: rule.message });
        response.writeHead(204).end();
      } catch { response.writeHead(400).end(); }
    });
    return;
  }
  if (request.method === "GET" && fixtures.has(request.url || "")) {
    response.writeHead(200, { "content-type": "text/csv; charset=utf-8" }).end(fixtures.get(request.url || ""));
    return;
  }
  if (request.url === "/__reset" && request.method === "POST") {
    values.clear();
    expiries.clear();
    sortedSets.clear();
    emails.length = 0;
    emailAvailable = true;
    // Injected faults are part of the state a test starts from. Leaving them
    // armed let one test's fault fire inside the next one, which is exactly the
    // kind of failure that gets blamed on flakiness.
    failures.length = 0;
    faultsFired = 0;
    steals.length = 0;
    stealsApplied = 0;
    redisAvailable = true;
    response.writeHead(204).end();
    return;
  }
  // Attempt budgets live in fixed hourly buckets, so a code that outlives the
  // bucket it started in gets a fresh budget. Dropping the counters is how a test
  // stands in for that rollover without moving anybody's clock.
  if (request.url === "/__forget-limits" && request.method === "POST") {
    let forgotten = 0;
    for (const storageKey of [...values.keys()]) {
      if (!storageKey.startsWith("tap:v1:limit:")) continue;
      values.delete(storageKey);
      expiries.delete(storageKey);
      forgotten += 1;
    }
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ forgotten }));
    return;
  }
  if (request.url === "/__faults" && request.method === "GET") {
    response.writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ fired: faultsFired, armed: failures.reduce((total, rule) => total + rule.times, 0), stolen: stealsApplied }));
    return;
  }
  if (request.url === "/__steal" && request.method === "POST") {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      try {
        const rule = JSON.parse(body || "{}");
        if (rule.reset) steals.length = 0;
        else steals.push({ command: String(rule.command || "").toUpperCase(), match: rule.match ? String(rule.match) : undefined, key: String(rule.key), value: String(rule.value), ttlMs: rule.ttlMs, times: Number(rule.times || 1) });
        response.writeHead(204).end();
      } catch { response.writeHead(400).end(); }
    });
    return;
  }
  if (request.url === "/__redis-down" && request.method === "POST") {
    redisAvailable = false;
    response.writeHead(204).end();
    return;
  }
  if (request.url === "/__redis-up" && request.method === "POST") {
    redisAvailable = true;
    response.writeHead(204).end();
    return;
  }
  if (request.url === "/__email-down" && request.method === "POST") {
    emailAvailable = false;
    response.writeHead(204).end();
    return;
  }
  if (request.url === "/__email-up" && request.method === "POST") {
    emailAvailable = true;
    response.writeHead(204).end();
    return;
  }
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true }));
    return;
  }
  if (request.url === "/__email" && request.method === "POST") {
    if (!emailAvailable) {
      response.writeHead(503).end();
      return;
    }
    let emailBody = "";
    request.on("data", (chunk) => { emailBody += chunk; });
    request.on("end", () => {
      try {
        emails.push(JSON.parse(emailBody));
        response.writeHead(204).end();
      } catch {
        response.writeHead(400).end();
      }
    });
    return;
  }
  if (request.method === "GET" && request.url?.startsWith("/__emails")) {
    const to = new URL(request.url, `http://127.0.0.1:${port}`).searchParams.get("to");
    const matches = to ? emails.filter((item) => item.email === to) : emails;
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ emails: matches }));
    return;
  }
  if (request.method !== "POST" || request.headers.authorization !== `Bearer ${token}`) {
    response.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }
  if (!redisAvailable) {
    response.writeHead(503, { "content-type": "application/json" }).end(JSON.stringify({ error: "Redis unavailable" }));
    return;
  }
  let body = "";
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    try {
      const result = execute(JSON.parse(body));
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ result }));
    } catch (error) {
      response.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: error instanceof Error ? error.message : "Mock Redis error" }));
    }
  });
});

// Port 0 lets the OS pick a free one, so two suites can run at the same time
// without one of them binding a port the other already holds. The chosen port is
// printed for whoever spawned this.
server.listen(port, "127.0.0.1", () => process.stdout.write(`Mock Redis ready on ${server.address().port}\n`));
