// Claude Code adapter — CodeCLIAdapter 实现
// Prompt 即 Skill：execute() 生成结构化 prompt，由宿主 AI 执行

import { createSkillRegistry } from "../../core/skill.js";
import { buildPrompt, renderPrompt } from "../prompt-builder.js";
import type { CodeCLIAdapter } from "../../core/adapter.js";
import type { TaskAction } from "../../core/compile-plan.js";
import type { Skill, SkillInput, SkillResult } from "../../core/skill.js";

function createPromptSkill(action: TaskAction): Skill {
  return {
    action,
    execute: (input: SkillInput): Promise<SkillResult> => {
      const prompt = buildPrompt(input);
      return Promise.resolve({
        action: input.task.action,
        status: "needs-review" as const,
        artifacts: [],
        notes: renderPrompt(prompt),
      });
    },
  };
}

export const claudeCodeAdapter: CodeCLIAdapter = {
  name: "claude-code",
  createSkillRegistry: () =>
    createSkillRegistry([
      createPromptSkill("compile"),
      createPromptSkill("recompile"),
      createPromptSkill("review"),
      createPromptSkill("update-ref"),
    ]),
};
