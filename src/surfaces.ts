// DOM 表面清单：把 KIMI_DOM_NOTES 里的散文选择器变成机器可读目录。
//
// 两个用途：
//   1. `probe` 命令在活页面上逐个探测表面是否仍存在（Kimi 更新后的体检）
//   2. `check-theme` 对照目录报告主题覆盖了哪些表面、漏了哪些必需表面
// 兼容目录按 Kimi 版本分文件：compatibility/kimi-<version>.json。

import { readFile } from "node:fs/promises";
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
