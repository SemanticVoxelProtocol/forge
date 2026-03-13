// ContextResolver 实现 — 把 CompileTask 的 context refs 解析为实际数据
// 供 orchestrator 注入

import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  CheckInput,
  CompileTask,
  ContextResolver,
  FileContent,
  ResolvedContext,
} from "../core/index.js";

/** 创建 ContextResolver（需要 project root 来读 L1 文件） */
export function createResolver(root: string): ContextResolver {
  return {
    resolve: async (task: CompileTask, input: CheckInput): Promise<ResolvedContext> => {
      const ctx: {
        l5?: ResolvedContext["l5"];
        l3?: ResolvedContext["l3"];
        l2?: ResolvedContext["l2"];
        l4?: ResolvedContext["l4"];
        l1Files?: FileContent[];
      } = {};

      for (const ref of task.context) {
        switch (ref.layer) {
          case "l5": {
            if (input.l5 !== undefined) ctx.l5 = input.l5;
            break;
          }
          case "l4": {
            ctx.l4 = input.l4Flows.find((f) => f.id === ref.id);
            break;
          }
          case "l3": {
            ctx.l3 = input.l3Blocks.find((b) => b.id === ref.id);
            break;
          }
          case "l2": {
            ctx.l2 = input.l2Blocks.find((cb) => cb.id === ref.id);
            break;
          }
        }
      }

      // compile/recompile 需要读 L1 源文件
      if ((task.action === "compile" || task.action === "recompile") && ctx.l2 !== undefined) {
        ctx.l1Files = await readL1Files(root, ctx.l2.files);
      }

      return ctx;
    },
  };
}

/** 读取 L1 源文件内容（忽略不存在的文件） */
async function readL1Files(root: string, filePaths: readonly string[]): Promise<FileContent[]> {
  const files: FileContent[] = [];
  for (const fp of filePaths) {
    try {
      const absPath = path.resolve(root, fp);
      const content = await readFile(absPath, "utf8");
      files.push({ path: fp, content });
    } catch {
      // 文件不存在（初次编译时正常）
    }
  }
  return files;
}
