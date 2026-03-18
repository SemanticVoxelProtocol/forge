// adapters/cline — Cline host adapter

import {
  buildSkillFileContent,
  genericModelTierLine,
  generateContextBody,
  genericContextOptions,
  DEFAULT_CONTEXT_MARKER,
} from "./shared.js";
import type { HostAdapter, SkillFile } from "./types.js";

export const clineAdapter: HostAdapter = {
  id: "cline",
  displayName: "Cline",

  skillDir() {
    return ".cline/skills";
  },

  generateSkillFiles(language = "en"): readonly SkillFile[] {
    return [
      {
        relativePath: "svp/SKILL.md",
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
    return generateContextBody(projectName, language, genericContextOptions(language));
  },
};
