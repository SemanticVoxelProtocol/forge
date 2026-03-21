// L2: Code Block — L3 和 L1 之间的桥接层
// 与 L3 1:1 配对，聚合多个 L1 文件
// 核心职责：记录映射关系 + 对账

import type { ArtifactVersion } from "./version.js";

export interface L2CodeBlock {
  readonly id: string;
  readonly blockRef: string; // 配对的 L3 block ID

  readonly language: string; // "typescript" | "python" | "go" | "rust" | ...
  readonly files: readonly string[]; // 聚合的 L1 文件路径

  readonly sourceHash: string; // 生成时 L3 的 contentHash（L3 改了就不匹配 → 需要重编译）
  readonly contentHash: string; // 本层内容哈希（L2 自身元数据 hash）

  // 版本追踪
  readonly revision: ArtifactVersion;
}

// L1 就是文件系统上的源代码文件，不需要额外的数据模型。
// L2 通过 files 字段引用它们。
