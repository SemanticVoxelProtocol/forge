// 读写层 — .svp/ 目录下的 JSON 文件
// 运行时是 TS 对象，持久化用 JSON

import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Changeset } from "./changeset.js";
import type { FileManifest } from "./file.js";
import type { FunctionManifest } from "./function.js";
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

async function deleteJson(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // ignore missing files
  }
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

// ── File manifests ──

export async function readFileManifest(root: string, id: string): Promise<FileManifest | null> {
  try {
    return await readJson<FileManifest>(svpPath(root, "file", `${id}.json`));
  } catch {
    return null;
  }
}

export async function writeFileManifest(root: string, manifest: FileManifest): Promise<void> {
  await ensureDir(svpPath(root, "file"));
  await writeJson(svpPath(root, "file", `${manifest.id}.json`), manifest);
}

export async function deleteFileManifest(root: string, id: string): Promise<void> {
  await deleteJson(svpPath(root, "file", `${id}.json`));
}

export async function listFileManifests(root: string): Promise<string[]> {
  return listIds(svpPath(root, "file"));
}

// ── Function manifests ──

export async function readFunctionManifest(
  root: string,
  id: string,
): Promise<FunctionManifest | null> {
  try {
    return await readJson<FunctionManifest>(svpPath(root, "fn", `${id}.json`));
  } catch {
    return null;
  }
}

export async function writeFunctionManifest(
  root: string,
  manifest: FunctionManifest,
): Promise<void> {
  await ensureDir(svpPath(root, "fn"));
  await writeJson(svpPath(root, "fn", `${manifest.id}.json`), manifest);
}

export async function deleteFunctionManifest(root: string, id: string): Promise<void> {
  await deleteJson(svpPath(root, "fn", `${id}.json`));
}

export async function listFunctionManifests(root: string): Promise<string[]> {
  return listIds(svpPath(root, "fn"));
}

// ── Refs ──

/** A reference file attached to a block's refs/ folder */
export interface RefFile {
  readonly name: string; // "design.png"
  readonly path: string; // "nodes/date-picker/refs/design.png"
  readonly isText: boolean; // true for .md/.txt/.ts/.js etc.
  readonly content?: string; // text content (only for text files)
}

const TEXT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".css",
  ".html",
  ".sql",
]);

function isTextFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

/** Read reference files from nodes/<nodeId>/refs/, returns [] if missing */
export async function readNodeRefs(root: string, nodeId: string): Promise<RefFile[]> {
  return readRefsDir(root, path.join("nodes", nodeId, "refs"));
}

/** Read reference files from graphs/<graphId>/refs/, returns [] if missing */
export async function readGraphRefs(root: string, graphId: string): Promise<RefFile[]> {
  return readRefsDir(root, path.join("graphs", graphId, "refs"));
}

async function readRefsDir(root: string, relDir: string): Promise<RefFile[]> {
  const absDir = path.join(root, relDir);
  let entries: string[];
  try {
    entries = await readdir(absDir);
  } catch {
    return [];
  }

  const refs: RefFile[] = [];
  for (const name of entries.toSorted()) {
    const filePath = path.join(relDir, name);
    const text = isTextFile(name);
    const ref: RefFile = { name, path: filePath, isText: text };
    if (text) {
      try {
        const content = await readFile(path.join(root, filePath), "utf8");
        (ref as { content: string }).content = content;
      } catch {
        // skip unreadable files
      }
    }
    refs.push(ref);
  }
  return refs;
}

// ── OpenSpec integration ──

/** Read OpenSpec context if openspec/ exists. Returns null if not present. */
export async function readOpenSpecContext(root: string): Promise<string | null> {
  const openspecDir = path.join(root, "openspec");
  try {
    await readdir(openspecDir);
  } catch {
    return null;
  }

  const parts: string[] = [];

  // Read project.md (global context)
  try {
    const projectMd = await readFile(path.join(openspecDir, "project.md"), "utf8");
    parts.push("### Project Context\n\n" + projectMd);
  } catch {
    // no project.md
  }

  // Read all specs/*/spec.md (behavioral requirements)
  const specsDir = path.join(openspecDir, "specs");
  let capabilities: string[];
  try {
    capabilities = await readdir(specsDir);
  } catch {
    capabilities = [];
  }

  for (const cap of capabilities.toSorted()) {
    try {
      const specPath = path.join(specsDir, cap, "spec.md");
      const content = await readFile(specPath, "utf8");
      parts.push(`### ${cap}\n\n${content}`);
    } catch {
      // skip non-directories or missing spec.md
    }
  }

  return parts.length > 0 ? parts.join("\n\n---\n\n") : null;
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

/** 读取项目级文档 docs/l5.md（架构决策、全局约束说明），不存在返回 null */
export async function readL5Docs(root: string): Promise<string | null> {
  try {
    return await readFile(path.join(root, "docs", "l5.md"), "utf8");
  } catch {
    return null;
  }
}

/** 读取实现级文档 nodes/<blockRef>/impl.docs.md（部署注意事项、性能说明），不存在返回 null */
export async function readL2Docs(root: string, l2Id: string): Promise<string | null> {
  try {
    return await readFile(path.join(root, "nodes", l2Id, "impl.docs.md"), "utf8");
  } catch {
    return null;
  }
}

// ── Changesets ──

/** Write a changeset JSON file */
export async function writeChangeset(root: string, cs: Changeset): Promise<void> {
  await ensureDir(svpPath(root, "changesets"));
  await writeJson(svpPath(root, "changesets", `${cs.id}.json`), cs);
}

/** Read a changeset by id, returns null if missing */
export async function readChangeset(root: string, id: string): Promise<Changeset | null> {
  try {
    return await readJson<Changeset>(svpPath(root, "changesets", `${id}.json`));
  } catch {
    return null;
  }
}

/** List all changeset ids */
export async function listChangesets(root: string): Promise<string[]> {
  return listIds(svpPath(root, "changesets"));
}

/** Delete a changeset file */
export async function deleteChangeset(root: string, id: string): Promise<void> {
  try {
    await unlink(svpPath(root, "changesets", `${id}.json`));
  } catch {
    // file doesn't exist — no-op
  }
}

/** Find the currently active changeset, or null if none */
export async function findActiveChangeset(root: string): Promise<Changeset | null> {
  const ids = await listChangesets(root);
  for (const id of ids) {
    const cs = await readChangeset(root, id);
    if (cs !== null && cs.status === "active") return cs;
  }
  return null;
}
