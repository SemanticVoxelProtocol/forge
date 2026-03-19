// forge link — 创建 L2CodeBlock（L3 和 L1 之间的桥接层）
// AI 生成 L1 源代码后运行，创建/更新 L2 映射

import { checkCompatibility, readL2, readL3, writeL2 } from "../../core/index.js";
import { createL2Link, relinkL2 } from "../../skills/index.js";
import type { Command } from "commander";

/** 注册 forge link 子命令 */
export function registerLink(program: Command): void {
  program
    .command("link")
    .description("Create or update L2 code block linking L3 contract to L1 source files")
    .argument("<l3-id>", "L3 block ID to link")
    .requiredOption("--files <paths...>", "L1 source file paths")
    .option("--language <lang>", "Programming language", "typescript")
    .option("-r, --root <path>", "Project root directory", ".")
    .option("--json", "Output as JSON")
    .action(
      async (
        l3Id: string,
        options: { files: string[]; language: string; root: string; json: boolean },
      ) => {
        const root = options.root;

        // Ensure schema compatibility
        await checkCompatibility(root);

        // 读取 L3 contract
        const l3 = await readL3(root, l3Id);
        if (l3 === null) {
          console.error(`L3 block "${l3Id}" not found in .svp/l3/`);
          process.exitCode = 1;
          return;
        }

        // 检查是否已有 L2（relink vs create）
        const existingL2 = await readL2(root, l3Id);

        let l2;
        let action: string;
        if (existingL2 === null) {
          l2 = createL2Link({ l3Block: l3, files: options.files, language: options.language });
          action = "linked";
        } else {
          l2 = relinkL2(existingL2, l3, options.files);
          action = "relinked";
        }

        await writeL2(root, l2);

        if (options.json) {
          console.log(JSON.stringify(l2, null, 2));
          return;
        }

        const fileCount = String(options.files.length);
        console.log(
          `${action === "linked" ? "Linked" : "Relinked"} l3/${l3Id} -> l2/${l2.id} (${fileCount} file(s))`,
        );
      },
    );
}
