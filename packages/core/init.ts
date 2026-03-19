// svp init — 初始化 .svp/ 目录结构
// 创建目录 + 写入初始 L5 blueprint

import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { computeHash } from "./hash.js";
import { detectSystemLanguage } from "./i18n.js";
import { createManifest, writeManifest } from "./manifest.js";
import { writeL5 } from "./store.js";
import type { L5Blueprint } from "./l5.js";

const SVP_DIR = ".svp";
const SUB_DIRS = ["l2", "l3", "l4"] as const;

export interface InitOptions {
  readonly name: string;
  readonly version?: string;
  readonly intent?: string;
  readonly host?: string;
  readonly language?: string;
}

export interface InitResult {
  readonly created: boolean; // false = already existed
  readonly root: string;
  readonly l5?: L5Blueprint;
}

/** 检查 .svp/ 是否已存在 */
async function svpExists(root: string): Promise<boolean> {
  try {
    const s = await stat(path.join(root, SVP_DIR));
    return s.isDirectory();
  } catch {
    return false;
  }
}

/** 初始化 .svp/ 目录 + L5 blueprint */
export async function init(root: string, options: InitOptions): Promise<InitResult> {
  const exists = await svpExists(root);
  if (exists) {
    return { created: false, root };
  }

  // 创建目录结构
  const svpRoot = path.join(root, SVP_DIR);
  await mkdir(svpRoot, { recursive: true });
  for (const sub of SUB_DIRS) {
    await mkdir(path.join(svpRoot, sub), { recursive: true });
  }

  // 创建文档目录（惰性创建策略，仅创建空目录）
  await mkdir(path.join(root, "nodes"), { recursive: true });
  await mkdir(path.join(root, "graphs"), { recursive: true });

  // 创建初始 L5
  const l5Base: Omit<L5Blueprint, "contentHash" | "revision"> = {
    id: slugify(options.name),
    name: options.name,
    version: options.version ?? "0.1.0",
    intent: options.intent ?? "",
    constraints: [],
    domains: [],
    integrations: [],
    language: options.language ?? detectSystemLanguage(),
  };
  const contentHash = computeHash(l5Base as Record<string, unknown>);
  const l5: L5Blueprint = {
    ...l5Base,
    contentHash,
    revision: {
      rev: 1,
      parentRev: null,
      source: { type: "init" },
      timestamp: new Date().toISOString(),
    },
  };

  await writeL5(root, l5);

  // Write manifest.json
  const manifest = createManifest();
  await writeManifest(root, manifest);

  return { created: true, root, l5 };
}

/** 把项目名转为 kebab-case id */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replaceAll(/[^\da-z]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}
