import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { validateSafeCss } from "./policy/safe-css.js";
import type { LoadedTheme, ThemeManifest } from "./types.js";

const MAX_CSS_BYTES = 200 * 1024;
const MAX_BACKGROUND_BYTES = 10 * 1024 * 1024;
// CSS 内相对 url() 引用的素材：逐张限额 + 总量限额（注入载荷预算）
const MAX_ASSET_BYTES = 2 * 1024 * 1024;
const MAX_ASSET_TOTAL_BYTES = 12 * 1024 * 1024;

function assertManifest(value: unknown): asserts value is ThemeManifest {
  if (!value || typeof value !== "object") throw new Error("theme.json 必须是对象");
  const manifest = value as Partial<ThemeManifest>;
  for (const key of ["id", "name", "version"] as const) {
    if (typeof manifest[key] !== "string" || manifest[key].trim() === "") {
      throw new Error(`theme.json 缺少有效字段：${key}`);
    }
  }
  if (manifest.background !== undefined && (typeof manifest.background !== "string" || manifest.background.trim() === "")) {
    throw new Error("theme.json background 必须是非空字符串");
  }
  if (!Array.isArray(manifest.compatibleKimi) || !manifest.compatibleKimi.every((item) => typeof item === "string")) {
    throw new Error("theme.json compatibleKimi 必须是字符串数组");
  }
  if (manifest.capabilities !== undefined && (!Array.isArray(manifest.capabilities) || !manifest.capabilities.every((item) => typeof item === "string"))) {
    throw new Error("theme.json capabilities 必须是字符串数组");
  }
  if (manifest.interactions !== undefined) {
    if (!manifest.interactions || typeof manifest.interactions !== "object" || Array.isArray(manifest.interactions)) {
      throw new Error("theme.json interactions 必须是对象");
    }
    const interactions = manifest.interactions as Record<string, unknown>;
    const unknownInteractions = Object.keys(interactions).filter((key) => key !== "rootStateToggle");
    if (unknownInteractions.length > 0) {
      throw new Error(`theme.json 包含不支持的交互：${unknownInteractions.join(", ")}`);
    }
    if (interactions.rootStateToggle !== undefined) {
      if (!interactions.rootStateToggle || typeof interactions.rootStateToggle !== "object" || Array.isArray(interactions.rootStateToggle)) {
        throw new Error("theme.json interactions.rootStateToggle 必须是对象");
      }
      const rootStateToggle = interactions.rootStateToggle as Record<string, unknown>;
      const unknownToggleKeys = Object.keys(rootStateToggle).filter((key) => key !== "triggerSelector" && key !== "state");
      if (unknownToggleKeys.length > 0) {
        throw new Error(`theme.json interactions.rootStateToggle 包含不支持的字段：${unknownToggleKeys.join(", ")}`);
      }
      if (typeof rootStateToggle.triggerSelector !== "string" || rootStateToggle.triggerSelector.trim() === "" || rootStateToggle.triggerSelector.length > 512) {
        throw new Error("theme.json interactions.rootStateToggle.triggerSelector 必须是 1–512 字符的 CSS 选择器");
      }
      const triggerSelector = rootStateToggle.triggerSelector.trim();
      if (!triggerSelector.startsWith(".home-view ") || triggerSelector.includes(",")) {
        throw new Error("theme.json interactions.rootStateToggle.triggerSelector 必须是 .home-view 内的单个后代选择器");
      }
      if (typeof rootStateToggle.state !== "string" || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(rootStateToggle.state)) {
        throw new Error("theme.json interactions.rootStateToggle.state 只能使用小写字母、数字和连字符");
      }
    }
  }
  if (manifest.widgets !== undefined) {
    if (!Array.isArray(manifest.widgets)) {
      throw new Error("theme.json widgets 必须是数组");
    }
    const widgetIds = new Set<string>();
    const widgetPlacements = new Set<string>();
    for (const rawWidget of manifest.widgets) {
      if (!rawWidget || typeof rawWidget !== "object" || Array.isArray(rawWidget)) {
        throw new Error("theme.json widgets 中的每一项必须是对象");
      }
      const widget = rawWidget as unknown as Record<string, unknown>;
      const unknownWidgetKeys = Object.keys(widget).filter((key) => !["id", "type", "surface"].includes(key));
      if (unknownWidgetKeys.length > 0) {
        throw new Error(`theme.json widget 包含不支持的字段：${unknownWidgetKeys.join(", ")}`);
      }
      if (typeof widget.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(widget.id)) {
        throw new Error("theme.json widget id 只能使用小写字母、数字和连字符");
      }
      if (widgetIds.has(widget.id)) throw new Error(`theme.json widget id 重复：${widget.id}`);
      widgetIds.add(widget.id);
      if (widget.type !== "kimi-work-quota") {
        throw new Error(`theme.json widget type 不受支持：${String(widget.type)}`);
      }
      if (widget.surface !== "home.top-right") {
        throw new Error(`theme.json widget surface 不受支持：${String(widget.surface)}`);
      }
      const placement = `${widget.type}:${widget.surface}`;
      if (widgetPlacements.has(placement)) {
        throw new Error(`theme.json widget 位置重复：${placement}`);
      }
      widgetPlacements.add(placement);
    }
  }
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(manifest.id ?? "")) {
    throw new Error("主题 id 只能使用小写字母、数字和连字符");
  }
}

export interface ThemeDescriptor {
  directory: string;
  manifest: ThemeManifest;
}

export async function readThemeManifest(directory: string): Promise<ThemeDescriptor> {
  const themeDirectory = await realpath(path.resolve(directory));
  const manifestPath = path.join(themeDirectory, "theme.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  assertManifest(manifest);
  return { directory: themeDirectory, manifest };
}

function validateCss(css: string): void {
  const blocked: Array<[RegExp, string]> = [
    [/@import\b/i, "@import"],
    [/url\s*\(\s*['\"]?\s*(?:https?:|file:|javascript:|\/\/)/i, "远程或本地 URL"],
    [/-moz-binding\s*:/i, "-moz-binding"],
    [/behavior\s*:/i, "behavior"],
  ];
  for (const [pattern, label] of blocked) {
    if (pattern.test(css)) throw new Error(`theme.css 包含不允许的内容：${label}`);
  }
}

function mimeForImage(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    default: throw new Error("图片素材只支持 PNG、JPEG 或 WebP");
  }
}

function mimeForCssAsset(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case ".woff2": return "font/woff2";
    case ".woff": return "font/woff";
    case ".ttf": return "font/ttf";
    case ".otf": return "font/otf";
    default: return mimeForImage(file);
  }
}

const CSS_URL_PATTERN = /url\(\s*(["']?)([^"')]+)\1\s*\)/g;

// 把 CSS 里的相对 url() 解析为主题目录内的文件，重写为 data: URL。
// data: 与片段引用（#id）原样保留；远程 / 本地绝对路径由 validateCss 和此处共同拒绝。
// 注释中的 url() 不参与解析（扫描前把注释等长替换为空格，保持位置不变）。
function maskComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => " ".repeat(comment.length));
}

async function resolveCssAssets(css: string, themeDirectory: string): Promise<string> {
  const resolved = new Map<string, string>();
  let totalBytes = 0;
  for (const match of maskComments(css).matchAll(CSS_URL_PATTERN)) {
    const ref = (match[2] ?? "").trim();
    if (/^(?:data:|#)/i.test(ref)) continue;
    if (/^(?:https?:|file:|javascript:|\/\/)/i.test(ref)) continue; // validateCss 已拦截
    if (path.isAbsolute(ref)) throw new Error(`theme.css 不允许绝对路径素材：${ref}`);
    if (resolved.has(ref)) continue;

    let assetPath: string;
    try {
      assetPath = await realpath(path.join(themeDirectory, ref));
    } catch {
      throw new Error(`theme.css 引用的素材不存在：${ref}`);
    }
    if (!assetPath.startsWith(`${themeDirectory}${path.sep}`)) {
      throw new Error(`CSS 素材不能位于主题目录之外：${ref}`);
    }
    const info = await stat(assetPath);
    if (info.size === 0 || info.size > MAX_ASSET_BYTES) {
      throw new Error(`CSS 素材为空或超过 2 MiB：${ref}`);
    }
    totalBytes += info.size;
    if (totalBytes > MAX_ASSET_TOTAL_BYTES) {
      throw new Error(`CSS 素材总量超过 12 MiB（含 ${ref}）`);
    }
    const data = await readFile(assetPath);
    resolved.set(ref, `data:${mimeForCssAsset(assetPath)};base64,${data.toString("base64")}`);
  }
  return css.replace(CSS_URL_PATTERN, (whole, _quote: string, rawRef: string) => {
    const dataUrl = resolved.get(rawRef.trim());
    return dataUrl ? `url("${dataUrl}")` : whole;
  });
}

export async function loadTheme(directory: string, kimiVersion?: string): Promise<LoadedTheme> {
  const { directory: themeDirectory, manifest } = await readThemeManifest(directory);

  if (kimiVersion && !manifest.compatibleKimi.includes("*") && !manifest.compatibleKimi.includes(kimiVersion)) {
    throw new Error(`主题不支持 Kimi ${kimiVersion}`);
  }

  const cssPath = path.join(themeDirectory, "theme.css");
  const cssInfo = await stat(cssPath);
  if (cssInfo.size === 0 || cssInfo.size > MAX_CSS_BYTES) throw new Error("theme.css 为空或超过 200 KiB");
  const rawCss = await readFile(cssPath, "utf8");
  validateCss(rawCss);
  // 主题声明 safe-css 能力 = 承诺遵守白名单契约，加载时强制执行。
  if (manifest.capabilities?.includes("safe-css")) {
    const report = validateSafeCss(rawCss);
    if (!report.ok) {
      const details = report.violations.slice(0, 5).map((violation) => `  - ${violation.message}（${violation.rule}）`);
      throw new Error(
        `theme.css 声明了 safe-css 能力，但违反契约 ${report.contract}（共 ${report.violations.length} 处）：\n${details.join("\n")}`,
      );
    }
  }
  const css = await resolveCssAssets(rawCss, themeDirectory);

  let backgroundDataUrl: string | undefined;
  if (manifest.background) {
    const backgroundPath = await realpath(path.join(themeDirectory, manifest.background));
    if (!backgroundPath.startsWith(`${themeDirectory}${path.sep}`)) {
      throw new Error("背景图片不能位于主题目录之外");
    }
    const backgroundInfo = await stat(backgroundPath);
    if (backgroundInfo.size === 0 || backgroundInfo.size > MAX_BACKGROUND_BYTES) {
      throw new Error("背景图片为空或超过 10 MiB");
    }
    const data = await readFile(backgroundPath);
    backgroundDataUrl = `data:${mimeForImage(backgroundPath)};base64,${data.toString("base64")}`;
  }
  return { directory: themeDirectory, manifest, css, backgroundDataUrl };
}
