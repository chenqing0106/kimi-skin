import assert from "node:assert/strict";
import test from "node:test";
import { analyzeContrast } from "../src/policy/contrast.js";

test("flags same-rule ink-on-ink", () => {
  const findings = analyzeContrast(`
    :root { --ink: #2a251b; }
    .btn { color: var(--ink); background: var(--ink); }
  `);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].via, "same-rule");
  assert.equal(findings[0].selector, ".btn");
  assert.ok(findings[0].ratio < 1.1);
});

test("passes paper text on ink block", () => {
  const findings = analyzeContrast(`
    :root { --ink: #2a251b; --paper-card: #faf7ee; }
    .btn { color: var(--paper-card) !important; background: var(--ink) !important; }
  `);
  assert.equal(findings.length, 0);
});

test("flags inherited color from ancestor rule", () => {
  const findings = analyzeContrast(`
    .card { color: #2a251b; }
    .card .badge { background: #2a251b; }
  `);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].via, "inherited");
  assert.equal(findings[0].selector, ".card .badge");
});

test("skips gradient and image backgrounds without guessing", () => {
  const findings = analyzeContrast(`
    .hero { color: #2a251b; background: linear-gradient(#000, #fff); }
    .pic { color: #2a251b; background: #2a251b url("a.png") no-repeat; }
  `);
  assert.equal(findings.length, 0);
});

test("skips unresolvable color values", () => {
  const findings = analyzeContrast(`
    .box * { color: inherit !important; }
    .box { background: #2a251b; }
  `);
  // 不产生比值类告警；unpaired 单边声明提醒另算
  assert.equal(findings.filter((f) => f.via !== "unpaired").length, 0);
});

test("semi-transparent ink on semi-transparent ink is caught via canvas compositing", () => {
  const findings = analyzeContrast(`
    :root { --bg-groundpc: #f3efe4; }
    .tag { color: rgba(42, 37, 27, 0.94); background-color: rgba(42, 37, 27, 0.9); }
  `);
  assert.equal(findings.length, 1);
});

test("resolves nested var chains", () => {
  const findings = analyzeContrast(`
    :root { --a: #2a251b; --b: var(--a); }
    .x { color: var(--b); background: var(--b); }
  `);
  assert.equal(findings.length, 1);
});

test("comma selectors are skipped for inheritance matching", () => {
  const findings = analyzeContrast(`
    .card, .panel { color: #2a251b; }
    .card .badge { background: #2a251b; }
  `);
  // 逗号选择器不做继承匹配；unpaired 单边声明提醒另算
  assert.equal(findings.filter((f) => f.via !== "unpaired").length, 0);
});

test("unpaired: dark block without color declaration is flagged", () => {
  const findings = analyzeContrast(`
    .box { background: #1b1e4e; }
  `);
  const unpaired = findings.filter((f) => f.via === "unpaired");
  assert.equal(unpaired.length, 1);
  assert.equal(unpaired[0].selector, ".box");
});

test("unpaired: paired dark block is not flagged", () => {
  const findings = analyzeContrast(`
    .box { color: #f5f6f2; background: #1b1e4e; }
  `);
  assert.equal(findings.filter((f) => f.via === "unpaired").length, 0);
});

test("unpaired: light background is not flagged", () => {
  const findings = analyzeContrast(`
    .box { background: #f5f6f2; }
  `);
  assert.equal(findings.filter((f) => f.via === "unpaired").length, 0);
});

test("unpaired: pseudo-element and scrollbar selectors are skipped", () => {
  const findings = analyzeContrast(`
    .box::before { background: #1b1e4e; }
    .box::-webkit-scrollbar-thumb { background: #1b1e4e; }
    .page:has(> .home-view) { background: #1b1e4e; }
  `);
  assert.equal(findings.filter((f) => f.via === "unpaired").length, 0);
});

test("hover state inherits color from the same element's base rule", () => {
  const findings = analyzeContrast(`
    :root { --ink: #2a251b; --paper: #faf7ee; }
    .card { color: var(--ink); }
    .card .btn { color: var(--paper) !important; background: var(--ink) !important; }
    .card .btn:hover { background: #443c2c !important; }
  `);
  assert.equal(findings.length, 0);
});

test("hover state without a same-element color rule falls back to ancestor", () => {
  const findings = analyzeContrast(`
    .card { color: #2a251b; }
    .card .btn:hover { background: #443c2c; }
  `);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].via, "inherited");
});
