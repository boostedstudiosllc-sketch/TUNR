import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { errorText, uncaughtText, toastMs, failWith, orNull } from "../src/lib/toast.js";

test("errorText: our own messages as they are, anything else gets what failed + why", () => {
  assert.equal(errorText("Couldn't follow @atlmeets.", new Error("Couldn't follow @atlmeets. (you don't have access to that)")), "Couldn't follow @atlmeets. (you don't have access to that)");
  assert.equal(errorText("Couldn't load meets.", new Error("permission denied for table events")), "Couldn't load meets. (you don't have access to that)");
  assert.equal(errorText("Couldn't load meets.", new TypeError("Failed to fetch")), "Couldn't load meets. (no connection)");
  assert.equal(errorText("Couldn't load meets.", { message: "", code: "PGRST301" }), "Couldn't load meets. (you've been signed out. Sign in again)");
  assert.equal(errorText("Couldn't load meets.", null), "Couldn't load meets.");
  assert.equal(errorText("Couldn't load meets.", new Error("No API key found in request")), "Couldn't load meets. (something went wrong on our side)", "a technical sentence isn't passed through");
  assert.equal(errorText("Couldn't load meets.", new Error("You're offline right now.")), "You're offline right now.", "a plain one is");
  assert.equal(uncaughtText(new Error("Too many connections for role authenticator")), "Something didn't work. (TUNR's server is having trouble. Try again in a minute)");
});

test("uncaught failures: shown with the reason, browser noise ignored", () => {
  assert.equal(uncaughtText(new Error("Couldn't load photos. (timeout)")), "Couldn't load photos. (timeout)");
  assert.equal(uncaughtText(new Error("x is not a function")), "Something didn't work. (something went wrong on our side)");
  assert.equal(uncaughtText("plain text"), "Something didn't work. (plain text)");
  const abort = new Error("The user aborted a request.");
  abort.name = "AbortError";
  assert.equal(uncaughtText(abort), null, "cancelling isn't an error");
  assert.equal(uncaughtText(new Error("ResizeObserver loop completed with undelivered notifications.")), null);
  assert.equal(uncaughtText(new Error("Share canceled")), null);
  assert.equal(uncaughtText(undefined), null);
});

test("messages stay up long enough to read", () => {
  assert.equal(toastMs("Saved"), 2400);
  assert.equal(toastMs("Saved", true), 4000, "errors stay longer");
  assert.ok(toastMs("x".repeat(120), true) > 6000);
  assert.equal(toastMs("x".repeat(1000), true), 9000, "but not forever");
});

test("failWith and orNull put the failure on screen", () => {
  const seen = [];
  globalThis.window = { dispatchEvent: (e) => seen.push(e.detail) };
  globalThis.CustomEvent ??= class {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
  failWith("Couldn't load your garage.")(new Error("permission denied for table vehicles"));
  assert.equal(orNull("Couldn't load Taco Tuesday.")(new Error("timeout")), null);
  assert.deepEqual(seen, [
    { message: "Couldn't load your garage. (you don't have access to that)", error: true },
    { message: "Couldn't load Taco Tuesday. (it took too long. Try again)", error: true },
  ]);
  delete globalThis.window;
});

// The rule (CLAUDE.md): a failure a member could notice is never only
// logged. A screen that really should stay quiet says why with "// quiet:"
// on that line or the one before.
test("screens never swallow a failure without saying so", () => {
  const dir = new URL("../src/components/", import.meta.url);
  const files = readdirSync(dir).filter((f) => /\.jsx?$/.test(f)).map((f) => [`src/components/${f}`, readFileSync(new URL(f, dir), "utf8")]);
  files.push(["src/App.jsx", readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")]);
  const SILENT = /\.catch\(\(\)\s*=>\s*(\{\s*\}|null|undefined)\)|\.catch\(\((\w+)\)\s*=>\s*console\.(warn|log|info|error)\([^)]*\)\)|catch\s*(\(\w*\))?\s*\{\s*\}/;
  const offenders = [];
  for (const [name, text] of files) {
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (SILENT.test(line) && !/quiet:/.test(line) && !/quiet:/.test(lines[i - 1] || "") && !/quiet:/.test(lines[i - 2] || "")) offenders.push(`${name}:${i + 1}  ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, [], "Show these failures (failWith / showError / onToast) or mark them // quiet: <why>");
});

// A crashed screen says why in plain words; the technical text goes to the
// admins' app error log, never on screen.
test("a crashed screen shows a plain reason, not the raw error", () => {
  const text = readFileSync(new URL("../src/components/ErrorBoundary.jsx", import.meta.url), "utf8");
  assert.match(text, /errorReason\(error/, "ErrorBoundary.jsx words its reason with errorReason");
  assert.doesNotMatch(text, /String\(error\?\.message/, "and doesn't put error.message on screen");
});
