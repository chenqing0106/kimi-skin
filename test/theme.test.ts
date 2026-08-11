import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadTheme } from "../src/theme.js";

async function fixture(css = "body { color: white; }", directory?: string): Promise<string> {
  const dir = directory ?? await mkdtemp(path.join(os.tmpdir(), "kimi-skin-theme-"));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "theme.json"), JSON.stringify({
    id: "test-theme",
    name: "Test",
    version: "1.0.0",
    compatibleKimi: ["3.1.7"],
    background: "background.png",
  }));
  await writeFile(path.join(dir, "theme.css"), css);
  await writeFile(path.join(dir, "background.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return dir;
}

test("loads a valid local theme", async () => {
  const theme = await loadTheme(await fixture(), "3.1.7");
  assert.equal(theme.manifest.id, "test-theme");
  assert.match(theme.backgroundDataUrl, /^data:image\/png;base64,/);
});

test("loads a theme without a background image", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kimi-skin-theme-css-only-"));
  await writeFile(path.join(directory, "theme.json"), JSON.stringify({
    id: "css-only",
    name: "CSS Only",
    version: "1.0.0",
    compatibleKimi: ["3.1.7"],
  }));
  await writeFile(path.join(directory, "theme.css"), "body { color: white; }");
  const theme = await loadTheme(directory, "3.1.7");
  assert.equal(theme.backgroundDataUrl, undefined);
});

test("loads the declarative pixel mode interaction", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kimi-skin-theme-pixel-mode-"));
  await writeFile(path.join(directory, "theme.json"), JSON.stringify({
    id: "pixel-mode",
    name: "Pixel Mode",
    version: "1.0.0",
    compatibleKimi: ["3.1.7"],
    interactions: { rootStateToggle: { triggerSelector: ".home-view .logo", state: "ascii" } },
  }));
  await writeFile(path.join(directory, "theme.css"), "body { color: white; }");
  const theme = await loadTheme(directory, "3.1.7");
  assert.equal(theme.manifest.interactions?.rootStateToggle?.triggerSelector, ".home-view .logo");
  assert.equal(theme.manifest.interactions?.rootStateToggle?.state, "ascii");
});

test("rejects unknown interaction fields", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kimi-skin-theme-unsafe-interaction-"));
  await writeFile(path.join(directory, "theme.json"), JSON.stringify({
    id: "unsafe-interaction",
    name: "Unsafe Interaction",
    version: "1.0.0",
    compatibleKimi: ["3.1.7"],
    interactions: { rootStateToggle: { triggerSelector: ".home-view .logo", state: "ascii", script: "alert(1)" } },
  }));
  await writeFile(path.join(directory, "theme.css"), "body { color: white; }");
  await assert.rejects(loadTheme(directory, "3.1.7"), /不支持的字段/);
});

test("keeps the pixel mode trigger scoped to one home-view target", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kimi-skin-theme-wide-interaction-"));
  await writeFile(path.join(directory, "theme.json"), JSON.stringify({
    id: "wide-interaction",
    name: "Wide Interaction",
    version: "1.0.0",
    compatibleKimi: ["3.1.7"],
    interactions: { rootStateToggle: { triggerSelector: ".home-view .doodle, body", state: "ascii" } },
  }));
  await writeFile(path.join(directory, "theme.css"), "body { color: white; }");
  await assert.rejects(loadTheme(directory, "3.1.7"), /单个后代选择器/);
});

test("rejects remote CSS imports", async () => {
  await assert.rejects(loadTheme(await fixture('@import "https://example.com/theme.css";'), "3.1.7"), /@import/);
});

test("rejects protocol-relative remote assets", async () => {
  await assert.rejects(loadTheme(await fixture('body { background: url("//example.com/a.png"); }'), "3.1.7"), /URL/);
});

test("rejects incompatible Kimi versions", async () => {
  await assert.rejects(loadTheme(await fixture(), "9.9.9"), /不支持/);
});

test("loads the bundled neutral template", async () => {
  const theme = await loadTheme(path.resolve("themes/_template"), "3.1.7");
  assert.equal(theme.manifest.id, "my-theme");
  assert.equal(theme.backgroundDataUrl, undefined);
});

test("loads the bundled dark-side theme", async () => {
  const theme = await loadTheme(path.resolve("themes/dark-side"), "3.1.7");
  assert.equal(theme.manifest.id, "dark-side");
});

test("rewrites relative url() references to data URLs", async () => {
  const directory = await fixture('body { background: url("assets/dot.png"); }');
  await mkdir(path.join(directory, "assets"));
  await writeFile(path.join(directory, "assets", "dot.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const theme = await loadTheme(directory, "3.1.7");
  assert.match(theme.css, /url\("data:image\/png;base64,/);
  assert.doesNotMatch(theme.css, /url\("assets\//);
});

test("rewrites a local WOFF2 font reference to a data URL", async () => {
  const directory = await fixture('@font-face { font-family: Pixel; src: url("assets/pixel.woff2"); }');
  await mkdir(path.join(directory, "assets"));
  await writeFile(path.join(directory, "assets", "pixel.woff2"), Buffer.from([0x77, 0x4f, 0x46, 0x32]));
  const theme = await loadTheme(directory, "3.1.7");
  assert.match(theme.css, /url\("data:font\/woff2;base64,/);
});

test("rejects missing relative asset references", async () => {
  await assert.rejects(
    loadTheme(await fixture('body { background: url("assets/nope.png"); }'), "3.1.7"),
    /不存在/,
  );
});

test("rejects assets escaping the theme directory", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "kimi-skin-escape-"));
  await writeFile(path.join(parent, "outside.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const directory = await fixture('body { background: url("../outside.png"); }', path.join(parent, "theme"));
  await assert.rejects(loadTheme(directory, "3.1.7"), /之外/);
});

test("rejects absolute local paths", async () => {
  await assert.rejects(
    loadTheme(await fixture('body { background: url("/etc/passwd"); }'), "3.1.7"),
    /绝对路径/,
  );
});

test("keeps data URLs and fragment references untouched", async () => {
  const css = 'a { background: url("data:image/png;base64,iVBORw0KGgo="); } b { filter: url("#glow"); }';
  const theme = await loadTheme(await fixture(css), "3.1.7");
  assert.match(theme.css, /url\("data:image\/png;base64,iVBORw0KGgo="\)/);
  assert.match(theme.css, /url\("#glow"\)/);
});
