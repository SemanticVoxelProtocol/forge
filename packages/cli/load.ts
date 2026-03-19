// 共享的 .svp/ 数据加载逻辑
// 两个命令（check, compile-plan）复用

import { stat } from "node:fs/promises";
import path from "node:path";
import {
  listL2,
  listL3,
  listL4,
  readL2,
  readL3,
  readL4,
  readL5,
  checkCompatibility,
  computeSignatureHash,
  createTypescriptExtractor,
} from "../core/index.js";
import type {
  CheckInput,
  L2CodeBlock,
  L3Block,
  L4Artifact,
  FileFingerprint,
} from "../core/index.js";

/** 从 .svp/ 加载所有层数据，含可选的 L1 签名计算 */
export async function loadCheckInput(
  root: string,
  options: { computeSignatures?: boolean } = {},
): Promise<CheckInput> {
  // Ensure .svp/ schema is compatible before reading
  await checkCompatibility(root);

  const l5 = (await readL5(root)) ?? undefined;

  const l4Ids = await listL4(root);
  const l4Flows: L4Artifact[] = [];
  for (const id of l4Ids) {
    const l4 = await readL4(root, id);
    if (l4 !== null) l4Flows.push(l4);
  }

  const l3Ids = await listL3(root);
  const l3Blocks: L3Block[] = [];
  for (const id of l3Ids) {
    const block = await readL3(root, id);
    if (block !== null) l3Blocks.push(block);
  }

  const l2Ids = await listL2(root);
  const l2Blocks: L2CodeBlock[] = [];
  for (const id of l2Ids) {
    const cb = await readL2(root, id);
    if (cb !== null) l2Blocks.push(cb);
  }

  // 计算 L1 签名哈希（可选，需要 L2 blocks 有 signatureHash 且文件存在）
  let l1SignatureHashes: Map<string, string> | undefined;
  if (options.computeSignatures === true && l2Blocks.length > 0) {
    l1SignatureHashes = await computeL1Signatures(root, l2Blocks);
  }

  return { l5, l4Flows, l3Blocks, l2Blocks, l1SignatureHashes };
}

/** 遍历 L2 blocks，提取 L1 文件的导出签名并计算聚合 hash */
async function computeL1Signatures(
  root: string,
  l2Blocks: readonly L2CodeBlock[],
): Promise<Map<string, string>> {
  const extractor = createTypescriptExtractor();
  const hashes = new Map<string, string>();

  for (const cb of l2Blocks) {
    // 只处理有 signatureHash 的 L2（说明之前做过签名追踪）
    if (cb.signatureHash === undefined) continue;

    // 只处理 TypeScript 文件
    if (cb.language !== "typescript") continue;

    const fingerprints: FileFingerprint[] = [];
    let allFilesExist = true;

    for (const filePath of cb.files) {
      const absPath = path.resolve(root, filePath);
      try {
        const s = await stat(absPath);
        if (!s.isFile()) {
          allFilesExist = false;
          break;
        }
        const fp = await extractor.extract(absPath);
        fingerprints.push(fp);
      } catch {
        allFilesExist = false;
        break;
      }
    }

    if (allFilesExist && fingerprints.length > 0) {
      hashes.set(cb.id, computeSignatureHash(fingerprints));
    }
  }

  return hashes;
}
