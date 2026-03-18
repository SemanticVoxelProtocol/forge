// adapters/codex — Codex CLI host adapter

import type { HostAdapter, SkillFile } from "./types.js";
import {
  buildSkillFileContent,
  generateContextBody,
  defaultSlashCommands,
  DEFAULT_CONTEXT_MARKER,
} from "./shared.js";

export const codexAdapter: HostAdapter = {
  id: "codex",
  displayName: "Codex CLI",

  skillDir() {
    return ".codex/skills";
  },

  generateSkillFiles(language = "en"): readonly SkillFile[] {
    const modelTierLine = "heavy=o3 | standard=o4-mini | light=o4-mini";

    return [{ relativePath: "svp/SKILL.md", content: buildSkillFileContent(language, modelTierLine) }];
  },

  contextFilePath() {
    return "AGENTS.md";
  },

  contextMarker() {
    return DEFAULT_CONTEXT_MARKER;
  },

  generateContextSection(projectName: string, language = "en"): string {
    return generateContextBody(projectName, language, {
      modelTierRows: {
        heavy: "o3",
        standard: "o4-mini",
        light: "o4-mini",
      },
      slashCommands: defaultSlashCommands(language),
    });
  },
};
