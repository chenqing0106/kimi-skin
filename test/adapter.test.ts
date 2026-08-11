import assert from "node:assert/strict";
import test from "node:test";
import { allowedKimiLocation, scoreProbe } from "../src/adapter.js";
import type { PageProbe } from "../src/types.js";

function probe(overrides: Partial<PageProbe> = {}): PageProbe {
  return {
    href: "app://kimi/work",
    protocol: "app:",
    hostname: "",
    title: "Kimi",
    readyState: "complete",
    hasBody: true,
    hasPage: true,
    hasSidebar: true,
    hasMainPane: true,
    hasConversation: false,
    hasComposer: true,
    ...overrides,
  };
}

test("accepts structural Kimi app pages", () => {
  const result = scoreProbe(probe());
  assert.equal(result.kind, "work");
  assert.equal(result.score, 4);
});

test("rejects unrelated https pages even when selectors match", () => {
  const unrelated = probe({ href: "https://example.com", protocol: "https:", hostname: "example.com" });
  assert.equal(allowedKimiLocation(unrelated), false);
  assert.deepEqual(scoreProbe(unrelated), { score: 0, kind: "unknown" });
});

test("rejects Kimi web pages because Chat is outside the Work theme boundary", () => {
  const web = probe({ href: "https://kimi.com/chat", protocol: "https:", hostname: "kimi.com" });
  assert.equal(allowedKimiLocation(web), false);
  assert.deepEqual(scoreProbe(web), { score: 0, kind: "unknown" });
});

test("requires at least two structural signals", () => {
  const result = scoreProbe(probe({ hasSidebar: false, hasMainPane: false, hasComposer: false }));
  assert.equal(result.kind, "unknown");
  assert.equal(result.score, 1);
});
