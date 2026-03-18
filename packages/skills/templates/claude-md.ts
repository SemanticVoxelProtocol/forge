// claude-md — CLAUDE.md SVP section 生成
// forge init --host claude-code 时追加到 CLAUDE.md
//
// DEPRECATED: This module is a backward-compatible re-export.
// New code should use adapters/claude-code.ts directly.

import { claudeCodeAdapter } from "../adapters/claude-code.js";

export function generateClaudeMdSection(_projectName: string, language = "en"): string {
  return claudeCodeAdapter.generateContextSection(_projectName, language);
}
