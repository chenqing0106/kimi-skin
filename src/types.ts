export interface KimiBaseline {
  appPath: string;
  bundleId: string;
  version: string;
  teamId: string | null;
  executablePath: string;
  executableSha256: string;
  signatureValid: boolean;
  signatureMessage: string;
}

export interface RuntimeState {
  schemaVersion: 1;
  mode: "debug";
  appPath: string;
  kimiVersion: string;
  executableSha256: string;
  port: number;
  kimiPid: number;
  kimiStartedAt: string;
  watcherPid: number | null;
  watcherLabel: string | null;
  themePath: string;
  themeId: string;
  createdAt: string;
}

export interface CdpTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

export interface PageProbe {
  href: string;
  protocol: string;
  hostname: string;
  title: string;
  readyState: string;
  hasBody: boolean;
  hasPage: boolean;
  hasSidebar: boolean;
  hasMainPane: boolean;
  hasConversation: boolean;
  hasComposer: boolean;
}

export type KimiPageKind = "work" | "chat" | "loading" | "unknown";

export interface AcceptedTarget {
  target: CdpTarget;
  probe: PageProbe;
  kind: KimiPageKind;
  score: number;
}

export interface ThemeManifest {
  id: string;
  name: string;
  version: string;
  compatibleKimi: string[];
  background?: string;
  capabilities?: string[];
}

export interface LoadedTheme {
  directory: string;
  manifest: ThemeManifest;
  css: string;
  backgroundDataUrl: string | undefined;
}
