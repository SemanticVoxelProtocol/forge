// adapters/claude-code — Claude Code host adapter

import {
  buildSkillFileContent,
  generateContextBody,
  defaultSlashCommands,
  DEFAULT_CONTEXT_MARKER,
} from "./shared.js";
import type { HostAdapter, SkillFile } from "./types.js";

export const claudeCodeAdapter: HostAdapter = {
  id: "claude-code",
  displayName: "Claude Code",

  skillDir() {
    return ".claude/commands";
  },

  generateSkillFiles(language = "en"): readonly SkillFile[] {
    const modelTierLine =
      language === "zh"
        ? "heavy=opus/最强 | standard=sonnet/均衡 | light=haiku/最快"
        : "heavy=opus/strongest | standard=sonnet/balanced | light=haiku/fastest";

    return [{ relativePath: "svp.md", content: buildSkillFileContent(language, modelTierLine) }];
  },

  contextFilePath() {
    return "CLAUDE.md";
  },

  contextMarker() {
    return DEFAULT_CONTEXT_MARKER;
  },

  generateContextSection(projectName: string, language = "en"): string {
    return generateContextBody(projectName, language, {
      modelTierRows: {
        heavy: language === "zh" ? "opus / 最强" : "opus / most capable",
        standard: language === "zh" ? "sonnet / 均衡" : "sonnet / balanced",
        light: language === "zh" ? "haiku / 最快" : "haiku / fastest",
      },
      slashCommands: defaultSlashCommands(language),
    });
  },
};
