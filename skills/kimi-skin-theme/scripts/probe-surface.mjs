// 通用表面探测：计算样式 + 祖先链背景色。
// 用法：node skills/kimi-skin-theme/scripts/probe-surface.mjs <cdp端口> <选择器>
// 例：node skills/kimi-skin-theme/scripts/probe-surface.mjs 58959 .composer
// 改表面颜色、排查嵌套边框、定位"白色断层"前先跑它，不要猜选择器。
import { CdpSession } from "../../../dist/cdp.js";
import { probeTargets } from "../../../dist/adapter.js";

const [port, selector] = process.argv.slice(2);
if (!port || !selector) {
  console.error("用法: node probe-surface.mjs <cdp端口> <选择器>");
  process.exit(1);
}

const targets = await probeTargets(Number(port));
if (!targets.length) throw new Error("没有可探测的 Work Renderer");
const url = targets[0].target.webSocketDebuggerUrl;
if (!url) throw new Error("目标没有 WebSocket 地址");

const session = new CdpSession(url);
await session.open();
const result = await session.evaluate(`(() => {
  const pick = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      cls: String(el.className).slice(0, 60),
      bg: s.backgroundColor,
      border: s.border,
      radius: s.borderRadius,
      shadow: s.boxShadow.slice(0, 80),
      size: Math.round(r.width) + 'x' + Math.round(r.height),
    };
  };
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return { error: "选择器未命中: " + ${JSON.stringify(selector)} };
  const ancestors = [];
  let p = el.parentElement;
  while (p && p !== document.documentElement) {
    ancestors.push(pick(p));
    p = p.parentElement;
  }
  return {
    state: document.documentElement.getAttribute('data-kimi-skin-state'),
    target: pick(el),
    children: Array.from(el.children).slice(0, 6).map(pick),
    ancestors,
  };
})()`);
console.log(JSON.stringify(result, null, 2));
session.close();
