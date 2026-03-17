// L4: Logic Chain — 流程编排
// 三种变体：Flow（pipeline）、EventGraph（事件驱动）、StateMachine（状态机）
// 共享 SVP 核心机制（hash 追踪、check、compile-plan），用 kind 字段区分

import type { ArtifactVersion } from "./version.js";

// ── Flow（有序 pipeline）──

export interface L4Flow {
  readonly kind?: "flow"; // 可选，向后兼容（无 kind 默认为 "flow"）
  readonly id: string;
  readonly name: string;

  readonly trigger?: Trigger;

  // 步骤（每步引用一个 L3 block 或另一个 L4 flow）
  readonly steps: readonly Step[];

  // 步骤间的数据传递
  readonly dataFlows: readonly DataFlow[];

  // 版本追踪
  readonly revision: ArtifactVersion;

  // 变更追踪
  readonly contentHash: string;
}

export interface Step {
  readonly id: string;
  readonly action: "process" | "parallel" | "wait" | "call";
  readonly blockRef?: string; // L3 block ID（action 为 process 时）
  readonly flowRef?: string; // L4 flow ID（action 为 call 时，复合节点）
  readonly next?: string | null; // 下一步 step ID
  readonly branches?: readonly string[]; // action 为 parallel 时，并行的 step IDs
  readonly waitFor?: readonly string[]; // action 为 wait 时，等待的 step IDs
}

export interface DataFlow {
  readonly from: string; // "stepId.pinName" 或 "$state.key" / "$event.field"（EventGraph）
  readonly to: string; // "stepId.pinName" 或 "$state.key"（EventGraph）
}

export interface Trigger {
  readonly type: "http" | "event" | "schedule" | "manual";
  readonly config: Readonly<Record<string, unknown>>;
}

// ── EventGraph（事件驱动）──

export interface L4EventGraph {
  readonly kind: "event-graph";
  readonly id: string;
  readonly name: string;

  // 共享状态声明（如 CRDT 文档状态）
  readonly state: Readonly<Record<string, StateField>>;

  // 多个事件入口，各自独立处理
  readonly handlers: readonly EventHandler[];

  readonly revision: ArtifactVersion;
  readonly contentHash: string;
}

export interface StateField {
  readonly type: string;
  readonly description: string;
}

export interface EventHandler {
  readonly id: string;
  readonly event: string; // 事件名（如 "user.local_edit"）
  readonly steps: readonly Step[]; // 复用现有 Step 类型
  readonly dataFlows: readonly DataFlow[]; // 支持 $state.xxx / $event.xxx 引用
}

// ── StateMachine（状态机）──

export interface L4StateMachine {
  readonly kind: "state-machine";
  readonly id: string;
  readonly name: string;

  readonly entity: string; // 管理的实体类型（如 "PurchaseOrder"）
  readonly initialState: string;

  readonly states: Readonly<Record<string, StateConfig>>;
  readonly transitions: readonly Transition[];

  readonly revision: ArtifactVersion;
  readonly contentHash: string;
}

export interface StateConfig {
  readonly onEntry?: { readonly blockRef: string }; // 进入时触发的 L3 block
  readonly onExit?: { readonly blockRef: string }; // 离开时触发的 L3 block
}

export interface Transition {
  readonly from: string;
  readonly to: string;
  readonly event: string;
  readonly guard?: string; // L3 block id，返回 boolean
}

// ── 联合类型 ──

export type L4Artifact = L4Flow | L4EventGraph | L4StateMachine;

/** 获取 L4 artifact 的有效 kind（向后兼容：无 kind 字段默认为 "flow"） */
export function getL4Kind(l4: L4Artifact): "flow" | "event-graph" | "state-machine" {
  if ("kind" in l4 && l4.kind !== undefined) return l4.kind;
  return "flow";
}

/** 从任意 L4 变体中提取所有引用的 L3 block IDs */
export function extractBlockRefs(l4: L4Artifact): string[] {
  const refs = new Set<string>();
  const kind = getL4Kind(l4);

  switch (kind) {
    case "flow": {
      const flow = l4 as L4Flow;
      for (const step of flow.steps) {
        if (step.blockRef !== undefined) refs.add(step.blockRef);
      }
      break;
    }
    case "event-graph": {
      const eg = l4 as L4EventGraph;
      for (const handler of eg.handlers) {
        for (const step of handler.steps) {
          if (step.blockRef !== undefined) refs.add(step.blockRef);
        }
      }
      break;
    }
    case "state-machine": {
      const sm = l4 as L4StateMachine;
      for (const config of Object.values(sm.states)) {
        if (config.onEntry?.blockRef !== undefined) refs.add(config.onEntry.blockRef);
        if (config.onExit?.blockRef !== undefined) refs.add(config.onExit.blockRef);
      }
      for (const t of sm.transitions) {
        if (t.guard !== undefined) refs.add(t.guard);
      }
      break;
    }
  }

  return [...refs];
}

// ── Block Context（定位 block 在任意 L4 变体中的位置）──

export interface BlockContext {
  readonly kind: "flow" | "event-graph" | "state-machine";
  readonly blockId: string;
  readonly prevBlockRef?: string; // predecessor blockRef (if sequential)
  readonly nextBlockRef?: string; // successor blockRef (if sequential)
  readonly location: string; // e.g. "step 1 in flow", "handler on-execute step 0", "state closed onEntry"
}

/** 在任意 L4 变体中定位 blockId，返回位置上下文（含前后邻居） */
export function findBlockContext(l4: L4Artifact, blockId: string): BlockContext | undefined {
  const kind = getL4Kind(l4);

  switch (kind) {
    case "flow": {
      const flow = l4 as L4Flow;
      for (let i = 0; i < flow.steps.length; i++) {
        const step = flow.steps[i];
        if (step.blockRef === blockId) {
          const prevStep = i > 0 ? flow.steps[i - 1] : undefined;
          const nextStep = i < flow.steps.length - 1 ? flow.steps[i + 1] : undefined;
          return {
            kind: "flow",
            blockId,
            prevBlockRef: prevStep?.blockRef,
            nextBlockRef: nextStep?.blockRef,
            location: `step ${String(i)} in flow "${flow.id}"`,
          };
        }
      }
      break;
    }
    case "event-graph": {
      const eg = l4 as L4EventGraph;
      for (const handler of eg.handlers) {
        for (let i = 0; i < handler.steps.length; i++) {
          const step = handler.steps[i];
          if (step.blockRef === blockId) {
            const prevStep = i > 0 ? handler.steps[i - 1] : undefined;
            const nextStep = i < handler.steps.length - 1 ? handler.steps[i + 1] : undefined;
            return {
              kind: "event-graph",
              blockId,
              prevBlockRef: prevStep?.blockRef,
              nextBlockRef: nextStep?.blockRef,
              location: `handler "${handler.id}" step ${String(i)} (event: ${handler.event})`,
            };
          }
        }
      }
      break;
    }
    case "state-machine": {
      const sm = l4 as L4StateMachine;
      // Search states onEntry/onExit
      for (const [stateName, config] of Object.entries(sm.states)) {
        if (config.onEntry?.blockRef === blockId) {
          return {
            kind: "state-machine",
            blockId,
            location: `state "${stateName}" onEntry`,
          };
        }
        if (config.onExit?.blockRef === blockId) {
          return {
            kind: "state-machine",
            blockId,
            location: `state "${stateName}" onExit`,
          };
        }
      }
      // Search transition guards
      for (const t of sm.transitions) {
        if (t.guard === blockId) {
          return {
            kind: "state-machine",
            blockId,
            location: `transition "${t.from}" → "${t.to}" guard (event: ${t.event})`,
          };
        }
      }
      break;
    }
  }

  return undefined;
}

// 计算属性，不存储：
// - dataType: 从引用的 pin 类型算出来
// - 聚合了哪些 L3 blocks: 从 extractBlockRefs 收集
// - step name: 从引用的 L3 block name 算出来
// - 所属 L5 domain: 从 source.ref 查
