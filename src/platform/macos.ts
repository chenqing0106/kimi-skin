import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import net from "node:net";
import type { KimiBaseline } from "../types.js";

const execFileAsync = promisify(execFile);
const PLIST_BUDDY = "/usr/libexec/PlistBuddy";
const EXPECTED_KIMI_BUNDLE_ID = "com.moonshot.kimichat";
const EXPECTED_KIMI_TEAM_ID = "2J9472RW75";
const VERIFIED_CDP_KIMI_VERSIONS = new Set(["3.1.7", "3.1.8"]);

export function kimiIdentityIssue(identity: Pick<KimiBaseline, "bundleId" | "teamId">): string | null {
  if (identity.bundleId !== EXPECTED_KIMI_BUNDLE_ID) {
    return `Bundle ID 不符合预期：${identity.bundleId}`;
  }
  if (identity.teamId !== EXPECTED_KIMI_TEAM_ID) {
    return `Team ID 不符合预期：${identity.teamId ?? "无法读取"}`;
  }
  return null;
}

// 项目停止维护后只允许实际验证过的版本，避免未知新版再次重启 Kimi 后才失败。
// Kimi 3.1.9 的打包主进程已确认会检查 argv，并在发现 --remote-debugging-port 时直接退出。
export function kimiDebugLaunchIssue(version: string): string | null {
  if (VERIFIED_CDP_KIMI_VERSIONS.has(version)) return null;
  if (version === "3.1.9") {
    return `Kimi ${version} 会在打包运行时拒绝 kimi-skin 所需的 --remote-debugging-port，当前基于 CDP 的主题模式不可用。已在重启前停止操作，未改动 Kimi.app`;
  }
  return `Kimi ${version} 未经 kimi-skin 验证。项目已停止维护，为避免影响正常 Kimi，已在重启前停止操作；最后验证支持的版本为 3.1.7、3.1.8`;
}

interface CodeSignatureFailure {
  kind: "added" | "modified" | "missing";
  file: string;
}

export interface CodeSignatureFailureClassification {
  failures: CodeSignatureFailure[];
  allowedPythonCaches: string[];
  onlyAllowedPythonCaches: boolean;
}

// Kimi 自带的 Python 运行时会在首次使用后把 .pyc 写回 App 包。
// 这些文件不在签名资源清单里，因此 codesign 的整包校验会报告 "file added"；
// 已签名文件被修改/删除，或其他位置出现新增文件，仍然必须视为异常。
export function classifyCodeSignatureFailure(appPath: string, output: string): CodeSignatureFailureClassification {
  const failures: CodeSignatureFailure[] = [];
  const pattern = /^file (added|modified|missing): (.+)$/gm;
  for (const match of output.matchAll(pattern)) {
    failures.push({
      kind: match[1] as CodeSignatureFailure["kind"],
      file: match[2] ?? "",
    });
  }

  const pythonRuntime = path.join(
    path.resolve(appPath),
    "Contents",
    "Resources",
    "resources",
    "daimon-bundle",
    "runtime",
    "python",
  );
  const allowedPythonCaches = failures
    .filter((failure) => {
      if (failure.kind !== "added") return false;
      const resolved = path.resolve(failure.file);
      return resolved.startsWith(`${pythonRuntime}${path.sep}`)
        && resolved.split(path.sep).includes("__pycache__")
        && resolved.endsWith(".pyc");
    })
    .map((failure) => failure.file);

  return {
    failures,
    allowedPythonCaches,
    onlyAllowedPythonCaches: failures.length > 0 && allowedPythonCaches.length === failures.length,
  };
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function run(file: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  try {
    // 强制 C locale：ps lstart 等输出会随用户 Terminal 的区域设置本地化，
    // 身份比对依赖稳定的字符串格式（否则中文 locale 下 restore 会误判身份变化）。
    const result = await execFileAsync(file, args, {
      encoding: "utf8",
      maxBuffer: 2_000_000,
      env: { ...process.env, LC_ALL: "C" },
    });
    return { stdout: result.stdout.trim(), stderr: result.stderr.trim() };
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    throw Object.assign(new Error(failure.stderr?.trim() || failure.stdout?.trim() || failure.message), {
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    });
  }
}

async function plistValue(plist: string, key: string): Promise<string> {
  return (await run(PLIST_BUDDY, ["-c", `Print :${key}`, plist])).stdout;
}

async function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(file);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export async function findKimiApp(): Promise<string> {
  if (process.env.KIMI_APP_PATH) {
    const configured = path.resolve(process.env.KIMI_APP_PATH);
    if (await exists(configured)) return configured;
    throw new Error(`KIMI_APP_PATH 指向不存在的位置：${configured}`);
  }

  const candidates = [
    "/Applications/Kimi.app",
    path.join(os.homedir(), "Applications", "Kimi.app"),
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  throw new Error("没有在 /Applications 或 ~/Applications 找到 Kimi.app");
}

export async function inspectKimiBaseline(appPath?: string): Promise<KimiBaseline> {
  const resolvedAppPath = appPath ?? await findKimiApp();
  const plist = path.join(resolvedAppPath, "Contents", "Info.plist");
  const executableName = await plistValue(plist, "CFBundleExecutable");
  const executablePath = path.join(resolvedAppPath, "Contents", "MacOS", executableName);
  const [version, bundleId, executableSha256] = await Promise.all([
    plistValue(plist, "CFBundleShortVersionString"),
    plistValue(plist, "CFBundleIdentifier"),
    sha256File(executablePath),
  ]);

  let metadata = "";
  try {
    const result = await execFileAsync("/usr/bin/codesign", ["-dv", "--verbose=2", resolvedAppPath], {
      encoding: "utf8",
      maxBuffer: 2_000_000,
    });
    metadata = `${result.stdout}\n${result.stderr}`;
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    metadata = `${failure.stdout ?? ""}\n${failure.stderr ?? ""}`;
  }
  const teamId = /^TeamIdentifier=(.+)$/m.exec(metadata)?.[1]?.trim() ?? null;

  let signatureValid = true;
  let signatureMessage = "签名验证通过";
  try {
    await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", resolvedAppPath]);
  } catch (error) {
    let detailedOutput = "";
    try {
      await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=6", "--continue", resolvedAppPath]);
    } catch (detailedError) {
      const failure = detailedError as Error & { stdout?: string; stderr?: string };
      detailedOutput = `${failure.stdout ?? ""}\n${failure.stderr ?? ""}`;
    }
    const classification = classifyCodeSignatureFailure(resolvedAppPath, detailedOutput);
    if (classification.onlyAllowedPythonCaches) {
      signatureMessage = `签名代码与原有资源有效；允许 ${classification.allowedPythonCaches.length} 个 Kimi 运行时 Python 缓存`;
    } else {
      signatureValid = false;
      const firstFailure = classification.failures.find(
        (failure) => !classification.allowedPythonCaches.includes(failure.file),
      );
      signatureMessage = firstFailure
        ? `签名资源异常：${firstFailure.kind} ${firstFailure.file}`
        : (error as Error).message;
    }
  }

  return {
    appPath: resolvedAppPath,
    bundleId,
    version,
    teamId,
    executablePath,
    executableSha256,
    signatureValid,
    signatureMessage,
  };
}

export async function listKimiPids(): Promise<number[]> {
  try {
    // pgrep -x Kimi 在部分 macOS 环境匹配不到主进程（comm 为完整路径），
    // 改为枚举 ps 的 comm 并匹配 Kimi.app 主可执行文件路径；Helper 进程名不同，不会误匹配。
    const { stdout } = await run("/bin/ps", ["-axo", "pid=,comm="]);
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /\/Kimi\.app\/Contents\/MacOS\/Kimi$/.test(line))
      .map((line) => Number(line.split(/\s+/)[0]))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return [];
  }
}

export async function processStartTime(pid: number): Promise<string> {
  return (await run("/bin/ps", ["-p", String(pid), "-o", "lstart="])).stdout.trim();
}

export async function processCommand(pid: number): Promise<string> {
  return (await run("/bin/ps", ["-p", String(pid), "-o", "command="])).stdout.trim();
}

export async function quitKimi(timeoutMs = 12_000): Promise<void> {
  try {
    await run("/usr/bin/osascript", ["-e", "tell application \"Kimi\" to quit"]);
  } catch {
    // Kimi may already be closed.
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await listKimiPids()).length === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Kimi 未在限定时间内退出，已停止操作");
}

export async function launchKimiDebug(appPath: string, port: number): Promise<number> {
  await run("/usr/bin/open", [
    "-a",
    appPath,
    "--args",
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${port}`,
  ]);
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const pids = await listKimiPids();
    if (pids[0]) return pids[0];
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("启动 Kimi 调试实例后没有找到主进程");
}

export async function launchKimiNormal(appPath: string): Promise<void> {
  await run("/usr/bin/open", ["-a", appPath]);
}

export async function chooseLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function parentPid(pid: number): Promise<number | null> {
  try {
    const value = Number((await run("/bin/ps", ["-p", String(pid), "-o", "ppid="])).stdout);
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export async function listenerPids(port: number): Promise<number[]> {
  try {
    const { stdout } = await run("/usr/sbin/lsof", [
      "-nP",
      `-iTCP:${port}`,
      "-sTCP:LISTEN",
      "-t",
    ]);
    return [...new Set(stdout.split(/\s+/).map(Number).filter((pid) => pid > 0))];
  } catch {
    return [];
  }
}

export async function portBelongsToProcessFamily(port: number, rootPid: number): Promise<boolean> {
  for (const listener of await listenerPids(port)) {
    let current: number | null = listener;
    const seen = new Set<number>();
    while (current && !seen.has(current)) {
      if (current === rootPid) return true;
      seen.add(current);
      current = await parentPid(current);
    }
  }
  return false;
}

export async function isRecordedProcess(pid: number, startTime: string): Promise<boolean> {
  if (!(await listKimiPids()).includes(pid)) return false;
  try {
    return (await processStartTime(pid)) === startTime;
  } catch {
    return false;
  }
}

function launchDomain(): string {
  const uid = process.getuid?.();
  if (uid === undefined) throw new Error("无法确定当前用户 UID");
  return `gui/${uid}`;
}

export async function launchJobPid(label: string): Promise<number | null> {
  try {
    const { stdout } = await run("/bin/launchctl", ["print", `${launchDomain()}/${label}`]);
    const pid = Number(/^\s*pid = (\d+)$/m.exec(stdout)?.[1]);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export async function submitLaunchJob(
  label: string,
  program: string,
  args: string[],
  logPath: string,
): Promise<number | null> {
  await run("/bin/launchctl", [
    "submit",
    "-l",
    label,
    "-o",
    logPath,
    "-e",
    logPath,
    "--",
    program,
    ...args,
  ]);
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const pid = await launchJobPid(label);
    if (pid) return pid;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

export async function removeLaunchJob(label: string): Promise<void> {
  try {
    await run("/bin/launchctl", ["remove", label]);
  } catch {
    if (await launchJobPid(label)) throw new Error(`无法停止 launchd 任务 ${label}`);
    return;
  }
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if (!(await launchJobPid(label))) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`launchd 任务 ${label} 未在限定时间内退出`);
}
