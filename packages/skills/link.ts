// link — 创建 L2CodeBlock（L3 和 L1 之间的桥接层）
// AI 生成 L1 源代码后，运行 svp link 创建 L2 映射
// 纯函数，不做 IO

import { hashL2 } from "../core/hash.js";
import type { L2CodeBlock } from "../core/l2.js";
import type { L3Block } from "../core/l3.js";

export interface LinkOptions {
  readonly l3Block: L3Block;
  readonly files: readonly string[];
  readonly language?: string; // 默认 "typescript"
}

/** 从 L3 block + L1 文件路径创建 L2CodeBlock */
export function createL2Link(options: LinkOptions): L2CodeBlock {
  const base = {
    id: options.l3Block.id, // L2 id = L3 id（1:1 配对）
    blockRef: options.l3Block.id,
    language: options.language ?? "typescript",
    files: options.files,
  };

  const contentHash = hashL2(base);

  return {
    ...base,
    sourceHash: options.l3Block.contentHash, // 生成时 L3 的 hash
    contentHash,
    revision: {
      rev: 1,
      parentRev: null,
      source: { type: "ai", action: "compile" },
      timestamp: new Date().toISOString(),
    },
  };
}

/** 更新已有 L2 的文件列表（重新 link） */
export function relinkL2(
  existing: L2CodeBlock,
  l3Block: L3Block,
  files: readonly string[],
): L2CodeBlock {
  const base = {
    id: existing.id,
    blockRef: existing.blockRef,
    language: existing.language,
    files,
  };

  const contentHash = hashL2(base);

  return {
    ...base,
    sourceHash: l3Block.contentHash,
    contentHash,
    signatureHash: existing.signatureHash,
    revision: {
      rev: existing.revision.rev + 1,
      parentRev: existing.revision.rev,
      source: { type: "ai", action: "recompile" },
      timestamp: new Date().toISOString(),
    },
  };
}
