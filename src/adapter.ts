import { CdpSession, listTargets } from "./cdp.js";
import type { AcceptedTarget, KimiPageKind, PageProbe } from "./types.js";

const PROBE_EXPRESSION = `(() => ({
  href: location.href,
  protocol: location.protocol,
  hostname: location.hostname,
  title: document.title,
  readyState: document.readyState,
  hasBody: Boolean(document.body),
  hasPage: Boolean(document.querySelector('.page')),
  hasSidebar: Boolean(document.querySelector('aside.sidebar, .sidebar')),
  hasMainPane: Boolean(document.querySelector('main.main-pane, .main-pane')),
  hasConversation: Boolean(document.querySelector('.conversation-view')),
  hasComposer: Boolean(document.querySelector('.composer'))
}))()`;

export function allowedKimiLocation(probe: PageProbe): boolean {
  if (probe.protocol === "app:" || probe.protocol === "file:") return true;
  return false;
}

export function scoreProbe(probe: PageProbe): { score: number; kind: KimiPageKind } {
  if (!probe.hasBody || !allowedKimiLocation(probe)) return { score: 0, kind: "unknown" };
  const structural = [
    probe.hasPage,
    probe.hasSidebar,
    probe.hasMainPane,
    probe.hasConversation,
    probe.hasComposer,
  ].filter(Boolean).length;

  if (structural < 2) {
    return { score: structural, kind: probe.readyState === "complete" ? "unknown" : "loading" };
  }
  const href = probe.href.toLowerCase();
  const kind: KimiPageKind = href.includes("chat") ? "chat" : "work";
  return { score: structural, kind };
}

export async function probeTargets(port: number): Promise<AcceptedTarget[]> {
  const results: AcceptedTarget[] = [];
  for (const target of await listTargets(port)) {
    if (target.type !== "page" || !target.webSocketDebuggerUrl) continue;
    const session = new CdpSession(target.webSocketDebuggerUrl);
    try {
      await session.open();
      const probe = await session.evaluate<PageProbe>(PROBE_EXPRESSION);
      const ranked = scoreProbe(probe);
      if (ranked.score >= 2 && ranked.kind !== "unknown") {
        results.push({ target, probe, score: ranked.score, kind: ranked.kind });
      }
    } catch {
      // A transient or non-Kimi page is ignored.
    } finally {
      session.close();
    }
  }
  return results.sort((a, b) => b.score - a.score);
}

export async function waitForAcceptedTarget(port: number, timeoutMs = 30_000): Promise<AcceptedTarget> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const accepted = await probeTargets(port);
    if (accepted[0]) return accepted[0];
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("没有找到满足 Kimi 页面能力要求的 Renderer，已停止注入");
}
