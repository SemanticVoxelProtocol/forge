// adapters/opencode — OpenCode host adapter

import {
  buildSkillFileContent,
  generateContextBody,
  defaultSlashCommands,
  DEFAULT_CONTEXT_MARKER,
  genericModelTierLine,
  GENERIC_MODEL_TIERS,
  GENERIC_MODEL_TIERS_ZH,
} from "./shared.js";
import type { HostAdapter, SkillFile } from "./types.js";

export const opencodeAdapter: HostAdapter = {
  id: "opencode",
  displayName: "OpenCode",

  skillDir() {
    return ".opencode/command";
  },

  generateSkillFiles(language = "en"): readonly SkillFile[] {
    return [
      {
        relativePath: "forge.md",
        content: buildSkillFileContent(language, genericModelTierLine(language)),
      },
    ];
  },

  contextFilePath() {
    return "AGENTS.md";
  },

  contextMarker() {
    return DEFAULT_CONTEXT_MARKER;
  },

  generateContextSection(projectName: string, language = "en"): string {
    const tiers = language === "zh" ? GENERIC_MODEL_TIERS_ZH : GENERIC_MODEL_TIERS;
    return generateContextBody(projectName, language, {
      modelTierRows: tiers,
      slashCommands: defaultSlashCommands(language),
    });
  },
};
