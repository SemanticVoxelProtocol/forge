// ApplyResult — 把 Skill 执行结果写回 .svp/ 和 L1 源文件

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { writeL2, writeL3, writeL4 } from "../core/index.js";
import type {
  Artifact,
  FileArtifact,
  L2CodeBlock,
  L3Block,
  L4Flow,
  TaskExecution,
} from "../core/index.js";

/** 创建 applyResult 回调（需要 project root） */
export function createApplyResult(root: string): (execution: TaskExecution) => Promise<void> {
  return async (execution: TaskExecution): Promise<void> => {
    // 写层制品（L2/L3/L4）
    for (const artifact of execution.result.artifacts) {
      await writeArtifact(root, artifact);
    }

    // 写 L1 源文件（如果有）
    if ("files" in execution.result) {
      const result = execution.result;
      for (const file of result.files) {
        await writeFileArtifact(root, file);
      }
    }
  };
}

/** 写入单个层制品 */
async function writeArtifact(root: string, artifact: Artifact): Promise<void> {
  switch (artifact.layer) {
    case "l2": {
      await writeL2(root, artifact.data as L2CodeBlock);
      break;
    }
    case "l3": {
      await writeL3(root, artifact.data as L3Block);
      break;
    }
    case "l4": {
      await writeL4(root, artifact.data as L4Flow);
      break;
    }
  }
}

/** 写入 L1 源文件 */
async function writeFileArtifact(root: string, file: FileArtifact): Promise<void> {
  const absPath = path.resolve(root, file.path);

  if (file.action === "delete") {
    // 删除操作暂不实现，留给后续（需要用户确认）
    return;
  }

  // create 或 modify 都是写文件
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, file.content, "utf8");
}
