// svp check — 层间一致性校验
// 检查 hash 一致性、引用完整性、漂移检测、图结构合法性

import { computeHash } from "./hash.js";
import { getL4Kind } from "./l4.js";
import type { L2CodeBlock } from "./l2.js";
import type { L3Block } from "./l3.js";
import type { L4Artifact, L4EventGraph, L4Flow, L4StateMachine, Step } from "./l4.js";
import type { L5Blueprint } from "./l5.js";

// ── 问题类型 ──

export type IssueSeverity = "error" | "warning";

export interface CheckIssue {
  readonly severity: IssueSeverity;
  readonly layer: "l2" | "l3" | "l4" | "l5";
  readonly entityId: string;
  readonly code: string;
  readonly message: string;
}

export interface CheckReport {
  readonly issues: readonly CheckIssue[];
  readonly summary: {
    readonly errors: number;
    readonly warnings: number;
  };
}

// ── 校验输入：所有层的数据 ──

export interface CheckInput {
  readonly l5?: L5Blueprint;
  readonly l4Flows: readonly L4Artifact[];

  readonly l3Blocks: readonly L3Block[];
  readonly l2Blocks: readonly L2CodeBlock[];

  // L1 语义指纹：L2 block id → 当前 L1 文件的 signatureHash
  // 由调用方（CLI）提前计算，check 只做比对，不依赖提取器
  // 省略时跳过 CONTENT_DRIFT 检测
  readonly l1SignatureHashes?: ReadonlyMap<string, string>;
}

// ── 主入口 ──

export function check(input: CheckInput): CheckReport {
  const issues: CheckIssue[] = [
    ...checkHashConsistency(input),
    ...checkReferentialIntegrity(input),
    ...checkDrift(input),
    ...checkGraphStructure(input),
  ];

  return {
    issues,
    summary: {
      errors: issues.filter((i) => i.severity === "error").length,
      warnings: issues.filter((i) => i.severity === "warning").length,
    },
  };
}

// ── 1. Hash 一致性 ──

function checkHashConsistency(input: CheckInput): CheckIssue[] {
  const issues: CheckIssue[] = [];

  if (input.l5 !== undefined) {
    const { contentHash: _, revision: _r, ...rest } = input.l5;
    const expected = computeHash(rest as Record<string, unknown>);
    if (expected !== input.l5.contentHash) {
      issues.push({
        severity: "error",
        layer: "l5",
        entityId: input.l5.id,
        code: "HASH_MISMATCH",
        message: `L5 contentHash mismatch: stored=${input.l5.contentHash}, computed=${expected}`,
      });
    }
  }

  for (const l4 of input.l4Flows) {
    const { contentHash: _, revision: _r, ...rest } = l4;
    const expected = computeHash(rest as Record<string, unknown>);
    if (expected !== l4.contentHash) {
      issues.push({
        severity: "error",
        layer: "l4",
        entityId: l4.id,
        code: "HASH_MISMATCH",
        message: `L4 "${l4.name}" contentHash mismatch: stored=${l4.contentHash}, computed=${expected}`,
      });
    }
  }

  for (const block of input.l3Blocks) {
    const { contentHash: _, revision: _r, ...rest } = block;
    const expected = computeHash(rest as Record<string, unknown>);
    if (expected !== block.contentHash) {
      issues.push({
        severity: "error",
        layer: "l3",
        entityId: block.id,
        code: "HASH_MISMATCH",
        message: `L3 "${block.name}" contentHash mismatch: stored=${block.contentHash}, computed=${expected}`,
      });
    }
  }

  for (const cb of input.l2Blocks) {
    const { contentHash: _, sourceHash: _s, revision: _r, ...rest } = cb;
    const expected = computeHash(rest as Record<string, unknown>);
    if (expected !== cb.contentHash) {
      issues.push({
        severity: "error",
        layer: "l2",
        entityId: cb.id,
        code: "HASH_MISMATCH",
        message: `L2 "${cb.id}" contentHash mismatch: stored=${cb.contentHash}, computed=${expected}`,
      });
    }
  }

  return issues;
}

// ── 2. 引用完整性 ──

function checkReferentialIntegrity(input: CheckInput): CheckIssue[] {
  const issues: CheckIssue[] = [];

  const l3Ids = new Set(input.l3Blocks.map((b) => b.id));
  const l4Ids = new Set(input.l4Flows.map((f) => f.id));

  for (const l4 of input.l4Flows) {
    const kind = getL4Kind(l4);

    switch (kind) {
      case "flow": {
        issues.push(...checkFlowRefs(l4 as L4Flow, l3Ids, l4Ids, input.l3Blocks));
        break;
      }
      case "event-graph": {
        issues.push(...checkEventGraphRefs(l4 as L4EventGraph, l3Ids, input.l3Blocks));
        break;
      }
      case "state-machine": {
        issues.push(...checkStateMachineRefs(l4 as L4StateMachine, l3Ids));
        break;
      }
    }
  }

  // L2 blockRef → L3
  for (const cb of input.l2Blocks) {
    if (!l3Ids.has(cb.blockRef)) {
      issues.push({
        severity: "error",
        layer: "l2",
        entityId: cb.id,
        code: "MISSING_BLOCK_REF",
        message: `L2 "${cb.id}" references non-existent L3 block "${cb.blockRef}"`,
      });
    }
  }

  return issues;
}

/** Flow 引用完整性检查 */
function checkFlowRefs(
  flow: L4Flow,
  l3Ids: Set<string>,
  l4Ids: Set<string>,
  l3Blocks: readonly L3Block[],
): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const stepIds = new Set(flow.steps.map((s) => s.id));

  for (const step of flow.steps) {
    if (step.blockRef !== undefined && !l3Ids.has(step.blockRef)) {
      issues.push({
        severity: "error",
        layer: "l4",
        entityId: flow.id,
        code: "MISSING_BLOCK_REF",
        message: `L4 "${flow.name}" step "${step.id}" references non-existent L3 block "${step.blockRef}"`,
      });
    }

    if (step.flowRef !== undefined && !l4Ids.has(step.flowRef)) {
      issues.push({
        severity: "error",
        layer: "l4",
        entityId: flow.id,
        code: "MISSING_FLOW_REF",
        message: `L4 "${flow.name}" step "${step.id}" references non-existent L4 flow "${step.flowRef}"`,
      });
    }

    issues.push(...checkStepInternalRefs(step, stepIds, flow));
  }

  // dataFlow endpoint checks
  for (const df of flow.dataFlows) {
    checkDataFlowEndpoint(
      df.from,
      "from",
      flow.id,
      flow.name,
      flow.steps,
      stepIds,
      l3Ids,
      l3Blocks,
      issues,
    );
    checkDataFlowEndpoint(
      df.to,
      "to",
      flow.id,
      flow.name,
      flow.steps,
      stepIds,
      l3Ids,
      l3Blocks,
      issues,
    );
  }

  return issues;
}

/** EventGraph 引用完整性检查 */
function checkEventGraphRefs(
  eg: L4EventGraph,
  l3Ids: Set<string>,
  l3Blocks: readonly L3Block[],
): CheckIssue[] {
  const issues: CheckIssue[] = [];

  // 每个 handler 内部的 step blockRef 检查
  for (const handler of eg.handlers) {
    const stepIds = new Set(handler.steps.map((s) => s.id));

    for (const step of handler.steps) {
      if (step.blockRef !== undefined && !l3Ids.has(step.blockRef)) {
        issues.push({
          severity: "error",
          layer: "l4",
          entityId: eg.id,
          code: "MISSING_BLOCK_REF",
          message: `L4 "${eg.name}" handler "${handler.id}" step "${step.id}" references non-existent L3 block "${step.blockRef}"`,
        });
      }

      issues.push(...checkStepInternalRefs(step, stepIds, { id: eg.id, name: eg.name }));
    }

    // dataFlow endpoint checks（支持 $state / $event 前缀）
    for (const df of handler.dataFlows) {
      checkEventGraphDataFlowEndpoint(
        df.from,
        "from",
        eg,
        handler,
        stepIds,
        l3Ids,
        l3Blocks,
        issues,
      );
      checkEventGraphDataFlowEndpoint(df.to, "to", eg, handler, stepIds, l3Ids, l3Blocks, issues);
    }
  }

  return issues;
}

/** StateMachine 引用完整性检查 */
function checkStateMachineRefs(sm: L4StateMachine, l3Ids: Set<string>): CheckIssue[] {
  const issues: CheckIssue[] = [];

  // onEntry / onExit blockRef → L3
  for (const [stateName, config] of Object.entries(sm.states)) {
    if (config.onEntry?.blockRef !== undefined && !l3Ids.has(config.onEntry.blockRef)) {
      issues.push({
        severity: "error",
        layer: "l4",
        entityId: sm.id,
        code: "MISSING_BLOCK_REF",
        message: `L4 "${sm.name}" state "${stateName}" onEntry references non-existent L3 block "${config.onEntry.blockRef}"`,
      });
    }
    if (config.onExit?.blockRef !== undefined && !l3Ids.has(config.onExit.blockRef)) {
      issues.push({
        severity: "error",
        layer: "l4",
        entityId: sm.id,
        code: "MISSING_BLOCK_REF",
        message: `L4 "${sm.name}" state "${stateName}" onExit references non-existent L3 block "${config.onExit.blockRef}"`,
      });
    }
  }

  // transition guard → L3
  for (const t of sm.transitions) {
    if (t.guard !== undefined && !l3Ids.has(t.guard)) {
      issues.push({
        severity: "error",
        layer: "l4",
        entityId: sm.id,
        code: "MISSING_BLOCK_REF",
        message: `L4 "${sm.name}" transition "${t.from}" → "${t.to}" guard references non-existent L3 block "${t.guard}"`,
      });
    }
  }

  return issues;
}

/** Step 内部引用检查（next、branches、waitFor） — Flow 和 EventGraph 共用 */
function checkStepInternalRefs(
  step: Step,
  stepIds: Set<string>,
  parent: { id: string; name: string },
): CheckIssue[] {
  const issues: CheckIssue[] = [];

  if (step.next !== undefined && step.next !== null && !stepIds.has(step.next)) {
    issues.push({
      severity: "error",
      layer: "l4",
      entityId: parent.id,
      code: "MISSING_STEP_REF",
      message: `L4 "${parent.name}" step "${step.id}" next references non-existent step "${step.next}"`,
    });
  }

  if (step.branches !== undefined) {
    for (const branchId of step.branches) {
      if (!stepIds.has(branchId)) {
        issues.push({
          severity: "error",
          layer: "l4",
          entityId: parent.id,
          code: "MISSING_STEP_REF",
          message: `L4 "${parent.name}" step "${step.id}" branch references non-existent step "${branchId}"`,
        });
      }
    }
  }

  if (step.waitFor !== undefined) {
    for (const waitId of step.waitFor) {
      if (!stepIds.has(waitId)) {
        issues.push({
          severity: "error",
          layer: "l4",
          entityId: parent.id,
          code: "MISSING_STEP_REF",
          message: `L4 "${parent.name}" step "${step.id}" waitFor references non-existent step "${waitId}"`,
        });
      }
    }
  }

  return issues;
}

/** 检查 Flow dataFlow 端点 "stepId.pinName" 的有效性 */
function checkDataFlowEndpoint(
  endpoint: string,
  direction: "from" | "to",
  flowId: string,
  flowName: string,
  steps: readonly Step[],
  stepIds: Set<string>,
  l3Ids: Set<string>,
  l3Blocks: readonly L3Block[],
  issues: CheckIssue[],
): void {
  const dotIndex = endpoint.indexOf(".");
  if (dotIndex === -1) {
    issues.push({
      severity: "error",
      layer: "l4",
      entityId: flowId,
      code: "INVALID_DATAFLOW_FORMAT",
      message: `L4 "${flowName}" dataFlow ${direction} "${endpoint}" is not in "stepId.pinName" format`,
    });
    return;
  }

  const stepId = endpoint.slice(0, dotIndex);
  const pinName = endpoint.slice(dotIndex + 1);

  if (!stepIds.has(stepId)) {
    issues.push({
      severity: "error",
      layer: "l4",
      entityId: flowId,
      code: "MISSING_STEP_REF",
      message: `L4 "${flowName}" dataFlow ${direction} references non-existent step "${stepId}"`,
    });
    return;
  }

  const step = steps.find((s) => s.id === stepId);
  if (step?.blockRef !== undefined && l3Ids.has(step.blockRef)) {
    const block = l3Blocks.find((b) => b.id === step.blockRef);
    if (block !== undefined) {
      const pins = direction === "from" ? block.output : block.input;
      const pinExists = pins.some((p) => p.name === pinName);
      if (!pinExists) {
        issues.push({
          severity: "error",
          layer: "l4",
          entityId: flowId,
          code: "MISSING_PIN",
          message: `L4 "${flowName}" dataFlow ${direction} "${endpoint}": pin "${pinName}" not found on L3 block "${step.blockRef}"`,
        });
      }
    }
  }
}

/** 检查 EventGraph dataFlow 端点（支持 $state.xxx / $event.xxx 前缀） */
function checkEventGraphDataFlowEndpoint(
  endpoint: string,
  direction: "from" | "to",
  eg: L4EventGraph,
  handler: { id: string; steps: readonly Step[] },
  stepIds: Set<string>,
  l3Ids: Set<string>,
  l3Blocks: readonly L3Block[],
  issues: CheckIssue[],
): void {
  const dotIndex = endpoint.indexOf(".");
  if (dotIndex === -1) {
    issues.push({
      severity: "error",
      layer: "l4",
      entityId: eg.id,
      code: "INVALID_DATAFLOW_FORMAT",
      message: `L4 "${eg.name}" handler "${handler.id}" dataFlow ${direction} "${endpoint}" is not in valid format`,
    });
    return;
  }

  const prefix = endpoint.slice(0, dotIndex);
  const field = endpoint.slice(dotIndex + 1);

  // $state.xxx → 检查 state 声明中有这个 key
  if (prefix === "$state") {
    if (!(field in eg.state)) {
      issues.push({
        severity: "error",
        layer: "l4",
        entityId: eg.id,
        code: "MISSING_STATE_REF",
        message: `L4 "${eg.name}" handler "${handler.id}" dataFlow ${direction} references undeclared state key "${field}"`,
      });
    }
    return;
  }

  // $event.xxx → 事件负载引用，不做额外校验（schema 由外部定义）
  if (prefix === "$event") {
    return;
  }

  // 普通 stepId.pinName → 复用标准检查
  checkDataFlowEndpoint(
    endpoint,
    direction,
    eg.id,
    eg.name,
    handler.steps,
    stepIds,
    l3Ids,
    l3Blocks,
    issues,
  );
}

// ── 3. 漂移检测 ──

function checkDrift(input: CheckInput): CheckIssue[] {
  const issues: CheckIssue[] = [];

  // L2 sourceHash vs L3 contentHash
  const l3HashById = new Map(input.l3Blocks.map((b) => [b.id, b.contentHash]));

  for (const cb of input.l2Blocks) {
    // SOURCE_DRIFT: L3 改了，L2 还没重编译
    const l3Hash = l3HashById.get(cb.blockRef);
    if (l3Hash !== undefined && cb.sourceHash !== l3Hash) {
      issues.push({
        severity: "warning",
        layer: "l2",
        entityId: cb.id,
        code: "SOURCE_DRIFT",
        message: `L2 "${cb.id}" sourceHash (${cb.sourceHash}) does not match L3 "${cb.blockRef}" contentHash (${l3Hash}): L3 has changed since last compilation`,
      });
    }

    // CONTENT_DRIFT: L1 导出签名变了，L2 记录的 signatureHash 过期
    if (input.l1SignatureHashes !== undefined && cb.signatureHash !== undefined) {
      const currentHash = input.l1SignatureHashes.get(cb.id);
      if (currentHash !== undefined && currentHash !== cb.signatureHash) {
        issues.push({
          severity: "warning",
          layer: "l2",
          entityId: cb.id,
          code: "CONTENT_DRIFT",
          message: `L2 "${cb.id}" signatureHash mismatch: L1 exported signatures have changed since last sync`,
        });
      }
    }
  }

  return issues;
}

// ── 4. 图结构合法性 ──

function checkGraphStructure(input: CheckInput): CheckIssue[] {
  const issues: CheckIssue[] = [];

  for (const l4 of input.l4Flows) {
    const kind = getL4Kind(l4);

    switch (kind) {
      case "flow": {
        issues.push(...checkFlowGraphStructure(l4 as L4Flow));
        break;
      }
      case "event-graph": {
        issues.push(...checkEventGraphStructure(l4 as L4EventGraph));
        break;
      }
      case "state-machine": {
        issues.push(...checkStateMachineStructure(l4 as L4StateMachine));
        break;
      }
    }
  }

  return issues;
}

/** Flow 图结构检查 */
function checkFlowGraphStructure(flow: L4Flow): CheckIssue[] {
  const issues: CheckIssue[] = [];
  if (flow.steps.length === 0) return issues;

  const stepMap = new Map(flow.steps.map((s) => [s.id, s]));

  issues.push(
    ...detectNextCycles(flow.id, flow.name, flow.steps, stepMap),
    ...detectOrphanSteps(flow.id, flow.name, flow.steps, stepMap),
    ...flow.steps
      .filter((step) => step.flowRef === flow.id)
      .map(
        (step): CheckIssue => ({
          severity: "warning",
          layer: "l4",
          entityId: flow.id,
          code: "SELF_REFERENCING_FLOW",
          message: `L4 "${flow.name}" step "${step.id}" calls itself (recursive flow reference)`,
        }),
      ),
  );

  return issues;
}

/** EventGraph 图结构检查 — 每个 handler 内部独立检查 */
function checkEventGraphStructure(eg: L4EventGraph): CheckIssue[] {
  const issues: CheckIssue[] = [];

  // handler event 唯一性
  const seenEvents = new Set<string>();
  for (const handler of eg.handlers) {
    if (seenEvents.has(handler.event)) {
      issues.push({
        severity: "error",
        layer: "l4",
        entityId: eg.id,
        code: "DUPLICATE_EVENT",
        message: `L4 "${eg.name}" has duplicate event handler for "${handler.event}"`,
      });
    }
    seenEvents.add(handler.event);

    // 每个 handler 内部的 step chain 检查
    if (handler.steps.length > 0) {
      const stepMap = new Map(handler.steps.map((s) => [s.id, s]));
      issues.push(
        ...detectNextCycles(eg.id, `${eg.name}/${handler.id}`, handler.steps, stepMap),
        ...detectOrphanSteps(eg.id, `${eg.name}/${handler.id}`, handler.steps, stepMap),
      );
    }
  }

  // state 声明非空
  if (Object.keys(eg.state).length === 0) {
    issues.push({
      severity: "warning",
      layer: "l4",
      entityId: eg.id,
      code: "EMPTY_STATE",
      message: `L4 "${eg.name}" event-graph has no state declarations`,
    });
  }

  return issues;
}

/** StateMachine 图结构检查 */
function checkStateMachineStructure(sm: L4StateMachine): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const stateNames = new Set(Object.keys(sm.states));

  // initialState 必须在 states 中
  if (!stateNames.has(sm.initialState)) {
    issues.push({
      severity: "error",
      layer: "l4",
      entityId: sm.id,
      code: "INVALID_INITIAL_STATE",
      message: `L4 "${sm.name}" initialState "${sm.initialState}" not found in states`,
    });
  }

  // transition from/to 必须在 states 中
  for (const t of sm.transitions) {
    if (!stateNames.has(t.from)) {
      issues.push({
        severity: "error",
        layer: "l4",
        entityId: sm.id,
        code: "INVALID_TRANSITION",
        message: `L4 "${sm.name}" transition from "${t.from}" references non-existent state`,
      });
    }
    if (!stateNames.has(t.to)) {
      issues.push({
        severity: "error",
        layer: "l4",
        entityId: sm.id,
        code: "INVALID_TRANSITION",
        message: `L4 "${sm.name}" transition to "${t.to}" references non-existent state`,
      });
    }
  }

  // 状态可达性（从 initialState 出发）
  if (stateNames.has(sm.initialState)) {
    const reachable = new Set<string>();
    const queue = [sm.initialState];
    reachable.add(sm.initialState);

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const t of sm.transitions) {
        if (t.from === current && !reachable.has(t.to)) {
          reachable.add(t.to);
          queue.push(t.to);
        }
      }
    }

    for (const stateName of stateNames) {
      if (!reachable.has(stateName)) {
        issues.push({
          severity: "warning",
          layer: "l4",
          entityId: sm.id,
          code: "UNREACHABLE_STATE",
          message: `L4 "${sm.name}" state "${stateName}" is not reachable from initialState "${sm.initialState}"`,
        });
      }
    }
  }

  return issues;
}

/** 检测 next 链中的循环（Flow 和 EventGraph handler 共用） */
function detectNextCycles(
  entityId: string,
  entityName: string,
  steps: readonly Step[],
  stepMap: Map<string, Step>,
): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const visited = new Set<string>();

  for (const step of steps) {
    if (visited.has(step.id)) continue;

    const path = new Set<string>();
    let current: string | undefined | null = step.id;

    while (current !== undefined && current !== null) {
      if (path.has(current)) {
        issues.push({
          severity: "error",
          layer: "l4",
          entityId,
          code: "NEXT_CYCLE",
          message: `L4 "${entityName}" has a cycle in next chain involving step "${current}"`,
        });
        break;
      }
      if (visited.has(current)) break;

      path.add(current);
      visited.add(current);

      const s = stepMap.get(current);
      current = s?.next;
    }
  }

  return issues;
}

/** 检测不可达的孤立 step（Flow 和 EventGraph handler 共用） */
function detectOrphanSteps(
  entityId: string,
  entityName: string,
  steps: readonly Step[],
  stepMap: Map<string, Step>,
): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const reachable = new Set<string>();

  // BFS 从第一个 step 开始
  const queue: string[] = [steps[0].id];
  reachable.add(steps[0].id);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const step = stepMap.get(currentId);
    if (step === undefined) continue;

    if (step.next !== undefined && step.next !== null && !reachable.has(step.next)) {
      reachable.add(step.next);
      queue.push(step.next);
    }

    if (step.branches !== undefined) {
      for (const branchId of step.branches) {
        if (!reachable.has(branchId)) {
          reachable.add(branchId);
          queue.push(branchId);
        }
      }
    }

    if (step.waitFor !== undefined) {
      for (const waitId of step.waitFor) {
        if (!reachable.has(waitId)) {
          reachable.add(waitId);
          queue.push(waitId);
        }
      }
    }
  }

  for (const step of steps) {
    if (!reachable.has(step.id)) {
      issues.push({
        severity: "warning",
        layer: "l4",
        entityId,
        code: "ORPHAN_STEP",
        message: `L4 "${entityName}" step "${step.id}" is not reachable from the first step`,
      });
    }
  }

  return issues;
}
