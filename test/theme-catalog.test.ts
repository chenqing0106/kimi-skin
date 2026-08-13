import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { discoverThemes, themeSupportsKimi } from "../src/theme-catalog.js";

async function writeManifest(parent: string, directory: string, id: string, compatibleKimi = ["3.1.7"]): Promise<void> {
  const target = path.join(parent, directory);
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, "theme.json"), JSON.stringify({
    id,
    name: id,
    version: "1.0.0",
    compatibleKimi,
    background: "background.png",
  }));
}

test("discovers valid themes and ignores private template directories", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kimi-skin-catalog-"));
  await writeManifest(root, "dark-side", "dark-side");
  await writeManifest(root, "_template", "template");

  const catalog = await discoverThemes(root);
  assert.deepEqual(catalog.themes.map((theme) => theme.manifest.id), ["dark-side"]);
  assert.deepEqual(catalog.skipped, []);
});

test("reports malformed public theme directories", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kimi-skin-catalog-bad-"));
  await mkdir(path.join(root, "broken"));
  await writeFile(path.join(root, "broken", "theme.json"), "not json");

  const catalog = await discoverThemes(root);
  assert.equal(catalog.themes.length, 0);
  assert.equal(catalog.skipped[0]?.directory, path.join(root, "broken"));
});

test("checks Kimi version compatibility from the manifest", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kimi-skin-catalog-version-"));
  await writeManifest(root, "future", "future", ["9.9.9"]);
  const catalog = await discoverThemes(root);
  const theme = catalog.themes[0];
  assert.ok(theme);
  assert.equal(themeSupportsKimi(theme, "3.1.7"), false);
});

test("prefix wildcard patterns cover patch releases of the same minor", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kimi-skin-catalog-wildcard-"));
  await writeManifest(root, "wild", "wild", ["3.1.*"]);
  const theme = (await discoverThemes(root)).themes[0];
  assert.ok(theme);
  assert.equal(themeSupportsKimi(theme, "3.1.7"), true);
  assert.equal(themeSupportsKimi(theme, "3.1.8"), true);
  assert.equal(themeSupportsKimi(theme, "3.2.0"), false);
  assert.equal(themeSupportsKimi(theme, "3.1"), false, "3.1.* 不应误配两位版本号");
});

test("star pattern still matches every version", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kimi-skin-catalog-star-"));
  await writeManifest(root, "star", "star", ["*"]);
  const theme = (await discoverThemes(root)).themes[0];
  assert.ok(theme);
  assert.equal(themeSupportsKimi(theme, "9.9.9"), true);
});
