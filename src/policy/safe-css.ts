// kimi-skin-safe-css/1：主题 CSS 的正向白名单契约。
//
// 与 theme.ts 的黑名单（@import、远程 URL 等底线拦截）不同，这里回答的是
// "这套主题被允许碰什么"，分三档：
//   - allowed    纯视觉属性，任何选择器上都可以用
//   - restricted 布局 / 可见性 / 交互属性，只允许出现在装饰域
//                （伪元素、#kimi-skin-bg、滚动条等），防止主题隐藏或移位原生控件
//   - unknown    契约之外的属性，一律报告
// 自定义属性 --* 本身惰性，任何位置都允许。
//
// 主题在 theme.json 里声明 "capabilities": ["safe-css"] 后，loadTheme 会强制
// 执行本契约（hard fail）；未声明的主题可用 `check-theme` 做同样的体检但不拦截。

export const SAFE_CSS_CONTRACT = "kimi-skin-safe-css/1";

export interface SafeCssLimits {
  maxRules: number;
  maxDeclarations: number;
  maxValueCharacters: number;
  maxSelectorCharacters: number;
  maxKeyframes: number;
}

export const DEFAULT_SAFE_CSS_LIMITS: SafeCssLimits = {
  maxRules: 512,
  maxDeclarations: 4096,
  maxValueCharacters: 1024,
  maxSelectorCharacters: 512,
  maxKeyframes: 24,
};

// 纯视觉：颜色、背景、描边、阴影、字体度量、透明度、滤镜、过渡。
const ALLOWED_PROPERTIES = new Set([
  "-webkit-backdrop-filter",
  "accent-color",
  "backdrop-filter",
  "background",
  "background-attachment",
  "background-blend-mode",
  "background-clip",
  "background-color",
  "background-image",
  "background-origin",
  "background-position",
  "background-position-x",
  "background-position-y",
  "background-repeat",
  "background-size",
  "border",
  "border-block",
  "border-block-color",
  "border-block-style",
  "border-block-width",
  "border-bottom",
  "border-bottom-color",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "border-bottom-style",
  "border-bottom-width",
  "border-color",
  "border-inline",
  "border-inline-color",
  "border-inline-style",
  "border-inline-width",
  "border-left",
  "border-left-color",
  "border-left-style",
  "border-left-width",
  "border-radius",
  "border-right",
  "border-right-color",
  "border-right-style",
  "border-right-width",
  "border-style",
  "border-top",
  "border-top-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-top-style",
  "border-top-width",
  "border-width",
  "box-shadow",
  "caret-color",
  "color",
  "color-scheme",
  "fill",
  "filter",
  "font",
  "font-family",
  "font-feature-settings",
  "font-size",
  "font-style",
  "font-variant",
  "font-weight",
  "image-rendering",
  "letter-spacing",
  "line-height",
  "opacity",
  "outline",
  "outline-color",
  "outline-offset",
  "outline-style",
  "outline-width",
  "scrollbar-color",
  "stroke",
  "stroke-width",
  "text-decoration",
  "text-decoration-color",
  "text-decoration-line",
  "text-decoration-style",
  "text-decoration-thickness",
  "text-shadow",
  "text-transform",
  "text-underline-offset",
  "transition",
  "transition-delay",
  "transition-duration",
  "transition-property",
  "transition-timing-function",
]);

// 布局 / 可见性 / 交互：只允许出现在装饰域，防止主题隐藏、移位或阻断原生控件。
const RESTRICTED_PROPERTIES = new Set([
  "animation",
  "animation-delay",
  "animation-direction",
  "animation-duration",
  "animation-fill-mode",
  "animation-iteration-count",
  "animation-name",
  "animation-play-state",
  "animation-timing-function",
  "aspect-ratio",
  "align-items",
  "bottom",
  "box-sizing",
  "clip-path",
  "column-gap",
  "content",
  "display",
  "flex",
  "flex-basis",
  "flex-direction",
  "flex-grow",
  "flex-shrink",
  "flex-wrap",
  "gap",
  "grid-template-columns",
  "height",
  "inset",
  "inset-block",
  "inset-inline",
  "justify-content",
  "left",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-height",
  "max-width",
  "min-height",
  "min-width",
  "overflow",
  "overflow-x",
  "overflow-y",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "pointer-events",
  "position",
  "right",
  "row-gap",
  "rotate",
  "scale",
  "top",
  "transform",
  "transform-origin",
  "translate",
  "user-select",
  "visibility",
  "width",
  "z-index",
]);

// 装饰域伪元素：主题在这些位置动布局 / 可见性不会影响原生控件本体。
const DECORATIVE_PSEUDO = /::(?:before|after|selection|placeholder|marker|backdrop|-webkit-scrollbar(?:-[a-z]+)?)/i;
const THEME_OWNED_WIDGET = "#kimi-skin-widgets";

const ALLOWED_GROUP_AT_RULES = new Set(["@media", "@supports"]);
const KEYFRAME_AT_RULES = new Set(["@keyframes", "@-webkit-keyframes"]);
const ALLOWED_FONT_FACE_PROPERTIES = new Set([
  "font-display",
  "font-family",
  "font-stretch",
  "font-style",
  "font-weight",
  "src",
  "unicode-range",
]);

export type SafeCssViolationKind =
  | "unknown-property"
  | "restricted-outside-decoration"
  | "blocked-at-rule"
  | "limit-exceeded";

export interface SafeCssViolation {
  kind: SafeCssViolationKind;
  rule: string;
  property?: string;
  message: string;
}

export interface SafeCssStats {
  rules: number;
  declarations: number;
  keyframes: number;
  importantCount: number;
}

export interface SafeCssReport {
  contract: string;
  ok: boolean;
  stats: SafeCssStats;
  violations: SafeCssViolation[];
}

export interface CssDeclaration {
  property: string;
  value: string;
  important: boolean;
}

export interface CssStyleRule {
  selector: string;
  declarations: CssDeclaration[];
  atTrail: string[];
}

// 注释等长替换为空格，保持偏移不变，url() / 属性扫描不被注释内容干扰。
function maskComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => " ".repeat(comment.length));
}

// 找到 text 中从 openIndex（'{'）开始、与字符串和括号配对的闭合 '}' 位置。
function findBlockEnd(text: string, openIndex: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// 按顶层分隔符切分，忽略字符串与括号内部。
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function parseDeclarations(body: string): CssDeclaration[] {
  const declarations: CssDeclaration[] = [];
  for (const raw of splitTopLevel(body, ";")) {
    const colonIndex = raw.indexOf(":");
    if (colonIndex < 0) continue;
    const property = raw.slice(0, colonIndex).trim().toLowerCase();
    if (!property) continue;
    let value = raw.slice(colonIndex + 1).trim();
    let important = false;
    const importantMatch = /!\s*important\s*$/i.exec(value);
    if (importantMatch) {
      important = true;
      value = value.slice(0, importantMatch.index).trim();
    }
    declarations.push({ property, value, important });
  }
  return declarations;
}

export interface ParsedCss {
  styleRules: CssStyleRule[];
  fontFaceRules: CssDeclaration[][];
  keyframeRules: number;
  blockedAtRules: string[];
}

export function parseCss(css: string): ParsedCss {
  const text = maskComments(css);
  const styleRules: CssStyleRule[] = [];
  const fontFaceRules: CssDeclaration[][] = [];
  const blockedAtRules: string[] = [];
  let keyframeRules = 0;

  const walk = (chunk: string, atTrail: string[]): void => {
    let cursor = 0;
    while (cursor < chunk.length) {
      const openIndex = chunk.indexOf("{", cursor);
      if (openIndex < 0) break;
      const prelude = chunk.slice(cursor, openIndex).trim();
      const endIndex = findBlockEnd(chunk, openIndex);
      if (endIndex < 0) break;
      const body = chunk.slice(openIndex + 1, endIndex);
      cursor = endIndex + 1;
      if (!prelude) continue;

      const atName = /^@[a-z-]+/i.exec(prelude)?.[0]?.toLowerCase();
      if (atName && KEYFRAME_AT_RULES.has(atName)) {
        keyframeRules++;
        // keyframes 内部是关键帧块，不参与属性分档（挂载入口的 animation
        // 属性本身已受限）；只统计规模，交由 limits 兜底。
        continue;
      }
      if (atName === "@font-face") {
        fontFaceRules.push(parseDeclarations(body));
        continue;
      }
      if (atName && ALLOWED_GROUP_AT_RULES.has(atName)) {
        walk(body, [...atTrail, prelude]);
        continue;
      }
      if (atName) {
        blockedAtRules.push(atName);
        continue;
      }
      styleRules.push({ selector: prelude, declarations: parseDeclarations(body), atTrail });
    }
  };

  walk(text, []);
  return { styleRules, fontFaceRules, keyframeRules, blockedAtRules };
}

function truncate(text: string, max = 80): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
}

function selectorIsDecorative(selector: string): boolean {
  const parts = splitTopLevel(selector, ",").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((part) => (
    part.startsWith("#kimi-skin-bg")
      || part === THEME_OWNED_WIDGET
      || (part.startsWith(`${THEME_OWNED_WIDGET} `) && !/^#kimi-skin-widgets\s+[+~]/.test(part))
      || part.startsWith(`${THEME_OWNED_WIDGET}>`)
      || DECORATIVE_PSEUDO.test(part)
  ));
}

// 受限属性的按值豁免：这些取值即使作用于原生控件也不会造成隐藏 / 移位 / 阻断。
//   position: relative —— 主题给装饰伪元素建锚点的常规写法，本身不移除文档流
//   animation: none    —— prefers-reduced-motion 里关闭动画是无障碍改善
function restrictedValueExempted(declaration: CssDeclaration): boolean {
  const value = declaration.value.trim().toLowerCase();
  if (declaration.property === "position" && value === "relative") return true;
  if (declaration.property === "animation" && value === "none") return true;
  return false;
}

function statefulDoodleContentExempted(selector: string, declaration: CssDeclaration): boolean {
  if (declaration.property !== "content") return false;
  const parts = splitTopLevel(selector, ",").map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 && parts.every((part) => (
    /^html\[data-kimi-skin-state="[a-z0-9-]+"\]\s+\.home-view\s+\.doodle$/.test(part)
  ));
}

export function validateSafeCss(css: string, limits: SafeCssLimits = DEFAULT_SAFE_CSS_LIMITS): SafeCssReport {
  const parsed = parseCss(css);
  const stats: SafeCssStats = { rules: 0, declarations: 0, keyframes: parsed.keyframeRules, importantCount: 0 };
  const violations: SafeCssViolation[] = [];

  for (const atRule of parsed.blockedAtRules) {
    violations.push({
      kind: "blocked-at-rule",
      rule: atRule,
      message: `契约不允许 at 规则 ${atRule}（只允许 @font-face / @media / @supports / @keyframes）`,
    });
  }

  for (const declarations of parsed.fontFaceRules) {
    stats.rules++;
    stats.declarations += declarations.length;
    for (const declaration of declarations) {
      if (declaration.important) stats.importantCount++;
      if (declaration.value.length > limits.maxValueCharacters) {
        violations.push({
          kind: "limit-exceeded",
          rule: "@font-face",
          property: declaration.property,
          message: `属性值超过 ${limits.maxValueCharacters} 字符`,
        });
      } else if (!ALLOWED_FONT_FACE_PROPERTIES.has(declaration.property)) {
        violations.push({
          kind: "unknown-property",
          rule: "@font-face",
          property: declaration.property,
          message: `@font-face 不允许属性 ${declaration.property}`,
        });
      }
    }
  }

  for (const rule of parsed.styleRules) {
    stats.rules++;
    stats.declarations += rule.declarations.length;
    const label = rule.atTrail.length ? `${rule.atTrail.join(" ▸ ")} ▸ ${rule.selector}` : rule.selector;
    if (rule.selector.length > limits.maxSelectorCharacters) {
      violations.push({
        kind: "limit-exceeded",
        rule: truncate(label),
        message: `选择器超过 ${limits.maxSelectorCharacters} 字符`,
      });
    }
    const decorative = selectorIsDecorative(rule.selector);
    for (const declaration of rule.declarations) {
      if (declaration.important) stats.importantCount++;
      if (declaration.value.length > limits.maxValueCharacters) {
        violations.push({
          kind: "limit-exceeded",
          rule: truncate(label),
          property: declaration.property,
          message: `属性值超过 ${limits.maxValueCharacters} 字符`,
        });
        continue;
      }
      if (declaration.property.startsWith("--")) continue;
      if (ALLOWED_PROPERTIES.has(declaration.property)) continue;
      if (RESTRICTED_PROPERTIES.has(declaration.property)) {
        if (!decorative && !restrictedValueExempted(declaration) && !statefulDoodleContentExempted(rule.selector, declaration)) {
          violations.push({
            kind: "restricted-outside-decoration",
            rule: truncate(label),
            property: declaration.property,
            message: `受限属性 ${declaration.property} 只允许出现在装饰域（::before/::after/#kimi-skin-bg/滚动条），不能作用于原生控件`,
          });
        }
        continue;
      }
      violations.push({
        kind: "unknown-property",
        rule: truncate(label),
        property: declaration.property,
        message: `属性 ${declaration.property} 不在 safe-css 契约白名单内`,
      });
    }
  }

  if (stats.rules > limits.maxRules) {
    violations.push({ kind: "limit-exceeded", rule: "(theme)", message: `规则数 ${stats.rules} 超过上限 ${limits.maxRules}` });
  }
  if (stats.declarations > limits.maxDeclarations) {
    violations.push({ kind: "limit-exceeded", rule: "(theme)", message: `声明数 ${stats.declarations} 超过上限 ${limits.maxDeclarations}` });
  }
  if (stats.keyframes > limits.maxKeyframes) {
    violations.push({ kind: "limit-exceeded", rule: "(theme)", message: `@keyframes 数量 ${stats.keyframes} 超过上限 ${limits.maxKeyframes}` });
  }

  return { contract: SAFE_CSS_CONTRACT, ok: violations.length === 0, stats, violations };
}
