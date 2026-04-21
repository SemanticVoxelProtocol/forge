// forge compile-plan — 变更检测 + 重编译任务生成的 CLI 命令

import { compilePlan } from "../../core/index.js";
import { loadCheckInput, summarizeLoadedArtifacts } from "../load.js";
import type { CompileTask } from "../../core/index.js";
import type { Command } from "commander";

const ACTION_ICONS: Record<string, string> = {
  compile: "BUILD",
  recompile: "REBUILD",
  "update-ref": "FIX",
  review: "REVIEW",
};

/** 格式化单条任务 */
function formatTask(task: CompileTask, index: number): string {
  const icon = ACTION_ICONS[task.action] ?? task.action.toUpperCase();
  const lines = [
    `  [${String(index + 1)}] ${icon} ${task.targetLayer}/${task.targetId}`,
    `      reason: ${task.reason}`,
    `      code:   ${task.issueCode}`,
  ];

  if (task.context.length > 0) {
    lines.push("      context:");
    for (const ref of task.context) {
      lines.push(`        - ${ref.layer}/${ref.id}: ${ref.label}`);
    }
  }

  return lines.join("\n");
}

/** 注册 forge compile-plan 子命令 */
export function registerCompilePlan(program: Command): void {
  program
    .command("compile-plan")
    .description("Detect changes and generate recompilation task list")
    .option("-r, --root <path>", "Project root directory", ".")
    .option("--json", "Output as JSON")
    .action(async (options: { root: string; json: boolean }) => {
      const input = await loadCheckInput(options.root);

      const summary = summarizeLoadedArtifacts(input);

      if (summary.entityCount === 0) {
        if (options.json) {
          console.log(
            JSON.stringify({
              tasks: [],
              summary: { total: 0, compile: 0, recompile: 0, updateRef: 0, review: 0 },
            }),
          );
        } else {
          console.log("No .svp/ data found. Run `forge init` to create a project.");
        }
        return;
      }

      const plan = compilePlan(input);

      if (options.json) {
        console.log(JSON.stringify(plan, null, 2));
        return;
      }

      // 人类可读输出
      const detailSuffix = summary.layers.length > 0 ? `: ${summary.layers}` : "";
      console.log(
        `forge compile-plan — scanned ${String(summary.entityCount)} entities${detailSuffix}`,
      );
      console.log();

      if (plan.tasks.length === 0) {
        console.log("All layers in sync. No compilation tasks needed.");
        return;
      }

      console.log(`Tasks (${String(plan.summary.total)}):`);
      for (const [index, task] of plan.tasks.entries()) {
        console.log(formatTask(task, index));
        console.log();
      }

      const parts = [
        plan.summary.compile > 0 ? `${String(plan.summary.compile)} compile` : "",
        plan.summary.recompile > 0 ? `${String(plan.summary.recompile)} recompile` : "",
        plan.summary.updateRef > 0 ? `${String(plan.summary.updateRef)} update-ref` : "",
        plan.summary.review > 0 ? `${String(plan.summary.review)} review` : "",
      ]
        .filter(Boolean)
        .join(", ");

      console.log(`Summary: ${parts}`);
    });
}
