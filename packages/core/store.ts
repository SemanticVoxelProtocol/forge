// 读写层 — .svp/ 目录下的 JSON 文件
// 运行时是 TS 对象，持久化用 JSON

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { L2CodeBlock } from "./l2.js";
import type { L3Block } from "./l3.js";
import type { L4Artifact } from "./l4.js";
import type { L5Blueprint } from "./l5.js";

const SVP_DIR = ".svp";

/** 拼接 .svp/ 下的子路径 */
function svpPath(root: string, ...parts: string[]): string {
  return path.join(root, SVP_DIR, ...parts);
}

/** 确保目录存在 */
async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/** 写 JSON 文件（格式化，方便 diff） */
async function writeJson(filePath: string, data: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

/** 读 JSON 文件 */
async function readJson<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as T;
}

/** 列出目录下所有 .json 文件名（不含扩展名） */
async function listIds(dir: string): Promise<string[]> {
  try {
    const files = await readdir(dir);
    return files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
  } catch {
    return []; // 目录不存在
  }
}

// ── L5 ──

export async function readL5(root: string): Promise<L5Blueprint | null> {
  try {
    return await readJson<L5Blueprint>(svpPath(root, "l5.json"));
  } catch {
    return null;
  }
}

export async function writeL5(root: string, blueprint: L5Blueprint): Promise<void> {
  await ensureDir(svpPath(root));
  await writeJson(svpPath(root, "l5.json"), blueprint);
}

// ── L4 ──

export async function readL4(root: string, id: string): Promise<L4Artifact | null> {
  try {
    return await readJson<L4Artifact>(svpPath(root, "l4", `${id}.json`));
  } catch {
    return null;
  }
}

export async function writeL4(root: string, artifact: L4Artifact): Promise<void> {
  await ensureDir(svpPath(root, "l4"));
  await writeJson(svpPath(root, "l4", `${artifact.id}.json`), artifact);
}

export async function listL4(root: string): Promise<string[]> {
  return listIds(svpPath(root, "l4"));
}

// ── L3 ──

export async function readL3(root: string, id: string): Promise<L3Block | null> {
  try {
    return await readJson<L3Block>(svpPath(root, "l3", `${id}.json`));
  } catch {
    return null;
  }
}

export async function writeL3(root: string, block: L3Block): Promise<void> {
  await ensureDir(svpPath(root, "l3"));
  await writeJson(svpPath(root, "l3", `${block.id}.json`), block);
}

export async function listL3(root: string): Promise<string[]> {
  return listIds(svpPath(root, "l3"));
}

// ── L2 ──

export async function readL2(root: string, id: string): Promise<L2CodeBlock | null> {
  try {
    return await readJson<L2CodeBlock>(svpPath(root, "l2", `${id}.json`));
  } catch {
    return null;
  }
}

export async function writeL2(root: string, codeBlock: L2CodeBlock): Promise<void> {
  await ensureDir(svpPath(root, "l2"));
  await writeJson(svpPath(root, "l2", `${codeBlock.id}.json`), codeBlock);
}

export async function listL2(root: string): Promise<string[]> {
  return listIds(svpPath(root, "l2"));
}

// ── Docs ──

/** 读取节点的模块化文档 nodes/<nodeId>/docs.md，不存在返回 null */
export async function readNodeDocs(root: string, nodeId: string): Promise<string | null> {
  try {
    return await readFile(path.join(root, "nodes", nodeId, "docs.md"), "utf8");
  } catch {
    return null;
  }
}

/** 读取图的模块化文档 graphs/<graphName>.docs.md，不存在返回 null */
export async function readGraphDocs(root: string, graphName: string): Promise<string | null> {
  try {
    return await readFile(path.join(root, "graphs", `${graphName}.docs.md`), "utf8");
  } catch {
    return null;
  }
}
