import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { RuntimeState } from "./types.js";

export function stateDirectory(): string {
  return process.env.KIMI_SKIN_STATE_DIR
    ? path.resolve(process.env.KIMI_SKIN_STATE_DIR)
    : path.join(os.homedir(), "Library", "Application Support", "KimiSkin");
}

export function stateFile(): string {
  return path.join(stateDirectory(), "runtime-state.json");
}

export async function readRuntimeState(): Promise<RuntimeState | null> {
  try {
    const parsed = JSON.parse(await readFile(stateFile(), "utf8")) as RuntimeState;
    if (parsed.schemaVersion !== 1 || parsed.mode !== "debug") {
      throw new Error("运行状态文件版本不受支持");
    }
    return parsed;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw error;
  }
}

export async function writeRuntimeState(state: RuntimeState): Promise<void> {
  const directory = stateDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, `.runtime-state-${process.pid}.tmp`);
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, stateFile());
}

export async function clearRuntimeState(): Promise<void> {
  await rm(stateFile(), { force: true });
}
