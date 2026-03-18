// adapters/windsurf — Windsurf host adapter

import {
  buildSkillFileContent,
  genericModelTierLine,
  generateContextBody,
  genericContextOptions,
  DEFAULT_CONTEXT_MARKER,
} from "./shared.js";
import type { HostAdapter, SkillFile } from "./types.js";

export const windsurfAdapter: HostAdapter = {
  id: "windsurf",
  displayName: "Windsurf",

  skillDir() {
    return ".windsurf/commands";
  },

  generateSkillFiles(language = "en"): readonly SkillFile[] {
    return [{ relativePath: "svp.md", content: buildSkillFileContent(language, genericModelTierLine(language)) }];
  },

  contextFilePath() {
    return ".windsurf/rules/svp.md";
  },

  contextMarker() {
    return DEFAULT_CONTEXT_MARKER;
  },

  generateContextSection(projectName: string, language = "en"): string {
    return generateContextBody(projectName, language, genericContextOptions(language));
  },
};
