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

  // 语义指纹：L1 导出符号签名的 hash（接口级漂移检测）
  // 只有导出签名变化才触发 drift，内部实现/注释/格式化不会
  // 可选字段：旧数据或首次创建时可能没有
  readonly signatureHash?: string;

  // 版本追踪
  readonly revision: ArtifactVersion;
}

// L1 就是文件系统上的源代码文件，不需要额外的数据模型。
// L2 通过 files 字段引用它们，通过 signatureHash 做接口级漂移检测。
// 格式化、注释、内部实现变更不会触发 drift，只有导出签名变化才会。
