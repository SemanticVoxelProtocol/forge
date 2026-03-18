// adapters/github-copilot — GitHub Copilot host adapter

import {
  buildSkillFileContent,
  genericModelTierLine,
  generateContextBody,
  genericContextOptions,
  DEFAULT_CONTEXT_MARKER,
} from "./shared.js";
import type { HostAdapter, SkillFile } from "./types.js";

export const githubCopilotAdapter: HostAdapter = {
  id: "github-copilot",
  displayName: "GitHub Copilot",

  skillDir() {
    return ".github/prompts";
  },

  generateSkillFiles(language = "en"): readonly SkillFile[] {
    return [{ relativePath: "svp.prompt.md", content: buildSkillFileContent(language, genericModelTierLine(language)) }];
  },

  contextFilePath() {
    return ".github/copilot-instructions.md";
  },

  contextMarker() {
    return DEFAULT_CONTEXT_MARKER;
  },

  generateContextSection(projectName: string, language = "en"): string {
    return generateContextBody(projectName, language, genericContextOptions(language));
  },
};
