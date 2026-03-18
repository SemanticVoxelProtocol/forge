// adapters/roo-code — RooCode host adapter

import {
  buildSkillFileContent,
  genericModelTierLine,
  generateContextBody,
  genericContextOptions,
  DEFAULT_CONTEXT_MARKER,
} from "./shared.js";
import type { HostAdapter, SkillFile } from "./types.js";

export const rooCodeAdapter: HostAdapter = {
  id: "roo-code",
  displayName: "RooCode",

  skillDir() {
    return ".roo/skills";
  },

  generateSkillFiles(language = "en"): readonly SkillFile[] {
    const frontmatter = [
      "---",
      "name: svp",
      language === "zh"
        ? "description: SVP 编译器与交互式向导"
        : "description: SVP compiler and interactive wizard",
      "---",
      "",
    ].join("\n");

    return [
      {
        relativePath: "svp/SKILL.md",
        content: buildSkillFileContent(language, genericModelTierLine(language), frontmatter),
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
