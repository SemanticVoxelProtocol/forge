// slash-commands — unified /svp slash command template
// svp init --host claude-code 时生成到 .claude/commands/
// 纯 toolchain 操作（check/view）由用户直接运行 CLI，不需要 slash command
//
// DEPRECATED: This module is a backward-compatible re-export.
// New code should use adapters/claude-code.ts directly.

import { claudeCodeAdapter } from "../adapters/claude-code.js";

export interface SlashCommandTemplate {
  readonly filename: string;
  readonly content: string;
}

export function generateSlashCommands(language = "en"): readonly SlashCommandTemplate[] {
  const files = claudeCodeAdapter.generateSkillFiles(language);
  return files.map((f) => ({ filename: f.relativePath, content: f.content }));
}
