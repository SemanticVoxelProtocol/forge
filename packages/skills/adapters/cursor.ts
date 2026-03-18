// adapters/cursor — Cursor host adapter

import {
  buildSkillFileContent,
  genericModelTierLine,
  generateContextBody,
  genericContextOptions,
  DEFAULT_CONTEXT_MARKER,
} from "./shared.js";
import type { HostAdapter, SkillFile } from "./types.js";

export const cursorAdapter: HostAdapter = {
  id: "cursor",
  displayName: "Cursor",

  skillDir() {
    return ".cursor/commands";
  },

  generateSkillFiles(language = "en"): readonly SkillFile[] {
    return [
      {
        relativePath: "svp.md",
        content: buildSkillFileContent(language, genericModelTierLine(language)),
      },
    ];
  },

  contextFilePath() {
    return ".cursor/rules/svp.mdc";
  },

  contextMarker() {
    return DEFAULT_CONTEXT_MARKER;
  },

  generateContextSection(projectName: string, language = "en"): string {
    const frontmatter = [
      "---",
      "description: SVP structured AI-assisted development protocol",
      "globs: .svp/**",
      "alwaysApply: true",
      "---",
      "",
    ].join("\n");

    return (
      frontmatter + generateContextBody(projectName, language, genericContextOptions(language))
    );
  },
};
