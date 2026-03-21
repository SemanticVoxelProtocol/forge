// 共享的 .svp/ 数据加载逻辑
// 两个命令（check, compile-plan）复用

import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  listL2,
  listL3,
  listL4,
  readL2,
  readL3,
  readL4,
  readL5,
  checkCompatibility,
} from "../core/index.js";
import type {
  CheckInput,
  L2CodeBlock,
  L3Block,
  L4Artifact,
} from "../core/index.js";

/** 从 .svp/ 加载所有层数据 */
export async function loadCheckInput(root: string): Promise<CheckInput> {
  // Ensure .svp/ schema is compatible before reading
  await checkCompatibility(root);

  const l5 = (await readL5(root)) ?? undefined;

  const l4Ids = await listL4(root);
  const l4Flows: L4Artifact[] = [];
  for (const id of l4Ids) {
    const l4 = await readL4(root, id);
    if (l4 !== null) l4Flows.push(l4);
  }

  const l3Ids = await listL3(root);
  const l3Blocks: L3Block[] = [];
  for (const id of l3Ids) {
    const block = await readL3(root, id);
    if (block !== null) l3Blocks.push(block);
  }

  const l2Ids = await listL2(root);
  const l2Blocks: L2CodeBlock[] = [];
  for (const id of l2Ids) {
    const cb = await readL2(root, id);
    if (cb !== null) l2Blocks.push(cb);
  }

  // 扫描 nodes/ 目录收集已有文档列表
  const existingNodeDocs = await scanExistingNodeDocs(root);

  return { l5, l4Flows, l3Blocks, l2Blocks, existingNodeDocs };
}

/** Scan nodes/{id}/docs.md, return nodeId set with existing docs */
async function scanExistingNodeDocs(root: string): Promise<Set<string>> {
  const result = new Set<string>();
  const nodesDir = path.join(root, "nodes");
  try {
    const entries = await readdir(nodesDir);
    for (const entry of entries) {
      try {
        const s = await stat(path.join(nodesDir, entry, "docs.md"));
        if (s.isFile()) result.add(entry);
      } catch {
        // docs.md doesn't exist for this node
      }
    }
  } catch {
    // nodes/ directory doesn't exist
  }
  return result;
}


