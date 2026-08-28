import assert from "node:assert/strict";
import test from "node:test";
import { hashIp } from "../lib/hash-ip.ts";

test("hashIp tidak pernah mengembalikan IP mentah", () => {
  const hashed = hashIp("203.0.113.42");
  assert.notEqual(hashed, "203.0.113.42");
  assert.match(hashed, /^[0-9a-f]{64}$/);
});

test("hashIp deterministik untuk IP dan salt yang sama", () => {
  assert.equal(hashIp("203.0.113.42"), hashIp("203.0.113.42"));
});

test("hashIp menghasilkan nilai berbeda untuk IP berbeda", () => {
  assert.notEqual(hashIp("203.0.113.42"), hashIp("203.0.113.43"));
});
