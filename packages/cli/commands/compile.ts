// svp compile — 收敛循环编排命令
// 调用 orchestrator 驱动 Skill 执行，直到所有层同步

import { runOrchestrator } from "../../core/index.js";
import { createApplyResult } from "../apply.js";
import { loadCheckInput } from "../load.js";
import { createResolver } from "../resolve.js";
import type { CodeCLIAdapter } from "../../core/adapter.js";
import type { OrchestratorConfig } from "../../core/index.js";
import type { Command } from "commander";

/** 注册 svp compile 子命令 */
export function registerCompile(program: Command, adapter: CodeCLIAdapter): void {
  program
    .command("compile")
    .description("Run convergence loop: detect changes → dispatch skills → apply results")
    .option("-r, --root <path>", "Project root directory", ".")
    .option("--max-iterations <n>", "Maximum convergence iterations", "5")
    .option("--dry-run", "Only show what would be done, don't write results")
    .option("--json", "Output as JSON")
    .action(
      async (options: { root: string; maxIterations: string; dryRun: boolean; json: boolean }) => {
        const root = options.root;
        const maxIterations = Number.parseInt(options.maxIterations, 10);

        // Skill 注册表由 adapter 提供（skill 实现来自宿主 CLI）
        const registry = adapter.createSkillRegistry();
        const resolver = createResolver(root);
        const applyResult = createApplyResult(root);

        const config: OrchestratorConfig = {
          maxIterations,
          ...(options.dryRun
            ? {
                skillConfigs: {
                  compile: {
                    maxFilesToCreate: 10,
                    maxFilesToModify: 20,
                    dryRun: true,
                    requireHumanApproval: false,
                  },
                  recompile: {
                    maxFilesToCreate: 10,
                    maxFilesToModify: 20,
                    dryRun: true,
                    requireHumanApproval: false,
                  },
                  "update-ref": {
                    maxFilesToCreate: 10,
                    maxFilesToModify: 20,
                    dryRun: true,
                    requireHumanApproval: false,
                  },
                  review: {
                    maxFilesToCreate: 10,
                    maxFilesToModify: 20,
                    dryRun: true,
                    requireHumanApproval: true,
                  },
                },
              }
            : {}),
        };

        const result = await runOrchestrator(
          () => loadCheckInput(root, { computeSignatures: true }),
          registry,
          resolver,
          applyResult,
          config,
        );

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        // 人类可读输出
        console.log(`svp compile — ${result.converged ? "converged" : "did not converge"}`);
        console.log(`  iterations: ${String(result.iterations.length)}`);
        console.log(`  tasks executed: ${String(result.totalTasksExecuted)}`);
        console.log();

        for (const iter of result.iterations) {
          console.log(`Iteration ${String(iter.iteration)}:`);
          console.log(`  dispatched: ${String(iter.tasksDispatched)}`);

          for (const exec of iter.executions) {
            const icon =
              exec.result.status === "done"
                ? "OK"
                : exec.result.status === "blocked"
                  ? "BLOCKED"
                  : "REVIEW";
            console.log(
              `    ${icon} ${exec.task.action} ${exec.task.targetLayer}/${exec.task.targetId}`,
            );
            if (exec.result.notes !== "") {
              console.log(`         ${exec.result.notes}`);
            }
          }

          if (iter.errors.length > 0) {
            for (const err of iter.errors) {
              console.log(`    ERROR: ${err}`);
            }
          }
          console.log();
        }

        if (!result.converged && result.iterations.length > 0) {
          console.log(
            "Warning: convergence loop did not complete. Some tasks may still be pending.",
          );
          process.exitCode = 1;
        }
      },
    );
}
