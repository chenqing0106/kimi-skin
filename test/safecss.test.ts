import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DEFAULT_SAFE_CSS_LIMITS, SAFE_CSS_CONTRACT, validateSafeCss } from "../src/policy/safe-css.js";
import { loadTheme } from "../src/theme.js";

test("accepts plain visual rules on native selectors", () => {
  const report = validateSafeCss(`
    aside.sidebar { background: #111 !important; color: #eee; }
    .composer textarea { caret-color: gold; }
    ::selection { background: #333; }
  `);
  assert.equal(report.contract, SAFE_CSS_CONTRACT);
  assert.ok(report.ok, JSON.stringify(report.violations, null, 2));
  assert.equal(report.stats.rules, 3);
  assert.equal(report.stats.importantCount, 1);
});

test("allows custom properties anywhere", () => {
  const report = validateSafeCss(`:root { --Bg-Primary: #000 !important; --my-theme-accent: #fff; }`);
  assert.ok(report.ok, JSON.stringify(report.violations, null, 2));
});

test("allows restricted properties inside decorative scopes", () => {
  const report = validateSafeCss(`
    .home-view::before { content: ""; position: absolute; inset: 0; display: block; pointer-events: none; z-index: 1; }
    #kimi-skin-bg { position: fixed; inset: 0; z-index: -1; }
    ::-webkit-scrollbar { width: 8px; }
    aside.sidebar::before, aside.sidebar::after { display: none; }
  `);
  assert.ok(report.ok, JSON.stringify(report.violations, null, 2));
});

test("allows layout inside the owned widget root without widening native controls", () => {
  const allowed = validateSafeCss(`
    #kimi-skin-widgets { width: 280px; pointer-events: none; }
    #kimi-skin-widgets .kimi-skin-widget { display: grid; padding: 12px; }
  `);
  assert.ok(allowed.ok, JSON.stringify(allowed.violations, null, 2));

  const rejected = validateSafeCss(`#kimi-skin-widgets + .composer { display: none; }`);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.violations[0]?.kind, "restricted-outside-decoration");
});

test("allows a state-scoped replacement for the home doodle only", () => {
  const allowed = validateSafeCss(`
    html[data-kimi-skin-state="ascii"] .home-view .doodle { content: url("assets/kimi-ascii.png"); }
  `);
  assert.ok(allowed.ok, JSON.stringify(allowed.violations, null, 2));

  const rejected = validateSafeCss(`
    html[data-kimi-skin-state="ascii"] .composer { content: "hidden"; }
  `);
  assert.equal(rejected.ok, false);
});

test("rejects restricted properties on native controls", () => {
  const report = validateSafeCss(`
    .composer { display: none; }
    aside.sidebar { pointer-events: none; }
  `);
  assert.equal(report.ok, false);
  const restricted = report.violations.filter((v) => v.kind === "restricted-outside-decoration");
  assert.equal(restricted.length, 2);
  assert.match(restricted.map((v) => v.property).join(","), /display/);
  assert.match(restricted.map((v) => v.property).join(","), /pointer-events/);
});

test("mixed selector lists must be fully decorative", () => {
  const report = validateSafeCss(`.composer, .composer::after { display: none; }`);
  assert.equal(report.ok, false);
  assert.equal(report.violations[0]?.kind, "restricted-outside-decoration");
});

test("rejects unknown properties", () => {
  const report = validateSafeCss(`body { behavior: url(x.htc); }`);
  assert.equal(report.ok, false);
  assert.equal(report.violations[0]?.kind, "unknown-property");
});

test("blocks disallowed at-rules but allows local fonts, media, supports and keyframes", () => {
  const report = validateSafeCss(`
    @font-face { font-family: x; src: url("assets/x.woff2") format("woff2"); font-display: swap; }
    @page { margin: 0; }
    @media (max-width: 760px) { .home-view::after { display: none; } }
    @supports (backdrop-filter: blur(1px)) { .composer { backdrop-filter: blur(8px); } }
    @keyframes drift { from { transform: translateX(0); opacity: 0; } to { transform: translateX(10px); opacity: 1; } }
  `);
  assert.equal(report.stats.keyframes, 1);
  assert.deepEqual(
    report.violations.filter((v) => v.kind === "blocked-at-rule").map((v) => v.rule),
    ["@page"],
  );
});

test("respects comment masking and string semicolons", () => {
  const report = validateSafeCss(`
    /* .composer { display: none; } */
    .home-view::before { content: "a;b{c}"; position: absolute; }
  `);
  assert.ok(report.ok, JSON.stringify(report.violations, null, 2));
  assert.equal(report.stats.rules, 1);
});

test("enforces structural limits", () => {
  const tiny = { ...DEFAULT_SAFE_CSS_LIMITS, maxRules: 1, maxValueCharacters: 8 };
  const report = validateSafeCss(`
    a { color: #fff; }
    b { color: #fff; background: url("assets/very-long-path.png"); }
  `, tiny);
  assert.equal(report.ok, false);
  assert.ok(report.violations.some((v) => v.kind === "limit-exceeded" && /规则数/.test(v.message)));
  assert.ok(report.violations.some((v) => v.kind === "limit-exceeded" && /属性值/.test(v.message)));
});

test("loadTheme enforces the contract when the theme declares safe-css", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kimi-skin-safecss-"));
  await writeFile(path.join(dir, "theme.json"), JSON.stringify({
    id: "strict-theme",
    name: "Strict",
    version: "1.0.0",
    compatibleKimi: ["3.1.7"],
    background: "background.png",
    capabilities: ["safe-css"],
  }));
  await writeFile(path.join(dir, "theme.css"), ".composer { display: none; }");
  await writeFile(path.join(dir, "background.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await assert.rejects(loadTheme(dir, "3.1.7"), /safe-css/);
});

test("loadTheme accepts a compliant safe-css theme", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kimi-skin-safecss-ok-"));
  await writeFile(path.join(dir, "theme.json"), JSON.stringify({
    id: "gentle-theme",
    name: "Gentle",
    version: "1.0.0",
    compatibleKimi: ["3.1.7"],
    background: "background.png",
    capabilities: ["safe-css"],
  }));
  await writeFile(path.join(dir, "theme.css"), ":root { --Bg-Primary: #101010 !important; } .composer { background: #181818; }");
  await writeFile(path.join(dir, "background.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const theme = await loadTheme(dir, "3.1.7");
  assert.equal(theme.manifest.id, "gentle-theme");
});
