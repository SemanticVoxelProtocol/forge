// svp compile-blueprint — 将 YAML 节点图编译为 .svp/ JSON

import { compileBlueprint } from "../../compiler/compile.js";
import type { Command } from "commander";

export function registerCompileBlueprint(program: Command): void {
  program
    .command("compile-blueprint")
    .description("将 nodes/*.yaml + graphs/*.yaml 编译为 .svp/ 下的 L3/L4 JSON")
    .option("-r, --root <path>", "项目根目录", process.cwd())
    .option("--json", "以 JSON 格式输出结果")
    .action(async (options: { root: string; json?: boolean }) => {
      const result = await compileBlueprint(options.root);

      if (!result.ok) {
        if (options.json === true) {
          console.log(JSON.stringify({ ok: false, error: result.error }, null, 2));
        } else {
          console.error(`编译失败: ${result.error.message}`);
          if (result.error.path !== undefined) {
            console.error(`  文件: ${result.error.path}`);
          }
        }
        process.exitCode = 1;
        return;
      }

      if (options.json === true) {
        console.log(JSON.stringify({ ok: true, ...result.value }, null, 2));
      } else {
        console.log("编译完成!");
        console.log(`  L3 blocks: ${result.value.l3Blocks.join(", ") || "(无)"}`);
        console.log(`  L4 flows:  ${result.value.l4Flows.join(", ") || "(无)"}`);
      }
    });
}
