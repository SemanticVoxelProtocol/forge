// contentHash 计算
// 用于变更追踪：内容变了 → hash 变了 → 下游知道要重编译

import { createHash } from "node:crypto";
import type { L2CodeBlock } from "./l2.js";
import type { L3Block } from "./l3.js";
import type { L4Artifact } from "./l4.js";
import type { L5Blueprint } from "./l5.js";

/**
 * 对任意对象计算稳定的 SHA-256 哈希。
 * 排除 contentHash、sourceHash、revision 字段（避免循环依赖）。
 */
export function computeHash(obj: Record<string, unknown>): string {
  const cleaned = stripHashFields(obj);
  const json = sortedStringify(cleaned);
  return createHash("sha256").update(json).digest("hex").slice(0, 16);
}

/** 递归排序所有嵌套对象的 key，保证序列化稳定且不丢失嵌套属性 */
function sortedStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map((v) => sortedStringify(v)).join(",") + "]";
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).toSorted();
  const entries = keys.map((k) => JSON.stringify(k) + ":" + sortedStringify(record[k]));
  return "{" + entries.join(",") + "}";
}

function stripHashFields(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((item: unknown) => stripHashFields(item));

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (key === "contentHash" || key === "sourceHash" || key === "revision") continue;
    result[key] = stripHashFields(value);
  }
  return result;
}

/** L3Block 的 contentHash：基于 id, name, input, output, validate, constraints, description */
export function hashL3(block: Omit<L3Block, "contentHash" | "revision">): string {
  return computeHash(block as Record<string, unknown>);
}

/** L4 artifact 的 contentHash（Flow / EventGraph / StateMachine 通用） */
export function hashL4(artifact: Omit<L4Artifact, "contentHash" | "revision">): string {
  return computeHash(artifact as Record<string, unknown>);
}

/** L5Blueprint 的 contentHash：基于 id, name, version, intent, constraints, domains, integrations */
export function hashL5(blueprint: Omit<L5Blueprint, "contentHash" | "revision">): string {
  return computeHash(blueprint as Record<string, unknown>);
}

/** L2CodeBlock 的 contentHash：基于 id, blockRef, language, files, signatureHash */
export function hashL2(
  codeBlock: Omit<L2CodeBlock, "contentHash" | "sourceHash" | "revision">,
): string {
  return computeHash(codeBlock as Record<string, unknown>);
}
