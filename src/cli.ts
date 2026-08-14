#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readdir, stat } from "node:fs/promises";
import readline from "node:readline/promises";
import process from "node:process";
import { inspectKimiBaseline, isRecordedProcess, kimiIdentityIssue, launchJobPid, launchKimiDebug, launchKimiNormal, listKimiPids, portBelongsToProcessFamily, processStartTime, quitKimi, chooseLoopbackPort, listenerPids, removeLaunchJob, submitLaunchJob } from "./platform/macos.js";
import { CdpSession, isCdpReady, waitForCdp } from "./cdp.js";
import { probeTargets, waitForAcceptedTarget } from "./adapter.js";
import { injectTheme, restoreTarget, themeIsApplied } from "./injector.js";
import { loadTheme } from "./theme.js";
import { discoverThemes, themeSupportsKimi } from "./theme-catalog.js";
import { validateSafeCss } from "./policy/safe-css.js";
import { analyzeContrast, CONTRAST_MIN_RATIO } from "./policy/contrast.js";
import { loadSurfaceCatalog, bumpSurfaceCatalog, markCatalogVerified, surfaceCoverage, surfaceProbeExpression } from "./surfaces.js";
import type { SurfaceCatalog, SurfaceProbeResult } from "./surfaces.js";
import { readFile } from "node:fs/promises";
import { clearRuntimeState, readRuntimeState, stateDirectory, writeRuntimeState } from "./state.js";
import type { RuntimeState } from "./types.js";

const currentFile = fileURLToPath(import.meta.url);
const runtimeDirectory = path.dirname(currentFile);
const projectRoot = path.resolve(path.dirname(currentFile), "..");
const compatibilityDirectory = path.join(runtimeDirectory, "compatibility");
const defaultTheme = path.join(projectRoot, "themes", "dark-side");

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function parsePort(): number {
  const raw = argument("--port");
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`无效端口：${raw ?? "(缺失)"}`);
  return port;
}

async function confirm(question: string): Promise<boolean> {
  if (hasFlag("--yes")) return true;
  if (!process.stdin.isTTY) return false;
  const input = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await input.question(`${question} [y/N] `)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    input.close();
  }
}

async function chooseBundledTheme(kimiVersion: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error("非交互环境必须使用 --theme <目录> 指定主题");
  }
  const catalog = await discoverThemes(path.join(projectRoot, "themes"));
  for (const skipped of catalog.skipped) {
    console.log(`跳过无效主题 ${path.basename(skipped.directory)}：${skipped.reason}`);
  }
  const compatible = catalog.themes.filter((theme) => themeSupportsKimi(theme, kimiVersion));
  if (!compatible.length) throw new Error(`没有支持 Kimi ${kimiVersion} 的可用主题`);

  console.log("\n可用主题\n");
  for (const [index, theme] of compatible.entries()) {
    console.log(`${index + 1}. ${theme.manifest.name}`);
    console.log(`   ${theme.manifest.id} · v${theme.manifest.version}`);
  }

  const input = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const answer = (await input.question("\n请选择主题编号：")).trim();
      const index = Number(answer) - 1;
      const selected = compatible[index];
      if (Number.isInteger(index) && selected) return selected.directory;
      console.log(`请输入 1 到 ${compatible.length} 之间的编号`);
    }
  } finally {
    input.close();
  }
}

async function listBundledThemes(): Promise<void> {
  const baseline = await inspectKimiBaseline();
  const catalog = await discoverThemes(path.join(projectRoot, "themes"));
  console.log(`可用主题   Kimi ${baseline.version}\n`);
  for (const theme of catalog.themes) {
    const supported = themeSupportsKimi(theme, baseline.version);
    console.log(`${supported ? "✓" : "△"} ${theme.manifest.name}`);
    console.log(`  id ${theme.manifest.id} · v${theme.manifest.version} · 支持 ${theme.manifest.compatibleKimi.join(", ")}`);
  }
  if (!catalog.themes.length) console.log("没有发现主题");
  for (const skipped of catalog.skipped) {
    console.log(`✗ ${path.basename(skipped.directory)}：${skipped.reason}`);
  }
}

// doctor 的表面巡检：有调试会话就在活页面上验证表面清单，没有则提示跳过。
// 只读、降级静默——任何一步不可用都只打印原因，不影响 doctor 的基线结论。
async function doctorSurfaceCheck(state: RuntimeState | null, kimiVersion: string): Promise<void> {
  console.log(`\n表面清单   Kimi ${kimiVersion}`);
  const catalog = await loadSurfaceCatalog(compatibilityDirectory, kimiVersion);
  if (!catalog) {
    console.log("  △ 该版本没有兼容清单，跳过（运行 kimi-skin compat bump 可从上一版本继承）");
    return;
  }
  if (catalog.verified !== true) {
    console.log(`  △ 清单尚未在该版本上验证${catalog.derivedFrom ? `（继承自 ${catalog.derivedFrom}）` : ""}；apply 后会自动探测，或手动运行 probe`);
  }
  if (!state || !(await isCdpReady(state.port)) || !(await portBelongsToProcessFamily(state.port, state.kimiPid))) {
    console.log("  ○ Kimi 未在调试模式运行，跳过活页面探测（apply 后 doctor 会自动巡检）");
    return;
  }
  try {
    const targets = await probeTargets(state.port);
    if (!targets.length) {
      console.log("  ○ 未找到 Work Renderer，跳过");
      return;
    }
    const target = targets[0];
    const url = target?.target.webSocketDebuggerUrl;
    if (!url) return;
    const session = new CdpSession(url);
    let results: SurfaceProbeResult[];
    try {
      await session.open();
      results = await session.evaluate<SurfaceProbeResult[]>(surfaceProbeExpression(catalog));
    } finally {
      session.close();
    }
    const missing = results.filter((result) => !result.present);
    const hidden = results.filter((result) => result.present && !result.visible);
    // 条件表面（路由/弹层/无内容时本就不渲染）缺席是正常状态，只报核心表面的缺失。
    const coreMissing = missing.filter((result) => !catalog.surfaces.find((surface) => surface.id === result.id)?.conditional);
    const conditionalAbsent = missing.filter((result) => catalog.surfaces.find((surface) => surface.id === result.id)?.conditional);
    if (coreMissing.length === 0 && hidden.length === 0) {
      console.log(`  ✓ 核心表面全部存在且可见（${results.length - conditionalAbsent.length}/${results.length} 在渲染，${conditionalAbsent.length} 个条件表面当前路由未渲染）`);
      return;
    }
    if (coreMissing.length) {
      console.log(`  ✗ 核心表面缺失：${coreMissing.map((result) => result.id).join(", ")}`);
      console.log("  → Kimi 可能已改版，主题会静默退化；用 probe 看全量，更新兼容清单与主题");
    }
    if (hidden.length) {
      console.log(`  △ 存在但不可见：${hidden.map((result) => result.id).join(", ")}`);
    }
    if (conditionalAbsent.length && coreMissing.length === 0) {
      console.log(`  ○ 条件表面当前未渲染（正常）：${conditionalAbsent.map((result) => result.id).join(", ")}`);
    }
  } catch {
    console.log("  ○ 探测失败（CDP 暂不可用），跳过");
  }
}

// 在活动调试会话里探测清单，返回缺失的核心表面 id；无法探测时返回 null。
// 条件表面（特定路由/状态才渲染）缺席不算缺失。
async function probeCatalogCoreMissing(port: number, catalog: SurfaceCatalog): Promise<string[] | null> {
  if (!(await isCdpReady(port))) return null;
  const targets = await probeTargets(port);
  if (!targets.length) return null;
  const expression = surfaceProbeExpression(catalog);
  const missing = new Set<string>();
  let probed = 0;
  for (const target of targets) {
    const url = target.target.webSocketDebuggerUrl;
    if (!url) continue;
    const session = new CdpSession(url);
    try {
      await session.open();
      const results = await session.evaluate<SurfaceProbeResult[]>(expression);
      probed += 1;
      for (const result of results) {
        const surface = catalog.surfaces.find((entry) => entry.id === result.id);
        if (!result.present && !surface?.conditional) missing.add(result.id);
      }
    } catch {
      // 单个目标暂时不可评估时跳过，等其余目标的结果
    } finally {
      session.close();
    }
  }
  return probed ? [...missing] : null;
}

// probe 通过后回写 verified 标记并打印结论；有缺失时提示需要更新清单。
async function reportCatalogVerification(kimiVersion: string, coreMissing: string[]): Promise<void> {
  if (coreMissing.length === 0) {
    await markCatalogVerified(compatibilityDirectory, kimiVersion, true, new Date().toISOString().slice(0, 10));
    console.log(`表面清单   Kimi ${kimiVersion} 核心表面全部存在，已标记为已验证`);
  } else {
    console.log(`⚠ 表面清单   Kimi ${kimiVersion} 缺失核心表面：${coreMissing.join(", ")}`);
    console.log("  → Kimi 可能已改版，主题会静默退化；请更新兼容清单与对应主题 CSS");
  }
}

// compat bump：Kimi 升级后自动继承上一版本的表面清单。
// 若当前已有该版本的调试会话，立即探测并回写验证结果；否则等下次 apply 自动验证。
async function compatBump(): Promise<void> {
  const override = argument("--version");
  const target = override ?? (await inspectKimiBaseline()).version;
  const existing = await loadSurfaceCatalog(compatibilityDirectory, target);
  if (existing) {
    console.log(`Kimi ${target} 的兼容清单已存在（${existing.verified === true ? "已验证" : "未验证"}${existing.derivedFrom ? `，继承自 ${existing.derivedFrom}` : ""}）`);
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const result = await bumpSurfaceCatalog(compatibilityDirectory, target, today);
  if (!result) return;
  console.log(`已生成 compatibility/kimi-${target}.json（继承自 ${result.derivedFrom}，标记为未验证）`);
  const state = await readRuntimeState();
  if (state && state.kimiVersion === target && (await isCdpReady(state.port))) {
    const catalog = await loadSurfaceCatalog(compatibilityDirectory, target);
    if (!catalog) return;
    const coreMissing = await probeCatalogCoreMissing(state.port, catalog);
    if (coreMissing === null) {
      console.log("○ 未能完成活页面探测，清单保持未验证；下次 apply 后会自动重试");
      return;
    }
    await reportCatalogVerification(target, coreMissing);
  } else {
    console.log("○ 当前没有该版本的调试会话；下次 apply 后会自动探测验证，或手动运行 kimi-skin probe");
  }
}

async function doctor(): Promise<boolean> {
  console.log("Kimi Skin Doctor\n");
  console.log(`平台       ${process.platform} ${process.arch}`);
  console.log(`Node       ${process.version}`);
  if (process.platform !== "darwin") {
    console.log("状态       当前阶段只支持 macOS");
    return false;
  }
  const baseline = await inspectKimiBaseline();
  console.log(`Kimi       ${baseline.version}`);
  console.log(`路径       ${baseline.appPath}`);
  console.log(`Bundle ID  ${baseline.bundleId}`);
  console.log(`Team ID    ${baseline.teamId ?? "无法读取"}`);
  console.log(`签名       ${baseline.signatureValid ? "有效" : "异常"}`);
  console.log(`可执行摘要 ${baseline.executableSha256}`);
  if (baseline.signatureMessage !== "签名验证通过") {
    console.log(`${baseline.signatureValid ? "说明" : "原因"}       ${baseline.signatureMessage}`);
  }
  await doctorSurfaceCheck(await readRuntimeState(), baseline.version);
  const identityIssue = kimiIdentityIssue(baseline);
  if (identityIssue) console.log(`身份       ${identityIssue}`);
  const supported = identityIssue === null && baseline.signatureValid;
  console.log(`\n结论       ${supported ? "可以进入 apply 前置检查" : "阻止 apply，请先处理基线问题"}`);
  return supported;
}

async function status(): Promise<void> {
  const state = await readRuntimeState();
  const pids = await listKimiPids();
  console.log(`Kimi       ${pids.length ? `运行中，PID ${pids.join(", ")}` : "未运行"}`);
  if (!state) {
    console.log("Harness    没有活动状态");
    return;
  }
  const [processMatches, cdpReady, listeners] = await Promise.all([
    isRecordedProcess(state.kimiPid, state.kimiStartedAt),
    isCdpReady(state.port),
    listenerPids(state.port),
  ]);
  console.log(`Harness    ${processMatches ? "记录的 Kimi 仍在运行" : "状态记录已过期"}`);
  console.log(`CDP        127.0.0.1:${state.port} ${cdpReady ? "可连接" : "不可连接"}`);
  console.log(`监听 PID   ${listeners.length ? listeners.join(", ") : "无"}`);
  console.log(`主题       ${state.themeId}`);
  const currentWatcherPid = state.watcherLabel ? await launchJobPid(state.watcherLabel) : null;
  console.log(`Watcher    ${currentWatcherPid ? `运行中，PID ${currentWatcherPid}` : "未运行"}`);
}

async function startWatcher(state: RuntimeState): Promise<{ label: string; pid: number }> {
  const label = `com.kimi-skin.watcher.${state.port}`;
  const logPath = path.join(stateDirectory(), "watcher.log");
  const pid = await submitLaunchJob(
    label,
    process.execPath,
    [currentFile, "_watch", "--port", String(state.port), "--theme", state.themePath],
    logPath,
  );
  if (!pid) {
    await removeLaunchJob(label);
    throw new Error("launchd 已接受任务，但无法确认 Watcher 进程");
  }
  return { label, pid };
}

async function apply(): Promise<void> {
  if (process.platform !== "darwin") throw new Error("当前阶段只支持 macOS");
  const existingState = await readRuntimeState();
  if (existingState) {
    const [recordedStillRunning, cdpReady] = await Promise.all([
      isRecordedProcess(existingState.kimiPid, existingState.kimiStartedAt),
      isCdpReady(existingState.port),
    ]);
    if (cdpReady) {
      if (!recordedStillRunning) {
        throw new Error("CDP 仍可连接，但记录的 Kimi 进程身份已经变化；拒绝连接未知进程，请先运行 status");
      }
      if (!(await portBelongsToProcessFamily(existingState.port, existingState.kimiPid))) {
        throw new Error("CDP 端口不再属于记录的 Kimi 进程树；拒绝继续应用主题");
      }
      console.log("Kimi 已处于主题模式，直接热切换，无需重启");
      await switchTheme();
      return;
    }
    await stopWatcher(existingState.watcherLabel);
    await clearRuntimeState();
    console.log(recordedStillRunning
      ? "原调试会话已失效，将重新启动 Kimi 以恢复主题模式"
      : "已清理过期的 kimi-skin 状态");
  }
  console.log("正在检查 Kimi 与主题…");
  const baseline = await inspectKimiBaseline();
  const identityIssue = kimiIdentityIssue(baseline);
  if (identityIssue) throw new Error(identityIssue);
  if (!baseline.signatureValid) throw new Error(`Kimi 签名基线异常，拒绝启动调试模式：${baseline.signatureMessage}`);
  const explicitTheme = argument("--theme");
  const themePath = explicitTheme ? path.resolve(explicitTheme) : await chooseBundledTheme(baseline.version);
  const theme = await loadTheme(themePath, baseline.version);
  // 先完成端口准备，尽量缩短退出普通 Kimi 后的空窗期。
  const port = await chooseLoopbackPort();
  const existingPids = await listKimiPids();
  const prompt = existingPids.length
    ? "应用主题需要重启当前 Kimi，是否继续？"
    : "将以本机调试模式启动 Kimi 并应用主题，是否继续？";
  if (!(await confirm(prompt))) throw new Error("用户取消操作");

  if (existingPids.length) {
    try {
      await quitKimi();
    } catch (error) {
      throw new Error(
        `无法退出当前 Kimi：${(error as Error).message}\n提示：Kimi 有任务在运行时可能拒绝退出，请先在 Kimi 中停止任务，再重新执行 apply`,
      );
    }
  }
  let kimiPid = 0;
  try {
    kimiPid = await launchKimiDebug(baseline.appPath, port);
    const kimiStartedAt = await processStartTime(kimiPid);
    await waitForCdp(port);
    if (!(await portBelongsToProcessFamily(port, kimiPid))) {
      throw new Error("CDP 端口不属于刚启动的 Kimi 进程树");
    }
    const target = await waitForAcceptedTarget(port);
    await injectTheme(target, theme);
    if (!(await themeIsApplied(target, theme.manifest.id))) throw new Error("主题最终状态验证失败");
    const state: RuntimeState = {
      schemaVersion: 1,
      mode: "debug",
      appPath: baseline.appPath,
      kimiVersion: baseline.version,
      executableSha256: baseline.executableSha256,
      port,
      kimiPid,
      kimiStartedAt,
      watcherPid: null,
      watcherLabel: null,
      themePath,
      themeId: theme.manifest.id,
      createdAt: new Date().toISOString(),
    };
    await writeRuntimeState(state);
    const watcherJob = await startWatcher(state);
    state.watcherPid = watcherJob.pid;
    state.watcherLabel = watcherJob.label;
    await writeRuntimeState(state);
    console.log(`主题 ${theme.manifest.name} 已应用并通过验证`);
    console.log(`CDP 127.0.0.1:${port}，Watcher PID ${watcherJob.pid}`);
    // 版本继承的清单尚未验证时，趁调试会话在场自动探测一次
    const catalog = await loadSurfaceCatalog(compatibilityDirectory, baseline.version);
    if (catalog && catalog.verified !== true) {
      const coreMissing = await probeCatalogCoreMissing(port, catalog);
      if (coreMissing !== null) await reportCatalogVerification(baseline.version, coreMissing);
    }
  } catch (error) {
    console.error(`应用失败，正在恢复普通 Kimi：${(error as Error).message}`);
    try { await quitKimi(); } catch { /* report original failure */ }
    try { await launchKimiNormal(baseline.appPath); } catch { /* report original failure */ }
    await clearRuntimeState();
    throw error;
  }
}

// 主题目录指纹：递归收集所有文件的相对路径 + mtime，任何素材变化都会触发热重载。
async function themeFingerprint(directory: string): Promise<string | null> {
  try {
    const parts: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.isFile()) parts.push(`${full}:${(await stat(full)).mtimeMs}`);
      }
    };
    await walk(directory);
    return parts.sort().join("\n");
  } catch {
    return null;
  }
}

async function watcher(): Promise<void> {
  const port = parsePort();
  const state = await readRuntimeState();
  if (!state || state.port !== port) return;
  const themePath = path.resolve(argument("--theme") ?? state.themePath);
  let theme = await loadTheme(themePath, state.kimiVersion);
  let fingerprint = await themeFingerprint(themePath);
  while (true) {
    const current = await readRuntimeState();
    if (!current || current.port !== port) return;
    // 热重载：主题目录内任何文件（CSS、manifest、图片素材）变更后重新读取并强制重注入
    const currentFingerprint = await themeFingerprint(themePath);
    let forceReinject = false;
    if (currentFingerprint !== null && fingerprint !== null && currentFingerprint !== fingerprint) {
      try {
        theme = await loadTheme(themePath, state.kimiVersion);
        fingerprint = currentFingerprint;
        forceReinject = true;
      } catch {
        // 新内容校验失败时保留旧主题，等下一次保存
      }
    }
    if (await isCdpReady(port)) {
      try {
        const targets = await probeTargets(port);
        for (const target of targets) {
          if (forceReinject || !(await themeIsApplied(target, theme.manifest.id))) {
            try { await injectTheme(target, theme); } catch { /* retry on next poll */ }
          }
        }
      } catch {
        // Renderer rebuilds and route transitions can briefly interrupt CDP.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
}

async function reload(): Promise<void> {
  const state = await readRuntimeState();
  if (!state) throw new Error("没有活动状态，请先 apply");
  if (!(await isCdpReady(state.port))) throw new Error("CDP 不可连接，Kimi 可能不在调试模式运行");
  if (!(await portBelongsToProcessFamily(state.port, state.kimiPid))) {
    throw new Error("CDP 端口不属于记录的 Kimi 进程树，拒绝注入");
  }
  const theme = await loadTheme(state.themePath, state.kimiVersion);
  const targets = await probeTargets(state.port);
  if (!targets.length) throw new Error("没有找到可注入的 Work Renderer");
  for (const target of targets) await injectTheme(target, theme);
  console.log(`主题 ${theme.manifest.name} 已重新注入 ${targets.length} 个目标，无需重启 Kimi`);
}

// 热切换：不重启 Kimi，在同一调试会话内把当前主题换成另一个主题。
// 注入表达式自身会清理旧主题的样式、交互监听与组件 DOM，因此切换等价于
// "换主题路径的 reload"，额外处理 Watcher 迁移与失败回滚。
async function switchTheme(): Promise<void> {
  if (process.platform !== "darwin") throw new Error("当前阶段只支持 macOS");
  const state = await readRuntimeState();
  if (!state) throw new Error("没有活动状态，请先 apply");
  const [recordedStillRunning, cdpReady] = await Promise.all([
    isRecordedProcess(state.kimiPid, state.kimiStartedAt),
    isCdpReady(state.port),
  ]);
  if (!recordedStillRunning || !cdpReady) {
    throw new Error("调试会话已失效，请先运行 status 确认，再 apply 或 restore");
  }
  if (!(await portBelongsToProcessFamily(state.port, state.kimiPid))) {
    throw new Error("CDP 端口不属于记录的 Kimi 进程树，拒绝注入");
  }
  const explicitTheme = argument("--theme");
  const themePath = explicitTheme ? path.resolve(explicitTheme) : await chooseBundledTheme(state.kimiVersion);
  // loadTheme 内含 manifest、兼容性、safe-css 与素材校验，不通过则中止
  const theme = await loadTheme(themePath, state.kimiVersion);
  // 回滚依赖旧主题目录仍可读；读不出来就没有安全回退，直接拒绝切换
  const previousTheme = await loadTheme(state.themePath, state.kimiVersion).catch(() => null);
  if (!previousTheme) throw new Error("无法读取当前主题目录，没有回滚保障，拒绝切换");
  const targets = await probeTargets(state.port);
  if (!targets.length) throw new Error("没有找到可注入的 Work Renderer");

  // 先停旧 Watcher：它按旧主题巡检，切换中途会把旧主题重新注入回去
  await stopWatcher(state.watcherLabel);
  const restartWatcher = async (): Promise<void> => {
    const job = await startWatcher(state);
    state.watcherPid = job.pid;
    state.watcherLabel = job.label;
    await writeRuntimeState(state);
  };
  try {
    for (const target of targets) await injectTheme(target, theme);
  } catch (error) {
    let rolledBack = true;
    try {
      for (const target of targets) await injectTheme(target, previousTheme);
    } catch {
      rolledBack = false;
    }
    try { await restartWatcher(); } catch { /* 原主题仍在，Watcher 可稍后由 restore/apply 重建 */ }
    throw new Error(
      `切换失败：${(error as Error).message}；` +
      (rolledBack ? "已回滚到原主题" : "回滚也失败，请运行 reload 重新注入或 restore 恢复"),
    );
  }

  state.themePath = theme.directory;
  state.themeId = theme.manifest.id;
  state.watcherPid = null;
  state.watcherLabel = null;
  await writeRuntimeState(state);
  await restartWatcher();
  console.log(`主题已切换为 ${theme.manifest.name}（${theme.manifest.id}），无需重启 Kimi`);
}

async function validate(): Promise<void> {
  const themePath = path.resolve(argument("--theme") ?? defaultTheme);
  const baseline = await inspectKimiBaseline();
  const theme = await loadTheme(themePath, baseline.version);
  const cssBytes = Buffer.byteLength(theme.css, "utf8");
  console.log(`主题目录   ${theme.directory}`);
  console.log(`主题       ${theme.manifest.name}（id: ${theme.manifest.id}，v${theme.manifest.version}）`);
  console.log(`声明兼容   ${theme.manifest.compatibleKimi.join(", ")}`);
  console.log(`本机 Kimi  ${baseline.version}，兼容性检查 ✓`);
  console.log(`theme.css  ${(cssBytes / 1024).toFixed(1)} KiB / 上限 200 KiB ✓`);
  console.log(theme.manifest.background
    ? `背景图片   ${theme.manifest.background}，存在且在 10 MiB 以内 ✓`
    : "背景图片   未设置（使用 CSS 背景） ✓");
  console.log(`安全校验   无 @import、远程 URL、-moz-binding 等禁止内容 ✓`);
  console.log(`\n结论       通过。首次启用使用 kimi-skin apply --theme <目录>`);
}

// 主题体检：离线跑 safe-css 契约 + 表面覆盖分析，输出体检报告。
async function checkTheme(): Promise<void> {
  const themePath = path.resolve(argument("--theme") ?? defaultTheme);
  const baseline = await inspectKimiBaseline();
  const theme = await loadTheme(themePath, baseline.version);
  const rawCss = await readFile(path.join(theme.directory, "theme.css"), "utf8");

  console.log(`主题体检   ${theme.manifest.name}（${theme.manifest.id}）\n`);

  const report = validateSafeCss(rawCss);
  console.log(`[safe-css] 契约 ${report.contract}`);
  console.log(
    `  规模       ${report.stats.rules} 条规则 / ${report.stats.declarations} 条声明 / ` +
    `${report.stats.keyframes} 个 @keyframes / ${report.stats.importantCount} 次 !important`,
  );
  const declared = theme.manifest.capabilities?.includes("safe-css") ?? false;
  console.log(`  契约声明   ${declared ? "theme.json 已声明 safe-css，加载时强制执行" : "未声明（体检仅供参考，不拦截）"}`);
  if (report.ok) {
    console.log(`  结论       ✓ 完全符合契约`);
  } else {
    const counts = new Map<string, number>();
    for (const violation of report.violations) counts.set(violation.kind, (counts.get(violation.kind) ?? 0) + 1);
    console.log(`  结论       ✗ ${report.violations.length} 处不符：`);
    for (const [kind, count] of counts) console.log(`             ${kind} × ${count}`);
    const shown = report.violations.slice(0, 20);
    for (const violation of shown) {
      console.log(`             - [${violation.kind}] ${violation.property ?? ""} @ ${violation.rule}`);
    }
    if (report.violations.length > shown.length) console.log(`             … 其余 ${report.violations.length - shown.length} 处从略`);
  }

  const contrastFindings = analyzeContrast(rawCss);
  console.log(`\n[对比度] 启发式（只分析主题内可解析的纯色对，应用层样式不在范围内）`);
  if (!contrastFindings.length) {
    console.log(`  ✓ 未发现文字与底色过近的规则`);
  } else {
    console.log(`  ⚠ ${contrastFindings.length} 处文字与底色对比度低于 ${CONTRAST_MIN_RATIO}:1：`);
    for (const finding of contrastFindings.slice(0, 10)) {
      console.log(
        `    - [${finding.via}] ${finding.selector}：对比度 ${finding.ratio.toFixed(2)}:1` +
        `（color: ${finding.color} / background: ${finding.background}）`,
      );
    }
    if (contrastFindings.length > 10) console.log(`    … 其余 ${contrastFindings.length - 10} 处从略`);
    console.log(`  提示       告警仅供参考；继承自应用层样式的陷阱需用运行时计算样式探测`);
  }

  const catalog = await loadSurfaceCatalog(compatibilityDirectory, baseline.version);
  console.log(`\n[表面覆盖] Kimi ${baseline.version}`);
  if (!catalog) {
    console.log(`  没有 compatibility/kimi-${baseline.version}.json，跳过覆盖分析`);
    return;
  }
  const coverage = surfaceCoverage(rawCss, catalog);
  const missingRequired = coverage.filter((entry) => entry.surface.required && !entry.covered);
  for (const entry of coverage) {
    const mark = entry.covered ? "✓" : entry.surface.required ? "✗ 必需" : "○ 可选";
    console.log(`  ${mark.padEnd(6)} ${entry.surface.id.padEnd(26)} ${entry.surface.note ?? ""}`);
  }
  console.log(
    missingRequired.length
      ? `\n  ✗ ${missingRequired.length} 个必需表面未覆盖：${missingRequired.map((entry) => entry.surface.id).join(", ")}`
      : `\n  ✓ 必需表面全部覆盖（启发式：只表示 CSS 中出现了对应选择器）`,
  );
}

// 活页面探测：在调试会话里逐个验证表面选择器是否仍存在、是否可见。
async function probe(): Promise<void> {
  const state = await readRuntimeState();
  if (!state) throw new Error("没有活动的调试会话。先 apply 一个主题，或在新版本 Kimi 适配时用 probe 检查表面");
  if (!(await isCdpReady(state.port))) throw new Error("CDP 不可连接，Kimi 可能不在调试模式运行");
  if (!(await portBelongsToProcessFamily(state.port, state.kimiPid))) {
    throw new Error("CDP 端口不属于记录的 Kimi 进程树，拒绝探测");
  }
  const catalog = await loadSurfaceCatalog(compatibilityDirectory, state.kimiVersion);
  if (!catalog) throw new Error(`没有 compatibility/kimi-${state.kimiVersion}.json，无法探测该版本；可先运行 kimi-skin compat bump 继承上一版本`);
  const targets = await probeTargets(state.port);
  if (!targets.length) throw new Error("没有找到可探测的 Work Renderer");
  const expression = surfaceProbeExpression(catalog);
  console.log(`表面探测   Kimi ${state.kimiVersion}，清单记录于 ${catalog.capturedAt ?? "未知日期"}\n`);
  const allCoreMissing = new Set<string>();
  let probedTargets = 0;
  for (const target of targets) {
    console.log(`目标       ${target.target.title || target.target.url}`);
    const url = target.target.webSocketDebuggerUrl;
    if (!url) continue;
    const session = new CdpSession(url);
    let results: SurfaceProbeResult[];
    try {
      await session.open();
      results = await session.evaluate<SurfaceProbeResult[]>(expression);
    } finally {
      session.close();
    }
    probedTargets += 1;
    const missing = results.filter((result) => !result.present);
    const coreMissing = missing.filter((result) => !catalog.surfaces.find((entry) => entry.id === result.id)?.conditional);
    for (const result of coreMissing) allCoreMissing.add(result.id);
    for (const result of results) {
      const surface = catalog.surfaces.find((entry) => entry.id === result.id);
      const mark = !result.present
        ? surface?.conditional ? "○ 未渲染" : "✗ 缺失"
        : result.visible ? "✓" : "△ 存在但不可见";
      console.log(`  ${mark.padEnd(12)} ${result.id.padEnd(26)} ${surface?.note ?? ""}`);
    }
    console.log(
      coreMissing.length
        ? `  → ${coreMissing.length} 个核心表面缺失，清单可能需要随 Kimi 版本更新\n`
        : missing.length
          ? `  → 核心表面全部存在；${missing.length} 个条件表面当前路由未渲染（正常）\n`
          : `  → ${results.length}/${results.length} 个表面全部存在\n`,
    );
  }
  if (probedTargets > 0) await reportCatalogVerification(state.kimiVersion, [...allCoreMissing]);
}

async function stopWatcher(label: string | null): Promise<void> {
  if (!label) return;
  if (!/^com\.(?:mornqing\.)?kimi-skin\.watcher\.\d+$/.test(label)) {
    throw new Error(`拒绝停止无法验证身份的 launchd 任务：${label}`);
  }
  await removeLaunchJob(label);
}

async function restore(): Promise<void> {
  const state = await readRuntimeState();
  if (!state) {
    console.log("没有活动的 kimi-skin 状态，无需恢复");
    return;
  }
  const [recordedStillRunning, cdpReady] = await Promise.all([
    isRecordedProcess(state.kimiPid, state.kimiStartedAt),
    isCdpReady(state.port),
  ]);
  if (cdpReady && !recordedStillRunning) {
    throw new Error("CDP 仍可访问，但记录的 Kimi 进程身份已经变化；拒绝结束未知进程，请先检查 status");
  }
  if (cdpReady && !(await portBelongsToProcessFamily(state.port, state.kimiPid))) {
    throw new Error("CDP 端口不再属于记录的 Kimi 进程树；拒绝继续恢复");
  }

  await stopWatcher(state.watcherLabel);
  if (cdpReady) {
    for (const target of await probeTargets(state.port)) await restoreTarget(target);
  }
  if (recordedStillRunning) await quitKimi();
  if ((await listKimiPids()).length === 0) await launchKimiNormal(state.appPath);
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline && await isCdpReady(state.port)) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (await isCdpReady(state.port)) throw new Error("普通模式已启动，但旧 CDP 端口仍然可访问");
  const baseline = await inspectKimiBaseline(state.appPath);
  if (baseline.executableSha256 !== state.executableSha256) {
    throw new Error("Kimi 可执行文件摘要与应用主题前不一致，保留状态记录以供检查");
  }
  await clearRuntimeState();
  console.log("主题已移除，调试端口已关闭，Kimi 已按普通方式启动");
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "help";
  switch (command) {
    case "doctor": process.exitCode = (await doctor()) ? 0 : 2; break;
    case "status": await status(); break;
    case "themes": await listBundledThemes(); break;
    case "apply": await apply(); break;
    case "reload": await reload(); break;
    case "switch": await switchTheme(); break;
    case "restore": await restore(); break;
    case "validate": await validate(); break;
    case "check-theme": await checkTheme(); break;
    case "probe": await probe(); break;
    case "compat":
      if (process.argv[3] === "bump") await compatBump();
      else console.log("用法：kimi-skin compat bump [--version <x.y.z>]   为当前（或指定）Kimi 版本继承上一版表面清单");
      break;
    case "_watch": await watcher(); break;
    default:
      console.log(`用法：
  kimi-skin doctor
  kimi-skin status
  kimi-skin themes
  kimi-skin apply [--theme <目录>] [--yes]
  kimi-skin switch [--theme <目录>]
  kimi-skin reload
  kimi-skin validate [--theme <目录>]
  kimi-skin check-theme [--theme <目录>]
  kimi-skin probe
  kimi-skin compat bump [--version <x.y.z>]
  kimi-skin restore`);
  }
}

main().catch((error) => {
  console.error(`错误：${(error as Error).message}`);
  process.exitCode = 1;
});
