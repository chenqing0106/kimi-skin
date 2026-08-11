import { readdir } from "node:fs/promises";
import path from "node:path";
import { readThemeManifest } from "./theme.js";
import type { ThemeDescriptor } from "./theme.js";

export interface SkippedTheme {
  directory: string;
  reason: string;
}

export interface ThemeCatalog {
  themes: ThemeDescriptor[];
  skipped: SkippedTheme[];
}

export function themeSupportsKimi(theme: ThemeDescriptor, kimiVersion: string): boolean {
  const versions = theme.manifest.compatibleKimi;
  return versions.includes("*") || versions.includes(kimiVersion);
}

export async function discoverThemes(themesDirectory: string): Promise<ThemeCatalog> {
  const entries = await readdir(themesDirectory, { withFileTypes: true });
  const themes: ThemeDescriptor[] = [];
  const skipped: SkippedTheme[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
    const directory = path.join(themesDirectory, entry.name);
    try {
      themes.push(await readThemeManifest(directory));
    } catch (error) {
      skipped.push({ directory, reason: (error as Error).message });
    }
  }

  return { themes, skipped };
}
