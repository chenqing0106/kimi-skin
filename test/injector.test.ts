import assert from "node:assert/strict";
import test from "node:test";
import { injectionExpression } from "../src/injector.js";
import { normalizeKimiWorkQuota } from "../src/widgets.js";
import type { LoadedTheme, ThemeWidget } from "../src/types.js";

function theme(triggerSelector?: string, widgets?: ThemeWidget[]): LoadedTheme {
  return {
    directory: "/theme",
    manifest: {
      id: "pixel-theme",
      name: "Pixel Theme",
      version: "1.0.0",
      compatibleKimi: ["3.1.7"],
      interactions: triggerSelector ? { rootStateToggle: { triggerSelector, state: "ascii" } } : undefined,
      widgets,
    },
    css: "body { color: white; }",
    backgroundDataUrl: undefined,
  };
}

test("root state injection is declarative and uses a fixed double-click handler", () => {
  const expression = injectionExpression(theme('.home-view [data-logo="kimi"]'));
  assert.match(expression, /addEventListener\('dblclick'/);
  assert.match(expression, /data-kimi-skin-state/);
  assert.match(expression, /const rootState = "ascii";/);
  assert.match(expression, /\.home-view \[data-logo=\\"kimi\\"\]/);
  assert.doesNotMatch(expression, /alert\(1\)/);
});

test("themes without a root state toggle do not supply a trigger selector", () => {
  const expression = injectionExpression(theme());
  assert.match(expression, /const rootStateSelector = null;/);
  assert.match(expression, /else \{\s+root\.removeAttribute\(rootStateAttribute\);\s+\}/);
  assert.doesNotMatch(expression, /getDatasourceQuota/);
});

test("quota widget uses only the fixed bridge and owned home slot", () => {
  const expression = injectionExpression(theme(undefined, [
    { id: "work-quota", type: "kimi-work-quota", surface: "home.top-right" },
  ]));
  assert.match(expression, /globalThis\.kimiAgentAPI/);
  assert.match(expression, /getDatasourceQuota/);
  assert.match(expression, /querySelector\('\.home-view'\)/);
  assert.match(expression, /kimi-skin-widgets/);
  assert.match(expression, /60_000/);
  assert.doesNotThrow(() => new Function(`return ${expression}`));
});

test("normalizes and clamps Kimi Work quota responses", () => {
  assert.deepEqual(normalizeKimiWorkQuota({
    creditUsedRatio: 0.0253,
    resetAt: "2026-09-10T12:00:00.000Z",
    isHighestLevel: true,
  }), {
    usedRatio: 0.0253,
    resetAt: "2026-09-10T12:00:00.000Z",
    isHighestLevel: true,
  });
  assert.equal(normalizeKimiWorkQuota({ creditUsedRatio: "bad" }), null);
  assert.equal(normalizeKimiWorkQuota({ creditUsedRatio: 2 })?.usedRatio, 1);
});
