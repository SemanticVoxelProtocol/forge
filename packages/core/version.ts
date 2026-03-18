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
  | { readonly type: "init" };

// ── Package version (single source of truth: package.json) ──

import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);
const _pkg = _require("../../package.json") as { version: string };

/** Package version, read from the root package.json at runtime */
export const VERSION: string = _pkg.version;
