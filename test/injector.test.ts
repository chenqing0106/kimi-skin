import assert from "node:assert/strict";
import test from "node:test";
import { injectionExpression } from "../src/injector.js";
import type { LoadedTheme } from "../src/types.js";

function theme(triggerSelector?: string): LoadedTheme {
  return {
    directory: "/theme",
    manifest: {
      id: "pixel-theme",
      name: "Pixel Theme",
      version: "1.0.0",
      compatibleKimi: ["3.1.7"],
      interactions: triggerSelector ? { rootStateToggle: { triggerSelector, state: "ascii" } } : undefined,
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
  assert.match(expression, /else \{\s+root\.removeAttribute\(rootStateAttribute\);\s+delete globalThis\[runtimeKey\];/);
});
