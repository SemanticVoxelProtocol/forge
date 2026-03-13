// 计算属性 — 不存储，用到时算
// 原则：存得少算得多，永远不会有不一致的风险

import type { Pin } from "./l3.js";
import type { DataFlow, Step } from "./l4.js";

/**
 * 从 input/output pins 生成函数签名。
 *
 * 示例：
 *   input: [{ name: "request", type: "OrderRequest" }]
 *   output: [{ name: "result", type: "ValidationResult" }]
 *   → "validateOrder(request: OrderRequest): ValidationResult"
 */
export function computeSignature(id: string, input: Pin[], output: Pin[]): string {
  const fnName = toCamelCase(id);
  const params = input
    .map((p) => `${p.name}${p.optional === true ? "?" : ""}: ${p.type}`)
    .join(", ");
  const returnType =
    output.length === 1
      ? output[0].type
      : output.length === 0
        ? "void"
        : `{ ${output.map((p) => `${p.name}: ${p.type}`).join("; ")} }`;
  return `${fnName}(${params}): ${returnType}`;
}

/**
 * 从 steps 收集所有引用的 L3 block IDs。
 */
export function collectBlockRefs(steps: Step[]): string[] {
  const refs: string[] = [];
  for (const step of steps) {
    if (step.blockRef !== undefined && !refs.includes(step.blockRef)) {
      refs.push(step.blockRef);
    }
  }
  return refs;
}

/**
 * 从 steps 收集所有引用的 L4 flow IDs（复合节点的 call）。
 */
export function collectFlowRefs(steps: Step[]): string[] {
  const refs: string[] = [];
  for (const step of steps) {
    if (step.flowRef !== undefined && !refs.includes(step.flowRef)) {
      refs.push(step.flowRef);
    }
  }
  return refs;
}

/**
 * 从 DataFlow 的 pin 引用推导数据类型。
 * 需要一个 pin 查找函数来解析 "stepId.pinName" → Pin。
 */
export function resolveDataFlowType(
  dataFlow: DataFlow,
  findPin: (ref: string) => Pin | undefined,
): string | undefined {
  const pin = findPin(dataFlow.from);
  return pin?.type;
}

// kebab-case → camelCase
function toCamelCase(id: string): string {
  return id.replaceAll(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}
