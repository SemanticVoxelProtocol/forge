// adapters/detect — Auto-detect host from project directory markers

import { stat } from "node:fs/promises";
import path from "node:path";
import type { HostId } from "./types.js";

/** Marker paths mapped to their host IDs (checked in order).
 *  `kind` determines whether to check for a directory or a file. */
const HOST_MARKERS: ReadonlyArray<{ marker: string; kind: "dir" | "file"; host: HostId }> = [
  { marker: ".claude", kind: "dir", host: "claude-code" },
  { marker: ".cursor", kind: "dir", host: "cursor" },
  { marker: ".windsurf", kind: "dir", host: "windsurf" },
  { marker: ".agents", kind: "dir", host: "kimi-code" },
  { marker: ".codex", kind: "dir", host: "codex" },
  { marker: ".github/copilot-instructions.md", kind: "file", host: "github-copilot" },
];

async function pathExists(p: string, kind: "dir" | "file"): Promise<boolean> {
  try {
    const s = await stat(p);
    return kind === "dir" ? s.isDirectory() : s.isFile();
  } catch {
    return false;
  }
}

/**
 * Detect which host(s) are present by checking for marker directories/files.
 * Returns all detected host IDs (may be empty or have multiple).
 */
export async function detectHosts(root: string): Promise<HostId[]> {
  const detected: HostId[] = [];
  for (const { marker, kind, host } of HOST_MARKERS) {
    if (await pathExists(path.join(root, marker), kind)) {
      detected.push(host);
    }
  }
  return detected;
}

/**
 * Detect a single host from project directory markers.
 * Returns the first match, or null if none found.
 */
export async function detectHost(root: string): Promise<HostId | null> {
  const hosts = await detectHosts(root);
  return hosts[0] ?? null;
}
