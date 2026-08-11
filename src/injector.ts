import { CdpSession } from "./cdp.js";
import type { AcceptedTarget, LoadedTheme } from "./types.js";

const STYLE_ID = "kimi-skin-style";
const BACKGROUND_ID = "kimi-skin-bg";

function injectionExpression(theme: LoadedTheme): string {
  const backgroundImage = theme.backgroundDataUrl ? `url("${theme.backgroundDataUrl}")` : "none";
  return `(() => {
    document.getElementById(${JSON.stringify(STYLE_ID)})?.remove();
    document.getElementById(${JSON.stringify(BACKGROUND_ID)})?.remove();
    const style = document.createElement('style');
    style.id = ${JSON.stringify(STYLE_ID)};
    style.dataset.themeId = ${JSON.stringify(theme.manifest.id)};
    style.textContent = ${JSON.stringify(theme.css)};
    document.documentElement.appendChild(style);
    const background = document.createElement('div');
    background.id = ${JSON.stringify(BACKGROUND_ID)};
    background.setAttribute('aria-hidden', 'true');
    document.documentElement.appendChild(background);
    document.documentElement.style.setProperty('--kimi-skin-background-image', ${JSON.stringify(backgroundImage)});
    document.documentElement.dataset.kimiSkinTheme = ${JSON.stringify(theme.manifest.id)};
    return {
      stylePresent: Boolean(document.getElementById(${JSON.stringify(STYLE_ID)})),
      backgroundPresent: Boolean(document.getElementById(${JSON.stringify(BACKGROUND_ID)})),
      themeId: document.documentElement.dataset.kimiSkinTheme || null
    };
  })()`;
}

const VERIFY_EXPRESSION = `(() => ({
  stylePresent: Boolean(document.getElementById(${JSON.stringify(STYLE_ID)})),
  backgroundPresent: Boolean(document.getElementById(${JSON.stringify(BACKGROUND_ID)})),
  themeId: document.documentElement.dataset.kimiSkinTheme || null
}))()`;

const RESTORE_EXPRESSION = `(() => {
  document.getElementById(${JSON.stringify(STYLE_ID)})?.remove();
  document.getElementById(${JSON.stringify(BACKGROUND_ID)})?.remove();
  document.documentElement.style.removeProperty('--kimi-skin-background-image');
  delete document.documentElement.dataset.kimiSkinTheme;
  return {
    stylePresent: Boolean(document.getElementById(${JSON.stringify(STYLE_ID)})),
    backgroundPresent: Boolean(document.getElementById(${JSON.stringify(BACKGROUND_ID)})),
    themeId: document.documentElement.dataset.kimiSkinTheme || null
  };
})()`;

interface ThemeMarker {
  stylePresent: boolean;
  backgroundPresent: boolean;
  themeId: string | null;
}

async function withTarget<T>(accepted: AcceptedTarget, action: (session: CdpSession) => Promise<T>): Promise<T> {
  const url = accepted.target.webSocketDebuggerUrl;
  if (!url) throw new Error("目标 Renderer 没有 WebSocket 地址");
  const session = new CdpSession(url);
  try {
    await session.open();
    return await action(session);
  } finally {
    session.close();
  }
}

export async function injectTheme(target: AcceptedTarget, theme: LoadedTheme): Promise<void> {
  const result = await withTarget(target, (session) => session.evaluate<ThemeMarker>(injectionExpression(theme)));
  if (!result.stylePresent || !result.backgroundPresent || result.themeId !== theme.manifest.id) {
    throw new Error("主题调用完成，但最终页面状态验证失败");
  }
}

export async function themeIsApplied(target: AcceptedTarget, themeId: string): Promise<boolean> {
  try {
    const result = await withTarget(target, (session) => session.evaluate<ThemeMarker>(VERIFY_EXPRESSION));
    return result.stylePresent && result.backgroundPresent && result.themeId === themeId;
  } catch {
    return false;
  }
}

export async function restoreTarget(target: AcceptedTarget): Promise<void> {
  const result = await withTarget(target, (session) => session.evaluate<ThemeMarker>(RESTORE_EXPRESSION));
  if (result.stylePresent || result.backgroundPresent || result.themeId) {
    throw new Error(`Renderer ${target.target.id} 未能验证恢复`);
  }
}
