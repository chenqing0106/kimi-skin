import type { ThemeWidget } from "./types.js";

export const WIDGET_ROOT_ID = "kimi-skin-widgets";

export interface KimiWorkQuotaSnapshot {
  usedRatio: number;
  resetAt: string | null;
  isHighestLevel: boolean;
}

export function normalizeKimiWorkQuota(value: unknown): KimiWorkQuotaSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const usedRatio = Number(raw.creditUsedRatio);
  if (!Number.isFinite(usedRatio)) return null;
  const resetAt = typeof raw.resetAt === "string" && Number.isFinite(Date.parse(raw.resetAt))
    ? raw.resetAt
    : null;
  return {
    usedRatio: Math.min(1, Math.max(0, usedRatio)),
    resetAt,
    isHighestLevel: raw.isHighestLevel === true,
  };
}

/**
 * Returns a fixed, reviewed runtime for the supported widget declaration.
 * Theme manifests can select the widget and slot, but cannot supply markup,
 * bridge method names, scripts or arbitrary data sources.
 */
export function widgetRuntimeExpression(widgets: ThemeWidget[] | undefined, themeId: string): string {
  const quotaWidget = widgets?.find((widget) => (
    widget.type === "kimi-work-quota" && widget.surface === "home.top-right"
  ));
  if (!quotaWidget) return "";

  return `{
    const widgetRootId = ${JSON.stringify(WIDGET_ROOT_ID)};
    const widgetId = ${JSON.stringify(quotaWidget.id)};
    let disposed = false;
    let refreshing = false;
    let lastSnapshot = null;
    let requestVersion = 0;
    let mountQueued = false;

    const element = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };

    const buildWidget = () => {
      const section = element('section', 'kimi-skin-widget kimi-skin-quota');
      section.dataset.widgetId = widgetId;
      section.dataset.state = 'loading';
      section.setAttribute('aria-label', 'Kimi Work 额度');

      const header = element('header', 'kimi-skin-quota__header');
      header.append(element('span', 'kimi-skin-quota__kicker', 'KIMI WORK / QUOTA'));
      const signal = element('span', 'kimi-skin-quota__signal');
      signal.setAttribute('aria-hidden', 'true');
      header.append(signal);

      const readout = element('div', 'kimi-skin-quota__readout');
      readout.append(element('span', 'kimi-skin-quota__label', 'REMAIN'));
      const remaining = element('strong', 'kimi-skin-quota__value', '--.--%');
      remaining.dataset.role = 'remaining';
      readout.append(remaining);

      const meter = element('div', 'kimi-skin-quota__meter');
      meter.setAttribute('aria-hidden', 'true');
      const fill = element('span', 'kimi-skin-quota__meter-fill');
      fill.dataset.role = 'fill';
      fill.style.width = '0%';
      meter.append(fill);

      const footer = element('footer', 'kimi-skin-quota__footer');
      footer.append(element('span', 'kimi-skin-quota__reset-label', 'RESET'));
      const reset = element('time', 'kimi-skin-quota__reset', 'SYNC...');
      reset.dataset.role = 'reset';
      footer.append(reset);

      const status = element('span', 'kimi-skin-quota__status', 'SYNC');
      status.dataset.role = 'status';
      status.setAttribute('aria-live', 'polite');
      section.append(header, readout, meter, footer, status);
      return section;
    };

    const currentWidget = () => document.querySelector(
      '#' + widgetRootId + ' [data-widget-id="' + widgetId + '"]'
    );

    const formatReset = (resetAt) => {
      if (!resetAt) return 'NO RESET';
      const date = new Date(resetAt);
      if (!Number.isFinite(date.getTime())) return 'NO RESET';
      const two = (part) => String(part).padStart(2, '0');
      return two(date.getMonth() + 1) + '.' + two(date.getDate()) + ' ' + two(date.getHours()) + ':' + two(date.getMinutes());
    };

    const renderSnapshot = (snapshot, state) => {
      const section = currentWidget();
      if (!section) return;
      const usedPercent = snapshot.usedRatio * 100;
      const remainingPercent = Math.max(0, 100 - usedPercent);
      section.dataset.state = state;
      section.dataset.highestLevel = String(snapshot.isHighestLevel);
      section.querySelector('[data-role="remaining"]').textContent = remainingPercent.toFixed(2) + '%';
      section.querySelector('[data-role="fill"]').style.width = usedPercent.toFixed(2) + '%';
      section.querySelector('[data-role="reset"]').textContent = formatReset(snapshot.resetAt);
      section.querySelector('[data-role="status"]').textContent = state === 'stale' ? 'STALE' : 'LIVE';
    };

    const renderUnavailable = () => {
      const section = currentWidget();
      if (!section) return;
      section.dataset.state = 'unavailable';
      section.querySelector('[data-role="remaining"]').textContent = '--.--%';
      section.querySelector('[data-role="fill"]').style.width = '0%';
      section.querySelector('[data-role="reset"]').textContent = 'NO SIGNAL';
      section.querySelector('[data-role="status"]').textContent = 'OFFLINE';
    };

    const refresh = async () => {
      if (disposed || refreshing || !currentWidget()) return;
      refreshing = true;
      const version = ++requestVersion;
      try {
        const api = globalThis.kimiAgentAPI;
        if (!api || typeof api.getDatasourceQuota !== 'function') throw new Error('quota bridge unavailable');
        const raw = await api.getDatasourceQuota();
        const ratio = Number(raw?.creditUsedRatio);
        if (!Number.isFinite(ratio)) throw new Error('invalid quota response');
        const resetAt = typeof raw.resetAt === 'string' && Number.isFinite(Date.parse(raw.resetAt)) ? raw.resetAt : null;
        const snapshot = {
          usedRatio: Math.min(1, Math.max(0, ratio)),
          resetAt,
          isHighestLevel: raw.isHighestLevel === true
        };
        if (disposed || version !== requestVersion) return;
        lastSnapshot = snapshot;
        renderSnapshot(snapshot, 'ready');
      } catch {
        if (disposed || version !== requestVersion) return;
        if (lastSnapshot) renderSnapshot(lastSnapshot, 'stale');
        else renderUnavailable();
      } finally {
        if (version === requestVersion) refreshing = false;
      }
    };

    const ensureMounted = () => {
      if (disposed) return;
      const home = document.querySelector('.home-view');
      const existing = document.getElementById(widgetRootId);
      if (!home) {
        existing?.remove();
        return;
      }
      if (existing?.parentElement === home) return;
      existing?.remove();
      const slot = element('div', 'kimi-skin-slot kimi-skin-slot--home-top-right');
      slot.id = widgetRootId;
      slot.dataset.themeId = ${JSON.stringify(themeId)};
      slot.style.position = 'absolute';
      slot.style.top = '24px';
      slot.style.right = '32px';
      slot.style.zIndex = '3';
      slot.style.pointerEvents = 'none';
      slot.append(buildWidget());
      home.append(slot);
      if (lastSnapshot) renderSnapshot(lastSnapshot, 'ready');
      else void refresh();
    };

    const queueMount = () => {
      if (disposed || mountQueued) return;
      mountQueued = true;
      queueMicrotask(() => {
        mountQueued = false;
        ensureMounted();
      });
    };

    document.getElementById(widgetRootId)?.remove();
    ensureMounted();
    const observer = new MutationObserver(queueMount);
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    const refreshTimer = globalThis.setInterval(() => void refresh(), 60_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        ensureMounted();
        void refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    runtimeCleanups.push(() => {
      disposed = true;
      requestVersion++;
      observer.disconnect();
      globalThis.clearInterval(refreshTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.getElementById(widgetRootId)?.remove();
    });
  }`;
}
