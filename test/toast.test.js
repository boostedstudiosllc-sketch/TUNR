import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { errorText, uncaughtText, toastMs, failWith, orNull } from "../src/lib/toast.js";

test("errorText: our own messages as they are, anything else gets what failed + why", () => {
  assert.equal(errorText("Couldn't follow @atlmeets.", new Error("Couldn't follow @atlmeets. (permission denied for table follows)")), "Couldn't follow @atlmeets. (permission denied for table follows)");
  assert.equal(errorText("Couldn't load meets.", new Error("permission denied for table events")), "Couldn't load meets. (permission denied for table events)");
  assert.equal(errorText("Couldn't load meets.", new TypeError("Failed to fetch")), "Couldn't load meets. (no connection)");
  assert.equal(errorText("Couldn't load meets.", { message: "", code: "PGRST301" }), "Couldn't load meets. (PGRST301)");
  assert.equal(errorText("Couldn't load meets.", null), "Couldn't load meets.");
});

test("uncaught failures: shown with the reason, browser noise ignored", () => {
  assert.equal(uncaughtText(new Error("Couldn't load photos. (timeout)")), "Couldn't load photos. (timeout)");
  assert.equal(uncaughtText(new Error("x is not a function")), "Something didn't work. (x is not a function)");
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
    { message: "Couldn't load your garage. (permission denied for table vehicles)", error: true },
    { message: "Couldn't load Taco Tuesday. (timeout)", error: true },
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
