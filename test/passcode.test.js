import test from "node:test";
import assert from "node:assert/strict";
import {
  PASSCODE_LENGTH,
  isCompletePasscode,
  normalizePasscode,
  redeemMessage,
} from "../src/lib/passcode.js";

test("normalizePasscode uppercases and strips separators", () => {
  assert.equal(normalizePasscode("abc-234"), "ABC234");
  assert.equal(normalizePasscode(" k9 h2 m4 "), "K9H2M4");
});

test("normalizePasscode folds characters the generator never emits", () => {
  // The generator omits 0/O and 1/I/L; typing either form should still match.
  assert.equal(normalizePasscode("0AB1CD"), "OABICD");
  assert.equal(normalizePasscode("LAB0CD"), "IABOCD");
});

test("normalizePasscode trims to the code length", () => {
  assert.equal(normalizePasscode("ABCDEFGHIJ").length, PASSCODE_LENGTH);
  assert.equal(normalizePasscode("ABCDEFGHIJ"), "ABCDEF");
});

test("normalizePasscode handles empty and non-string input", () => {
  assert.equal(normalizePasscode(""), "");
  assert.equal(normalizePasscode(null), "");
  assert.equal(normalizePasscode(undefined), "");
  assert.equal(normalizePasscode("!!!"), "");
});

test("isCompletePasscode only accepts a full-length code", () => {
  assert.equal(isCompletePasscode("K9H2M4"), true);
  assert.equal(isCompletePasscode("k9-h2-m4"), true);
  assert.equal(isCompletePasscode("K9H2M"), false);
  assert.equal(isCompletePasscode(""), false);
});

test("redeemMessage returns null only on success", () => {
  assert.equal(redeemMessage("ok"), null);
  assert.notEqual(redeemMessage("invalid"), null);
});

test("redeemMessage maps each backend status to its own copy", () => {
  const statuses = ["invalid", "not_found", "not_signed_in", "passcode_disabled", "rate_limited"];
  const messages = statuses.map(redeemMessage);
  assert.equal(new Set(messages).size, statuses.length);
  messages.forEach((m) => assert.equal(typeof m, "string"));
});

test("redeemMessage falls back for an unrecognised status", () => {
  assert.equal(typeof redeemMessage("something_new"), "string");
  assert.equal(typeof redeemMessage(undefined), "string");
});
