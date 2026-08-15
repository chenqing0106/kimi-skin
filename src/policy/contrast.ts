// 对比度启发式分析：找出主题里"文字色与底色过于接近"的规则（墨压墨）。
//
// 范围与边界（诚实声明）：
//   - 只分析能解析成纯色的 color / background(-color)；渐变、图片背景、
//     inherit 等不可解析的值直接跳过，不报也不猜。
//   - 两种检出路径：同一规则内成对声明（same-rule）、后代规则只写背景而
//     文字色继承自主题内的祖先规则（inherited，按选择器前缀匹配）。
//   - 应用层样式（Kimi 自身的 CSS）不可见，跨样式表的继承陷阱这里查不到，
//     仍需 pitfalls.md 要求的运行时计算样式探测。
//   - 结果只作为 check-theme 的告警展示，不参与 safe-css 加载拦截。

import { parseCss, type CssStyleRule } from "./safe-css.js";

export const CONTRAST_MIN_RATIO = 3;

/** 有效底色亮度低于该值视为"深色块" */
export const DARK_BLOCK_MAX_LUMINANCE = 0.25;

export interface ContrastFinding {
  selector: string;
  color: string;
  background: string;
  ratio: number;
  via: "same-rule" | "inherited" | "unpaired";
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const NAMED_COLORS: Record<string, Rgba> = {
  white: { r: 255, g: 255, b: 255, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  transparent: { r: 0, g: 0, b: 0, a: 0 },
};

function parseHexColor(value: string): Rgba | null {
  const match = /^#([0-9a-f]{3,8})$/i.exec(value);
  if (!match) return null;
  const hex = match[1]!;
  const expand = (s: string): number => parseInt(s.length === 1 ? s + s : s, 16);
  if (hex.length === 3 || hex.length === 4) {
    return {
      r: expand(hex[0]!),
      g: expand(hex[1]!),
      b: expand(hex[2]!),
      a: hex.length === 4 ? expand(hex[3]!) / 255 : 1,
    };
  }
  if (hex.length === 6 || hex.length === 8) {
    return {
      r: expand(hex.slice(0, 2)),
      g: expand(hex.slice(2, 4)),
      b: expand(hex.slice(4, 6)),
      a: hex.length === 8 ? expand(hex.slice(6, 8)) / 255 : 1,
    };
  }
  return null;
}

function parseRgbFunction(value: string): Rgba | null {
  const match = /^rgba?\((.+)\)$/i.exec(value.trim());
  if (!match) return null;
  const body = match[1]!.trim();
  // 同时容忍逗号语法 rgb(1, 2, 3, 0.5) 与空格语法 rgb(1 2 3 / 50%)
  const parts = body.includes(",")
    ? body.split(",").map((part) => part.trim())
    : body.split(/\s*\/\s*|\s+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const channel = (raw: string): number | null => {
    if (raw.endsWith("%")) {
      const pct = Number(raw.slice(0, -1));
      return Number.isFinite(pct) ? (pct / 100) * 255 : null;
    }
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
  };
  const alpha = (raw: string): number | null => {
    if (raw.endsWith("%")) {
      const pct = Number(raw.slice(0, -1));
      return Number.isFinite(pct) ? pct / 100 : null;
    }
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
  };
  const r = channel(parts[0]!);
  const g = channel(parts[1]!);
  const b = channel(parts[2]!);
  if (r === null || g === null || b === null) return null;
  let a = 1;
  if (parts.length === 4) {
    const parsed = alpha(parts[3]!);
    if (parsed === null) return null;
    a = parsed;
  }
  return { r, g, b, a };
}

// 解析 var(--name) 引用（含一层 fallback），depth 兜底循环引用。
function resolveVars(value: string, vars: Map<string, string>, depth: number): string {
  if (depth > 5) return value;
  const resolved = value.replace(
    /var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,\s*([^()]+))?\)/g,
    (whole, name: string, fallback: string | undefined) => {
      // parseDeclarations 会把属性名统一小写，这里对齐
      const hit = vars.get(name.toLowerCase());
      if (hit !== undefined) return hit;
      return fallback !== undefined ? fallback.trim() : whole;
    },
  );
  return resolved === value || !resolved.includes("var(") ? resolved : resolveVars(resolved, vars, depth + 1);
}

function parseColor(value: string, vars: Map<string, string>): Rgba | null {
  const resolved = resolveVars(value.trim(), vars, 0).trim().toLowerCase();
  if (NAMED_COLORS[resolved]) return NAMED_COLORS[resolved];
  return parseHexColor(resolved) ?? parseRgbFunction(resolved);
}

// background 简写里取纯色：含 url()/gradient 的说明可见背景是图像，跳过。
function extractBackground(decls: Map<string, string>, vars: Map<string, string>): { raw: string; color: Rgba } | null {
  const direct = decls.get("background-color");
  if (direct) {
    const color = parseColor(direct, vars);
    return color ? { raw: direct, color } : null;
  }
  const shorthand = decls.get("background");
  if (!shorthand || /url\(|gradient\(/i.test(shorthand)) return null;
  for (const token of shorthand.split(/\s+/)) {
    const color = parseColor(token, vars);
    if (color) return { raw: shorthand, color };
  }
  return null;
}

function compositeOver(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a + bg.a * (1 - fg.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
    g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
    b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
    a,
  };
}

function relativeLuminance({ r, g, b }: Rgba): number {
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(text: Rgba, background: Rgba): number {
  const l1 = relativeLuminance(text);
  const l2 = relativeLuminance(background);
  const [light, dark] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (light + 0.05) / (dark + 0.05);
}

function normalizeSelector(selector: string): string {
  return selector.replace(/\s+/g, " ").trim();
}

// 继承匹配时去掉伪类（:hover/:focus-within 等）：悬停态的文字色首先继承自
// 同元素的基础规则，其次才是祖先。伪元素（::before 等）保留——它们的文字色
// 继承自原始元素，匹配逻辑不变。
function stripStatePseudos(selector: string): string {
  return selector.replace(/:[a-z-]+(\([^)]*\))?/gi, "").replace(/\s+/g, " ").trim();
}

function declarationMap(rule: CssStyleRule): Map<string, string> {
  const map = new Map<string, string>();
  for (const declaration of rule.declarations) {
    if (!declaration.property.startsWith("--")) map.set(declaration.property, declaration.value);
  }
  return map;
}

export function analyzeContrast(css: string, minRatio: number = CONTRAST_MIN_RATIO): ContrastFinding[] {
  const parsed = parseCss(css);

  // :root 自定义属性表（后面的覆盖前面的，与层叠一致）
  const vars = new Map<string, string>();
  for (const rule of parsed.styleRules) {
    if (normalizeSelector(rule.selector) !== ":root") continue;
    for (const declaration of rule.declarations) {
      if (declaration.property.startsWith("--")) vars.set(declaration.property, declaration.value);
    }
  }

  // 画布色：半透明底色需要合成在一个基底上估算，取 --Bg-GroundPC，缺省白
  const canvasValue = vars.get("--bg-groundpc");
  const canvas: Rgba = (canvasValue && parseColor(canvasValue, vars)) || { r: 255, g: 255, b: 255, a: 1 };

  const colorRules: { selector: string; raw: string; color: Rgba }[] = [];
  for (const rule of parsed.styleRules) {
    const raw = declarationMap(rule).get("color");
    if (!raw) continue;
    const color = parseColor(raw, vars);
    if (color) colorRules.push({ selector: normalizeSelector(rule.selector), raw, color });
  }

  const findings: ContrastFinding[] = [];
  const seen = new Set<string>();

  for (const rule of parsed.styleRules) {
    const selector = normalizeSelector(rule.selector);
    if (selector.includes(",")) continue; // 逗号分支的继承归属不可靠，跳过
    const decls = declarationMap(rule);
    const background = extractBackground(decls, vars);
    if (!background || background.color.a === 0) continue;

    const backgroundEff = compositeOver(background.color, canvas);
    const colorRaw = decls.get("color");

    if (colorRaw) {
      const color = parseColor(colorRaw, vars);
      if (!color) continue;
      const ratio = contrastRatio(compositeOver(color, backgroundEff), backgroundEff);
      if (ratio < minRatio) {
        findings.push({ selector, color: colorRaw, background: background.raw, ratio, via: "same-rule" });
      }
      continue;
    }

    // 同元素基础规则优先（:hover 的文字色来自不带伪类的同元素规则）
    const baseSelector = stripStatePseudos(selector);
    let self: { selector: string; raw: string; color: Rgba } | null = null;
    for (const candidate of colorRules) {
      if (stripStatePseudos(candidate.selector) === baseSelector) self = candidate;
    }
    if (self) {
      const ratio = contrastRatio(compositeOver(self.color, backgroundEff), backgroundEff);
      if (ratio < minRatio) {
        findings.push({ selector, color: `${self.raw}（来自 ${self.selector}）`, background: background.raw, ratio, via: "same-rule" });
      }
      continue;
    }

    // 继承路径：找主题内选择器前缀是其后代的、最近的颜色规则
    let ancestor: { selector: string; raw: string; color: Rgba } | null = null;
    for (const candidate of colorRules) {
      const candidateBase = stripStatePseudos(candidate.selector);
      if (candidateBase === baseSelector) continue;
      if (!baseSelector.startsWith(`${candidateBase} `)) continue;
      if (!ancestor || candidateBase.length > stripStatePseudos(ancestor.selector).length) ancestor = candidate;
    }

    // 深色块单边声明：底色很暗但整条规则链（同规则/基础规则/主题内祖先）
    // 都没声明文字色，文字色只能由应用层决定——token 重映射后极易墨压墨。
    // 装饰域（伪元素、背景层、滚动条）与 :has() 容器跳过：前者不含文字，
    // 后者的文字色由子元素规则覆盖，前缀匹配不可靠。
    if (!ancestor && relativeLuminance(backgroundEff) < DARK_BLOCK_MAX_LUMINANCE) {
      const isDecorative =
        /::|-webkit-scrollbar/.test(selector) ||
        selector.includes(":has(") ||
        selector === "#kimi-skin-bg";
      if (!isDecorative) {
        findings.push({
          selector,
          color: "（未声明，将由应用层/token 层叠决定）",
          background: background.raw,
          ratio: 0,
          via: "unpaired",
        });
      }
      continue;
    }

    if (!ancestor) continue;
    const ratio = contrastRatio(compositeOver(ancestor.color, backgroundEff), backgroundEff);
    if (ratio < minRatio) {
      const key = `${selector}←${ancestor.selector}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({ selector, color: `${ancestor.raw}（继承自 ${ancestor.selector}）`, background: background.raw, ratio, via: "inherited" });
    }
  }

  return findings;
}
