// 运行时对比度审计：遍历活页面所有可见文字元素，用计算样式的前景色
// 与沿祖先链合成的有效背景色算 WCAG 对比度，输出低于阈值的元素清单。
//
// 用法：node skills/kimi-skin-theme/scripts/probe-contrast.mjs <cdp端口> [最低比值=4.5]
// 例：node skills/kimi-skin-theme/scripts/probe-contrast.mjs 55000 4.5
//
// 为什么需要它：check-theme 的对比度启发式只能分析主题 CSS 里写死的纯色对；
// token 层叠、应用层样式、半透明背景需要运行时辅助估算。按需在真实页面
// 运行本脚本定位候选问题，不能代替截图、计算样式与人工视觉检查。
//
// 诚实边界：背景链完全透明时合成到假设基底（主题画布色或白），并标注 assumedBase；
// 渐变、图片、滤镜和元素整体透明度没有做像素级采样，结果只是候选告警。
import { CdpSession } from "../../../dist/cdp.js";
import { probeTargets } from "../../../dist/adapter.js";

const [port, minRatioArg] = process.argv.slice(2);
if (!port) {
  console.error("用法: node probe-contrast.mjs <cdp端口> [最低比值=4.5]");
  process.exit(1);
}
const minRatio = Number(minRatioArg || 4.5);

const targets = await probeTargets(Number(port));
if (!targets.length) throw new Error("没有可探测的 Work Renderer");
const url = targets[0].target.webSocketDebuggerUrl;
if (!url) throw new Error("目标没有 WebSocket 地址");

const session = new CdpSession(url);
await session.open();
const result = await session.evaluate(`(() => {
  const MIN = ${minRatio};
  const parse = (s) => {
    const m = /rgba?\\(([^)]+)\\)/.exec(s || "");
    if (!m) return null;
    const p = m[1].split(",").map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg) => {
    const a = fg.a + bg.a * (1 - fg.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
      g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
      b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
      a,
    };
  };
  const lum = ({ r, g, b }) => {
    const c = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
  };
  const ratio = (t, b) => {
    const l1 = lum(t), l2 = lum(b);
    const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
    return (hi + 0.05) / (lo + 0.05);
  };
  // 基底假设：主题画布覆盖白色后的不透明结果；透明画布按白色处理。
  const themeBg = document.querySelector("#kimi-skin-bg");
  const white = { r: 255, g: 255, b: 255, a: 1 };
  const themeBase = themeBg && parse(getComputedStyle(themeBg).backgroundColor);
  const base = themeBase && themeBase.a > 0 ? over(themeBase, white) : white;

  const shortPath = (el) => {
    const parts = [];
    let cur = el;
    while (cur && cur !== document.body && parts.length < 4) {
      const cls = String(cur.className || "").split(" ").filter(Boolean)[0];
      parts.unshift(cur.tagName.toLowerCase() + (cls ? "." + cls : ""));
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  };

  const findings = [];
  const seen = new Set();
  const els = document.querySelectorAll("body *");
  for (const el of els) {
    const hasOwnText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const isControl = /^(BUTTON|A|INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.getAttribute("role") === "button";
    if (!hasOwnText && !isControl) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const fg = parse(cs.color);
    if (!fg) continue;
    // 沿祖先链合成有效背景
    let bg = { r: 0, g: 0, b: 0, a: 0 };
    let cur = el;
    let assumed = false;
    while (cur && bg.a < 1) {
      const b = parse(getComputedStyle(cur).backgroundColor);
      // 已收集的子层位于当前祖先之前，必须由子层覆盖祖先背景。
      if (b && b.a > 0) bg = over(bg, b);
      cur = cur.parentElement;
    }
    if (bg.a < 1) { bg = over(bg, base); assumed = true; }
    // 半透明文字的实际颜色是文字覆盖有效背景后的结果。
    const effectiveFg = fg.a < 1 ? over(fg, bg) : fg;
    const r = ratio(effectiveFg, bg);
    if (r >= MIN) continue;
    const key = shortPath(el) + "|" + cs.color + "|" + JSON.stringify(bg);
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({
      ratio: Number(r.toFixed(2)),
      path: shortPath(el),
      color: cs.color,
      effectiveBg: "rgb(" + [bg.r, bg.g, bg.b].map(Math.round).join(",") + ")",
      assumedBase: assumed,
    });
    if (findings.length >= 60) break;
  }
  findings.sort((a, b) => a.ratio - b.ratio);
  return { minRatio: MIN, scanned: els.length, count: findings.length, findings };
})()`);

console.log(`对比度审计（WCAG 阈值 ${result.minRatio}:1，扫描 ${result.scanned} 个元素）`);
if (!result.count) {
  console.log("  ✓ 未发现低对比度文字/控件");
} else {
  console.log(`  ⚠ ${result.count} 处低于阈值：`);
  for (const f of result.findings) {
    console.log(
      `    - [${f.ratio}:1] ${f.path}\n` +
      `      前景 ${f.color}  有效底色 ${f.effectiveBg}${f.assumedBase ? "（含基底假设）" : ""}`,
    );
  }
}
session.close();
