// svp fix — 自动检测一致性问题并批量生成修复提示词
// check → compilePlan → resolve → buildPrompt → stdout

import { compilePlan } from "../../core/compile-plan.js";
import { getLanguage } from "../../core/i18n.js";
import { DEFAULT_SKILL_CONFIG } from "../../core/skill.js";
import { buildPrompt, renderPrompt } from "../../skills/prompt-builder.js";
import { loadCheckInput } from "../load.js";
import { createResolver } from "../resolve.js";
import type { CompileTask, TaskAction } from "../../core/compile-plan.js";
import type { SkillInput } from "../../core/skill.js";
import type { Command } from "commander";

/** 注册 svp fix 命令 */
export function registerFix(program: Command): void {
  program
    .command("fix")
    .description("Auto-detect issues and generate fix prompts for all compile tasks")
    .option("-r, --root <path>", "Project root directory", ".")
    .option("--severity <level>", "Minimum severity: error (default) or warning", "error")
    .option("--action <type>", "Only generate prompts for this action (compile/recompile/update-ref/review)")
    .option("--dry-run", "Print compile-plan summary only, do not generate prompts")
    .action(async (options: { root: string; severity: string; action?: string; dryRun?: boolean }) => {
      const root = options.root;

      let input;
      try {
        input = await loadCheckInput(root);
      } catch {
        console.error(`Error: cannot load .svp/ data from "${root}". Run \`svp init\` first.`);
        process.exitCode = 1;
        return;
      }

      const language = getLanguage(input.l5);
      const plan = compilePlan(input, language);

      // Filter by action if specified
      let tasks = plan.tasks as CompileTask[];
      if (options.action !== undefined) {
        const action = options.action as TaskAction;
        tasks = tasks.filter((t) => t.action === action);
      }

      if (tasks.length === 0) {
        console.log("All checks passed — no fix tasks generated.");
        return;
      }

      // Dry-run: print summary only
      if (options.dryRun === true) {
        console.log(`Compile plan: ${tasks.length} task(s)`);
        for (const [i, task] of tasks.entries()) {
          console.log(`  [${i + 1}] ${task.action} · ${task.targetLayer}/${task.targetId} · ${task.issueCode}`);
        }
        return;
      }

      // Generate prompts
      const resolver = createResolver(root);
      for (const [i, task] of tasks.entries()) {
        if (i > 0) console.log("\n---\n");
        console.log(`## [${i + 1}/${tasks.length}] ${task.action} · ${task.targetLayer}/${task.targetId} · ${task.issueCode}\n`);

        const resolved = await resolver.resolve(task, input);
        const skillInput: SkillInput = { task, resolved, config: DEFAULT_SKILL_CONFIG };
        const structured = buildPrompt(skillInput);
        console.log(renderPrompt(structured));
      }
    });
}
