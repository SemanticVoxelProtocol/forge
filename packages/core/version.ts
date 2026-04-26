// 模块级版本管理 — 全层统一的版本追踪
// 记录每个制品的版本号、来源、因果关系
// 依赖 git 做历史回溯，只存当前版本 + rev 号

/** 制品版本记录 */
export interface ArtifactVersion {
  readonly rev: number; // 单调递增，1, 2, 3...
  readonly parentRev: number | null; // 基于哪个版本修改的
  readonly source: VersionSource; // 谁产生的这个版本
  readonly timestamp: string; // ISO 8601
}

/** 版本来源 */
export type VersionSource =
  | { readonly type: "human" }
  | {
      readonly type: "ai";
      readonly action: string; // "compile" | "recompile" | "update-ref" | "review"
      readonly fromRev?: Readonly<Record<string, number>>; // 如 { "l3:validate": 3 }
    }
  | { readonly type: "init" }
  | { readonly type: "migration"; readonly fromSchema: string; readonly toSchema: string };

// ── Package version (single source of truth: package.json) ──

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function findPackageJson(): { version: string } {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    try {
      const content = readFileSync(path.resolve(dir, "package.json"), "utf8");
      const pkg = JSON.parse(content) as { name?: string; version: string };
      if (pkg.name === "@svporg/forge") return pkg;
    } catch {
      // not found at this level, keep going
    }
    dir = path.dirname(dir);
  }
  return { version: "0.0.0" };
}

/** Package version, read from the root package.json at runtime */
export const VERSION: string = findPackageJson().version;
