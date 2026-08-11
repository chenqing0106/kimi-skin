import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadSurfaceCatalog, surfaceCoverage, surfaceProbeExpression } from "../src/surfaces.js";

const catalogJson = JSON.stringify({
  schemaVersion: 1,
  kimiVersion: "3.1.7",
  capturedAt: "2026-08-11",
  surfaces: [
    { id: "sidebar", selector: "aside.sidebar", required: true },
    { id: "composer", selector: ".composer", required: true },
    { id: "composer-editor", selector: ".composer [contenteditable], .composer textarea", required: true },
    { id: "dialog", selector: "[role=\"dialog\"]", required: false },
  ],
});

async function fixtureCatalog(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kimi-skin-selectors-"));
  await writeFile(path.join(dir, "kimi-3.1.7.json"), catalogJson);
  return dir;
}

test("loads a catalog for a known version and returns null for unknown versions", async () => {
  const dir = await fixtureCatalog();
  const catalog = await loadSurfaceCatalog(dir, "3.1.7");
  assert.ok(catalog);
  assert.equal(catalog.kimiVersion, "3.1.7");
  assert.equal(catalog.surfaces.length, 4);
  assert.equal(await loadSurfaceCatalog(dir, "9.9.9"), null);
});

test("rejects malformed catalogs", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kimi-skin-selectors-bad-"));
  await writeFile(path.join(dir, "kimi-3.1.7.json"), JSON.stringify({ schemaVersion: 2, surfaces: [] }));
  await assert.rejects(loadSurfaceCatalog(dir, "3.1.7"), /schemaVersion/);
});

test("probe expression embeds every surface id and selector", async () => {
  const catalog = await loadSurfaceCatalog(await fixtureCatalog(), "3.1.7");
  assert.ok(catalog);
  const expression = surfaceProbeExpression(catalog);
  assert.match(expression, /aside\.sidebar/);
  assert.match(expression, /composer-editor/);
  assert.match(expression, /getComputedStyle/);
});

test("coverage marks surfaces whose selector alternatives appear in the CSS", async () => {
  const catalog = await loadSurfaceCatalog(await fixtureCatalog(), "3.1.7");
  assert.ok(catalog);
  const css = `
    /* [role="dialog"] { color: red; } 注释里的不算 */
    aside.sidebar { background: #111; }
    .composer   { color: #eee; }
    .composer textarea { caret-color: gold; }
  `;
  const coverage = surfaceCoverage(css, catalog);
  const byId = new Map(coverage.map((entry) => [entry.surface.id, entry.covered]));
  assert.equal(byId.get("sidebar"), true);
  assert.equal(byId.get("composer"), true);
  assert.equal(byId.get("composer-editor"), true, "逗号分支之一命中即算覆盖");
  assert.equal(byId.get("dialog"), false, "注释中的选择器不计入覆盖");
});

test("bundled 3.1.7 catalog is valid and covers the documented required surfaces", async () => {
  const catalog = await loadSurfaceCatalog(path.resolve("src/compatibility"), "3.1.7");
  assert.ok(catalog, "src/compatibility/kimi-3.1.7.json 必须存在");
  const requiredIds = catalog.surfaces.filter((surface) => surface.required).map((surface) => surface.id);
  for (const id of ["page-shell", "sidebar", "main-pane", "home-view", "conversation-view", "user-bubble", "composer", "composer-editor"]) {
    assert.ok(requiredIds.includes(id), `缺少必需表面 ${id}`);
  }
});
