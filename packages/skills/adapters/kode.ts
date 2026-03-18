// adapters/kode — Kode host adapter (@shareai-lab/kode)

import {
  buildSkillFileContent,
  genericModelTierLine,
  generateContextBody,
  genericContextOptions,
  DEFAULT_CONTEXT_MARKER,
} from "./shared.js";
import type { HostAdapter, SkillFile } from "./types.js";

export const kodeAdapter: HostAdapter = {
  id: "kode",
  displayName: "Kode",

  skillDir() {
    return ".kode/skills";
  },

  generateSkillFiles(language = "en"): readonly SkillFile[] {
    const frontmatter = [
      "---",
      "name: svp",
      language === "zh"
        ? "description: SVP 编译器与交互式向导"
        : "description: SVP compiler and interactive wizard",
      "allowed-tools: Bash Read Write Edit",
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
