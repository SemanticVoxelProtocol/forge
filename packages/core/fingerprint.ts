// 语义指纹 — 从 L1 源文件提取导出签名，用于接口级漂移检测
// core 只定义数据结构和 hash 计算，不依赖 TS 编译器
// 实际提取逻辑由上层（CLI/runtime）注入

import { createHash } from "node:crypto";

// ── 数据结构 ──

/** 单个导出符号的签名 */
export interface ExportedSymbol {
  readonly name: string;
  readonly kind: "function" | "class" | "interface" | "type" | "variable" | "enum";
  readonly signature: string; // 签名文本，如 "(req: Request) => Response"
}

/** 一个文件的语义指纹 */
export interface FileFingerprint {
  readonly filePath: string;
  readonly exports: readonly ExportedSymbol[];
}

/** 一组文件的聚合指纹 */
export interface SignatureFingerprint {
  readonly files: readonly FileFingerprint[];
  readonly hash: string; // 所有导出签名的聚合 hash
}

// ── 从已提取的符号计算 hash ──

/** 从 FileFingerprint 列表计算聚合 hash */
export function computeSignatureHash(files: readonly FileFingerprint[]): string {
  // 排序确保稳定性（文件顺序 + 导出顺序）
  const normalized = [...files]
    .toSorted((a, b) => a.filePath.localeCompare(b.filePath))
    .map((f) => ({
      filePath: f.filePath,
      exports: [...f.exports].toSorted((a, b) => a.name.localeCompare(b.name)),
    }));

  // 直接 JSON.stringify（不用 computeHash，因为它的 replacer 对数组不友好）
  const json = JSON.stringify(normalized);
  return createHash("sha256").update(json).digest("hex").slice(0, 16);
}

/** 构建完整指纹对象 */
export function buildFingerprint(files: readonly FileFingerprint[]): SignatureFingerprint {
  return {
    files,
    hash: computeSignatureHash(files),
  };
}

// ── 提取器接口（由上层实现） ──

/** 签名提取器 — 从源文件路径提取导出符号 */
export interface SignatureExtractor {
  readonly extract: (filePath: string) => Promise<FileFingerprint>;
}
