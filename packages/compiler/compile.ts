// 顶层编排：扫描目录 → 解析 → 编译 → 写入 .svp/

import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { ok } from "../core/result.js";
import { writeL3, writeL4 } from "../core/store.js";
import { compileCompositeNode, compileGraph } from "./compile-graph.js";
import { compileNode } from "./compile-node.js";
import { parseGraphFile } from "./parse-graph.js";
import { parseNodeFile } from "./parse-node.js";
import type { CompileError, CompileResult, NodeIr } from "./types.js";
import type { Result } from "../core/result.js";

/**
 * 编译整个 blueprint 项目
 *
 * 1. 扫描 nodes/ 目录，递归发现所有 node.yaml
 * 2. 扫描 graphs/ 目录，发现所有 graph.yaml
 * 3. 解析所有节点 → NodeIR[]
 * 4. 区分原子节点和复合节点
 * 5. 编译原子节点 → L3Block[]
 * 6. 编译复合节点 → 子 L4Flow[]
 * 7. 编译图 → L4Flow[]
 * 8. 写入 .svp/
 */
export async function compileBlueprint(
  projectRoot: string,
): Promise<Result<CompileResult, CompileError>> {
  // 1. 扫描 nodes/ 目录
  const nodesDir = path.join(projectRoot, "nodes");
  const nodeFiles = await scanNodeFiles(nodesDir);

  // 2. 扫描 graphs/ 目录
  const graphsDir = path.join(projectRoot, "graphs");
  const graphFiles = await scanGraphFiles(graphsDir);

  // 3. 解析所有节点
  const nodeIrs: NodeIr[] = [];
  for (const filePath of nodeFiles) {
    const result = await parseNodeFile(filePath);
    if (!result.ok) return result;
    nodeIrs.push(result.value);
  }

  // 4. 区分原子节点和复合节点
  const atomicNodes = nodeIrs.filter((n) => n.type !== "composite");
  const compositeNodes = nodeIrs.filter((n) => n.type === "composite");
  const compositeNames = new Set(compositeNodes.map((n) => n.name));

  // 5. 编译原子节点 → L3Block[]
  const l3Ids: string[] = [];
  for (const node of atomicNodes) {
    const result = compileNode(node);
    if (!result.ok) return result;
    await writeL3(projectRoot, result.value);
    l3Ids.push(result.value.id);
  }

  // 6. 编译复合节点 → 子 L4Flow[]（内部引用的原子节点也需要 L3）
  const l4Ids: string[] = [];
  for (const node of compositeNodes) {
    // 复合节点内部引用的子节点如果是原子节点，已在步骤 5 生成 L3
    const result = compileCompositeNode(node, compositeNames);
    if (!result.ok) return result;
    await writeL4(projectRoot, result.value);
    l4Ids.push(result.value.id);
  }

  // 7. 编译图 → L4Flow[]
  for (const filePath of graphFiles) {
    const parseResult = await parseGraphFile(filePath);
    if (!parseResult.ok) return parseResult;

    const compileResult = compileGraph(parseResult.value, compositeNames);
    if (!compileResult.ok) return compileResult;

    await writeL4(projectRoot, compileResult.value);
    l4Ids.push(compileResult.value.id);
  }

  return ok({ l3Blocks: l3Ids, l4Flows: l4Ids });
}

/** 递归扫描 nodes/ 目录，找到所有 node.yaml */
async function scanNodeFiles(nodesDir: string): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await readdir(nodesDir);
    // 排序保证确定性
    entries.sort();
    for (const entry of entries) {
      const fullPath = path.join(nodesDir, entry);
      const s = await stat(fullPath);
      if (s.isDirectory()) {
        const nodeFile = path.join(fullPath, "node.yaml");
        try {
          await stat(nodeFile);
          files.push(nodeFile);
        } catch {
          // node.yaml 不存在，跳过
        }
      }
    }
  } catch {
    // nodes/ 目录不存在
  }
  return files;
}

/** 扫描 graphs/ 目录，找到所有 .yaml 文件 */
async function scanGraphFiles(graphsDir: string): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await readdir(graphsDir);
    entries.sort();
    for (const entry of entries) {
      if (entry.endsWith(".yaml") || entry.endsWith(".yml")) {
        files.push(path.join(graphsDir, entry));
      }
    }
  } catch {
    // graphs/ 目录不存在
  }
  return files;
}
