// adapters/index — Host adapter registry

export type { HostId, HostAdapter, SkillFile } from "./types.js";
export { detectHost, detectHosts } from "./detect.js";

import { claudeCodeAdapter } from "./claude-code.js";
import { codexAdapter } from "./codex.js";
import { cursorAdapter } from "./cursor.js";
import { githubCopilotAdapter } from "./github-copilot.js";
import { kimiCodeAdapter } from "./kimi-code.js";
import { kodeAdapter } from "./kode.js";
import { windsurfAdapter } from "./windsurf.js";
import type { HostId, HostAdapter } from "./types.js";

const adapters: Record<HostId, HostAdapter> = {
  "claude-code": claudeCodeAdapter,
  "kimi-code": kimiCodeAdapter,
  codex: codexAdapter,
  cursor: cursorAdapter,
  windsurf: windsurfAdapter,
  "github-copilot": githubCopilotAdapter,
  kode: kodeAdapter,
};

export function getAdapter(host: HostId): HostAdapter {
  const adapter = (adapters as Record<string, HostAdapter | undefined>)[host];
  if (adapter === undefined) {
    throw new Error(`Unknown host: ${host}`);
  }
  return adapter;
}

export function getAllAdapterIds(): readonly HostId[] {
  return Object.keys(adapters) as HostId[];
}
