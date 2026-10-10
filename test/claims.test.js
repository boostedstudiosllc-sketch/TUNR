import test from "node:test";
import assert from "node:assert/strict";
import { claimHandle } from "../src/lib/claims.js";

test("a claim goes to the handle the organizer gave, details first", () => {
  assert.equal(claimHandle({ kind: "claim", contact: "mike@gmail.com", details: "@YNWA.atl" }), "ynwa.atl");
  assert.equal(claimHandle({ kind: "claim", contact: "@crew_one", details: "" }), "crew_one");
  assert.equal(claimHandle({ kind: "claim", contact: "x@y.com", details: "it's https://www.instagram.com/speedgate/" }), "speedgate");
});

test("a bare word, phone number or email is nobody's handle", () => {
  assert.equal(claimHandle({ kind: "claim", contact: "4045551234", details: "mike" }), null);
  assert.equal(claimHandle({ kind: "claim", contact: "mike@gmail.com", details: "" }), null);
});

test("only claims get an invite", () => {
  assert.equal(claimHandle({ kind: "remove", contact: "@crew_one" }), null);
});
