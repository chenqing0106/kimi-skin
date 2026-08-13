// DOM 表面清单：把 KIMI_DOM_NOTES 里的散文选择器变成机器可读目录。
//
// 两个用途：
//   1. `probe` 命令在活页面上逐个探测表面是否仍存在（Kimi 更新后的体检）
//   2. `check-theme` 对照目录报告主题覆盖了哪些表面、漏了哪些必需表面
// 兼容目录按 Kimi 版本分文件：compatibility/kimi-<version>.json。

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface SurfaceDefinition {
  id: string;
  selector: string;
  required: boolean;
  conditional?: boolean;
  note?: string;
}

export interface SurfaceCatalog {
  schemaVersion: 1;
  kimiVersion: string;
  capturedAt?: string;
  // 是否已在该版本 Kimi 的活页面上通过 probe 验证；false/缺省 = 继承而来、尚未验证
  verified?: boolean;
  // 从哪个版本的清单复制继承而来（compat bump 生成时记录）
  derivedFrom?: string;
  surfaces: SurfaceDefinition[];
}

export interface SurfaceProbeResult {
  id: string;
  present: boolean;
  visible: boolean;
  rectArea: number;
}

export interface SurfaceCoverage {
  surface: SurfaceDefinition;
  covered: boolean;
}

function assertCatalog(value: unknown): asserts value is SurfaceCatalog {
  if (!value || typeof value !== "object") throw new Error("兼容清单必须是对象");
  const catalog = value as Partial<SurfaceCatalog>;
  if (catalog.schemaVersion !== 1) throw new Error("兼容清单 schemaVersion 必须是 1");
  if (typeof catalog.kimiVersion !== "string" || !catalog.kimiVersion) throw new Error("兼容清单缺少 kimiVersion");
  if (!Array.isArray(catalog.surfaces) || catalog.surfaces.length === 0) throw new Error("兼容清单缺少 surfaces");
  for (const surface of catalog.surfaces) {
    if (!surface || typeof surface.id !== "string" || typeof surface.selector !== "string" || typeof surface.required !== "boolean") {
      throw new Error("兼容清单中存在无效表面定义");
    }
  }
}

// 返回 null 表示该 Kimi 版本还没有表面清单（调用方应提示而不是静默跳过）。
export async function loadSurfaceCatalog(selectorsDirectory: string, kimiVersion: string): Promise<SurfaceCatalog | null> {
  const file = path.join(selectorsDirectory, `kimi-${kimiVersion}.json`);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const catalog = JSON.parse(raw) as unknown;
  assertCatalog(catalog);
  return catalog;
}

// —— 版本继承：Kimi 升级后从最近版本复制清单，probe 验证前标记为未验证 ——

const CATALOG_FILE_PATTERN = /^kimi-(\d+\.\d+\.\d+)\.json$/;

export function compareKimiVersions(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// 目录中已有清单覆盖的 Kimi 版本，按版本号升序。
export async function listCatalogVersions(selectorsDirectory: string): Promise<string[]> {
  const entries = await readdir(selectorsDirectory);
  return entries
    .map((entry) => CATALOG_FILE_PATTERN.exec(entry)?.[1])
    .filter((version): version is string => typeof version === "string")
    .sort(compareKimiVersions);
}

// 继承来源：优先同一 major.minor 下的最新版本（DOM 最可能一致），否则取已有的最新版本。
export function nearestCatalogVersion(versions: string[], target: string): string | null {
  const candidates = versions.filter((version) => version !== target);
  if (!candidates.length) return null;
  const minor = target.split(".").slice(0, 2).join(".");
  const sameMinor = candidates.filter((version) => version.split(".").slice(0, 2).join(".") === minor);
  const pool = sameMinor.length ? sameMinor : candidates;
  return pool.reduce((best, version) => (compareKimiVersions(version, best) > 0 ? version : best));
}

// 从最近版本复制生成目标版本的清单；已存在时返回 null 不覆盖。
export async function bumpSurfaceCatalog(
  selectorsDirectory: string,
  targetVersion: string,
  capturedAt: string,
): Promise<{ file: string; derivedFrom: string } | null> {
  if (!/^\d+\.\d+\.\d+$/.test(targetVersion)) throw new Error(`无效的 Kimi 版本号：${targetVersion}`);
  if (await loadSurfaceCatalog(selectorsDirectory, targetVersion)) return null;
  const source = nearestCatalogVersion(await listCatalogVersions(selectorsDirectory), targetVersion);
  if (!source) throw new Error("兼容目录中没有任何可继承的清单");
  const catalog = await loadSurfaceCatalog(selectorsDirectory, source);
  if (!catalog) throw new Error(`无法读取继承来源清单 kimi-${source}.json`);
  const next: SurfaceCatalog = {
    schemaVersion: 1,
    kimiVersion: targetVersion,
    capturedAt,
    verified: false,
    derivedFrom: source,
    surfaces: catalog.surfaces,
  };
  const file = path.join(selectorsDirectory, `kimi-${targetVersion}.json`);
  await writeFile(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return { file, derivedFrom: source };
}

// probe 通过后回写 verified 标记（缺清单时静默跳过）。
export async function markCatalogVerified(selectorsDirectory: string, kimiVersion: string, verified: boolean, capturedAt?: string): Promise<void> {
  const catalog = await loadSurfaceCatalog(selectorsDirectory, kimiVersion);
  if (!catalog) return;
  const next: SurfaceCatalog = { ...catalog, verified, ...(capturedAt ? { capturedAt } : {}) };
  await writeFile(path.join(selectorsDirectory, `kimi-${kimiVersion}.json`), `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

// 在活页面上探测每个表面：是否存在、是否有任一匹配真实可见
// （取第一个匹配会命中隐藏实例，必须看全部匹配）。
export function surfaceProbeExpression(catalog: SurfaceCatalog): string {
  const entries = catalog.surfaces.map((surface) => ({ id: surface.id, selector: surface.selector }));
  return `(() => {
    const surfaces = ${JSON.stringify(entries)};
    const isVisible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    return surfaces.map(({ id, selector }) => {
      let els = [];
      try { els = Array.from(document.querySelectorAll(selector)); } catch { return { id, present: false, visible: false, rectArea: 0 }; }
      if (!els.length) return { id, present: false, visible: false, rectArea: 0 };
      const visibleEl = els.find(isVisible);
      if (!visibleEl) return { id, present: true, visible: false, rectArea: 0 };
      const rect = visibleEl.getBoundingClientRect();
      return { id, present: true, visible: true, rectArea: Math.round(rect.width * rect.height) };
    });
  })()`;
}

// 主题覆盖了哪些表面：在 CSS 文本里查找表面选择器（含逗号分支，任一分支命中即算覆盖）。
// 这是启发式检查——只能说明主题"写过"这个选择器，不代表视觉效果正确。
export function surfaceCoverage(css: string, catalog: SurfaceCatalog): SurfaceCoverage[] {
  const masked = css.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s+/g, " ");
  return catalog.surfaces.map((surface) => {
    const alternatives = surface.selector.split(",").map((part) => part.trim().replace(/\s+/g, " ")).filter(Boolean);
    const covered = alternatives.some((alternative) => masked.includes(alternative));
    return { surface, covered };
  });
}
