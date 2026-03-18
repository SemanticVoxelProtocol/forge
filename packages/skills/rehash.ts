// rehash — 重算 contentHash + 更新 revision
// AI 写完 JSON 后运行 forge rehash，自动修正 hash
// 纯函数，不做 IO

import { hashL2, hashL3, hashL4, hashL5 } from "../core/hash.js";
import type { L2CodeBlock } from "../core/l2.js";
import type { L3Block } from "../core/l3.js";
import type { L4Artifact } from "../core/l4.js";
import type { L5Blueprint } from "../core/l5.js";
import type { ArtifactVersion } from "../core/version.js";

export interface RehashResult {
  readonly id: string;
  readonly layer: "l2" | "l3" | "l4" | "l5";
  readonly oldHash: string;
  readonly newHash: string;
  readonly changed: boolean;
}

/** 重算 L5 的 contentHash，hash 变了则 rev+1 */
export function rehashL5(l5: L5Blueprint): { data: L5Blueprint; result: RehashResult } {
  const { contentHash: _ch, revision: _rev, ...rest } = l5;
  const newHash = hashL5(rest);
  const changed = newHash !== l5.contentHash;

  const data: L5Blueprint = {
    ...l5,
    contentHash: newHash,
    ...(changed ? { revision: bumpRevision(l5.revision) } : {}),
  };

  return {
    data,
    result: { id: l5.id, layer: "l5", oldHash: l5.contentHash, newHash, changed },
  };
}

/** 重算 L4 的 contentHash，hash 变了则 rev+1 */
export function rehashL4(artifact: L4Artifact): { data: L4Artifact; result: RehashResult } {
  const { contentHash: _ch, revision: _rev, ...rest } = artifact;
  const newHash = hashL4(rest);
  const changed = newHash !== artifact.contentHash;

  const data: L4Artifact = {
    ...artifact,
    contentHash: newHash,
    ...(changed ? { revision: bumpRevision(artifact.revision) } : {}),
  };

  return {
    data,
    result: { id: artifact.id, layer: "l4", oldHash: artifact.contentHash, newHash, changed },
  };
}

/** 重算 L3 的 contentHash，hash 变了则 rev+1 */
export function rehashL3(block: L3Block): { data: L3Block; result: RehashResult } {
  const { contentHash: _ch, revision: _rev, ...rest } = block;
  const newHash = hashL3(rest);
  const changed = newHash !== block.contentHash;

  const data: L3Block = {
    ...block,
    contentHash: newHash,
    ...(changed ? { revision: bumpRevision(block.revision) } : {}),
  };

  return {
    data,
    result: { id: block.id, layer: "l3", oldHash: block.contentHash, newHash, changed },
  };
}

/** 重算 L2 的 contentHash（不改 sourceHash），hash 变了则 rev+1 */
export function rehashL2(cb: L2CodeBlock): { data: L2CodeBlock; result: RehashResult } {
  const { contentHash: _ch, sourceHash: _sh, revision: _rev, ...rest } = cb;
  const newHash = hashL2(rest);
  const changed = newHash !== cb.contentHash;

  const data: L2CodeBlock = {
    ...cb,
    contentHash: newHash,
    ...(changed ? { revision: bumpRevision(cb.revision) } : {}),
  };

  return {
    data,
    result: { id: cb.id, layer: "l2", oldHash: cb.contentHash, newHash, changed },
  };
}

function bumpRevision(current: ArtifactVersion): ArtifactVersion {
  return {
    rev: current.rev + 1,
    parentRev: current.rev,
    source: { type: "human" },
    timestamp: new Date().toISOString(),
  };
}
