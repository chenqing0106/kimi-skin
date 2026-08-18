import assert from "node:assert/strict";
import test from "node:test";
import { classifyCodeSignatureFailure, kimiDebugLaunchIssue, kimiIdentityIssue, processStartTime } from "../src/platform/macos.js";

const appPath = "/Applications/Kimi.app";
const pythonCache = `${appPath}/Contents/Resources/resources/daimon-bundle/runtime/python/cpython-3.12/lib/python3.12/json/__pycache__/decoder.cpython-312.pyc`;

test("accepts only the expected Kimi bundle and signing team", () => {
  assert.equal(kimiIdentityIssue({ bundleId: "com.moonshot.kimichat", teamId: "2J9472RW75" }), null);
  assert.match(kimiIdentityIssue({ bundleId: "com.moonshot.kimichat", teamId: "OTHER" }) ?? "", /Team ID/);
  assert.match(kimiIdentityIssue({ bundleId: "example.invalid", teamId: "2J9472RW75" }) ?? "", /Bundle ID/);
});

test("allows only verified CDP versions after maintenance has ended", () => {
  assert.equal(kimiDebugLaunchIssue("3.1.7"), null);
  assert.equal(kimiDebugLaunchIssue("3.1.8"), null);
  assert.match(kimiDebugLaunchIssue("3.1.9") ?? "", /--remote-debugging-port/);
  assert.match(kimiDebugLaunchIssue("3.1.10") ?? "", /停止维护/);
});

test("allows only Python caches generated inside Kimi's bundled runtime", () => {
  const result = classifyCodeSignatureFailure(appPath, [
    `${appPath}: a sealed resource is missing or invalid`,
    `file added: ${pythonCache}`,
  ].join("\n"));

  assert.equal(result.onlyAllowedPythonCaches, true);
  assert.deepEqual(result.allowedPythonCaches, [pythonCache]);
});

test("rejects modified signed resources even when allowed caches also exist", () => {
  const result = classifyCodeSignatureFailure(appPath, [
    `file added: ${pythonCache}`,
    `file modified: ${appPath}/Contents/Resources/app.asar`,
  ].join("\n"));

  assert.equal(result.onlyAllowedPythonCaches, false);
});

test("rejects added files outside Python cache directories", () => {
  const result = classifyCodeSignatureFailure(
    appPath,
    `file added: ${appPath}/Contents/Resources/unexpected.js`,
  );

  assert.equal(result.onlyAllowedPythonCaches, false);
});

test("rejects pyc files outside Kimi's bundled Python runtime", () => {
  const result = classifyCodeSignatureFailure(
    appPath,
    `file added: ${appPath}/Contents/Resources/__pycache__/unexpected.pyc`,
  );

  assert.equal(result.onlyAllowedPythonCaches, false);
});

// ps lstart 的输出随 locale 本地化（zh_CN 下是 "一  8月/10 ..."），
// 进程身份比对要求稳定的 C locale 格式，与子进程区域设置无关。
test("processStartTime returns C-locale format regardless of user locale", { skip: process.platform !== "darwin" }, async () => {
  const original = process.env.LC_ALL;
  process.env.LC_ALL = "zh_CN.UTF-8";
  try {
    const value = await processStartTime(process.pid);
    assert.match(value, /^[A-Z][a-z]{2} +[A-Z][a-z]{2} +\d+ \d{2}:\d{2}:\d{2} \d{4}$/, `收到本地化输出：${value}`);
  } finally {
    if (original === undefined) delete process.env.LC_ALL;
    else process.env.LC_ALL = original;
  }
});
