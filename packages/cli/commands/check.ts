// forge check — 层间一致性校验命令
// 读取 .svp/ 目录下的所有数据，调用 core.check()，格式化输出结果

import { check } from "../../core/index.js";
import { loadCheckInput, summarizeLoadedArtifacts } from "../load.js";
import type { CheckIssue } from "../../core/index.js";
import type { Command } from "commander";

/** 格式化单条 issue */
function formatIssue(issue: CheckIssue): string {
  const icon = issue.severity === "error" ? "ERROR" : "WARN ";
  return `  ${icon} [${issue.code}] ${issue.layer}/${issue.entityId}: ${issue.message}`;
}

/** 注册 forge check 子命令 */
export function registerCheck(program: Command): void {
  program
    .command("check")
    .description("Validate cross-layer consistency of .svp/ data")
    .option("-r, --root <path>", "Project root directory", ".")
    .option("--json", "Output as JSON")
    .action(async (options: { root: string; json: boolean }) => {
      const input = await loadCheckInput(options.root);

      const summary = summarizeLoadedArtifacts(input);

      if (summary.entityCount === 0) {
        if (options.json) {
          console.log(JSON.stringify({ issues: [], summary: { errors: 0, warnings: 0 } }));
        } else {
          console.log("No .svp/ data found. Run `forge init` to create a project.");
        }
        return;
      }

      const report = check(input);

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }

      // 人类可读输出
      console.log(`forge check — loaded: ${summary.layers}`);
      console.log();

      if (report.issues.length === 0) {
        console.log("All checks passed. No issues found.");
        return;
      }

      // 按 severity 分组输出
      const errors = report.issues.filter((i) => i.severity === "error");
      const warnings = report.issues.filter((i) => i.severity === "warning");

      if (errors.length > 0) {
        console.log(`Errors (${String(errors.length)}):`);
        for (const issue of errors) {
          console.log(formatIssue(issue));
        }
        console.log();
      }

      if (warnings.length > 0) {
        console.log(`Warnings (${String(warnings.length)}):`);
        for (const issue of warnings) {
          console.log(formatIssue(issue));
        }
        console.log();
      }

      // 摘要
      console.log(
        `Summary: ${String(report.summary.errors)} error(s), ${String(report.summary.warnings)} warning(s)`,
      );

      // 有 error 时退出码为 1
      if (report.summary.errors > 0) {
        process.exitCode = 1;
      }
    });
}
