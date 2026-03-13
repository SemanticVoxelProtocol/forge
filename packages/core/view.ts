// svp view — 虚拟文件树渲染
// 把五层数据模型渲染为 AI 友好的文本视图
// 纯函数，不做 IO，方便测试和复用

import { computeSignature } from "./computed.js";
import { extractBlockRefs, getL4Kind } from "./l4.js";
import type { L2CodeBlock } from "./l2.js";
import type { L3Block } from "./l3.js";
import type { L4Artifact, L4EventGraph, L4Flow, L4StateMachine, Step } from "./l4.js";
import type { L5Blueprint } from "./l5.js";

// ── L5 ──

export function viewL5Overview(l5: L5Blueprint): string {
  const lines: string[] = [
    `${l5.name} v${l5.version}`,
    "═".repeat(Math.max(l5.name.length + l5.version.length + 2, 20)),
    "",
    `intent: ${l5.intent}`,
  ];

  if (l5.constraints.length > 0) {
    lines.push("", "constraints:");
    for (const c of l5.constraints) {
      lines.push(`  • ${c}`);
    }
  }

  if (l5.domains.length > 0) {
    lines.push("", `domains (${String(l5.domains.length)}):`);
    for (const d of l5.domains) {
      const deps = d.dependencies.length > 0 ? ` → ${d.dependencies.join(", ")}` : "";
      lines.push(`  ${d.name}${deps}`);
    }
  }

  if (l5.integrations.length > 0) {
    lines.push("", `integrations (${String(l5.integrations.length)}):`);
    for (const i of l5.integrations) {
      lines.push(`  ${i.name} [${i.type}]`);
    }
  }

  return lines.join("\n");
}

// ── L4 ──

export function viewL4Overview(flows: readonly L4Artifact[]): string {
  const lines: string[] = [`L4 Logic Chains (${String(flows.length)} artifacts)`, "─".repeat(30)];

  for (const l4 of flows) {
    const kind = getL4Kind(l4);

    switch (kind) {
      case "flow": {
        lines.push(...viewFlowOverviewLines(l4 as L4Flow));
        break;
      }
      case "event-graph": {
        lines.push(...viewEventGraphOverviewLines(l4 as L4EventGraph));
        break;
      }
      case "state-machine": {
        lines.push(...viewStateMachineOverviewLines(l4 as L4StateMachine));
        break;
      }
    }

    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function viewL4Detail(
  l4: L4Artifact,
  l3Blocks: readonly L3Block[],
  l5?: L5Blueprint,
): string {
  const kind = getL4Kind(l4);

  switch (kind) {
    case "flow": {
      return viewFlowDetail(l4 as L4Flow, l3Blocks, l5);
    }
    case "event-graph": {
      return viewEventGraphDetail(l4 as L4EventGraph, l3Blocks, l5);
    }
    case "state-machine": {
      return viewStateMachineDetail(l4 as L4StateMachine, l3Blocks, l5);
    }
  }
}

// ── Flow overview/detail ──

function viewFlowOverviewLines(flow: L4Flow): string[] {
  const lines: string[] = [];
  const trigger = formatTrigger(flow);
  lines.push(`${flow.id} [flow]${trigger}`);

  const chain = flow.steps
    .filter((s) => s.action === "process" || s.action === "call")
    .map((s) => s.blockRef ?? s.flowRef ?? s.id)
    .join(" → ");

  if (chain.length > 0) {
    lines.push(`  ${chain}`);
  }

  return lines;
}

function viewFlowDetail(flow: L4Flow, l3Blocks: readonly L3Block[], l5?: L5Blueprint): string {
  const lines: string[] = [flow.id, "═".repeat(Math.max(flow.id.length, 12)), `kind: flow`];

  const trigger = formatTrigger(flow);
  if (trigger.length > 0) {
    lines.push(`trigger:${trigger}`);
  }

  lines.push("", `steps (${String(flow.steps.length)}):`);

  for (const step of flow.steps) {
    lines.push(formatStep(step));
  }

  if (flow.dataFlows.length > 0) {
    lines.push("", "dataFlows:");
    for (const df of flow.dataFlows) {
      lines.push(`  ${df.from} → ${df.to}`);
    }
  }

  if (l5 !== undefined) {
    lines.push("", `↑ L5: ${l5.name}`);
  }

  const blockRefs = flow.steps.filter((s) => s.blockRef !== undefined).map((s) => s.blockRef!);
  const uniqueRefs = [...new Set(blockRefs)];

  if (uniqueRefs.length > 0) {
    lines.push("", `↓ L3 blocks (${String(uniqueRefs.length)}):`);
    for (const ref of uniqueRefs) {
      const block = l3Blocks.find((b) => b.id === ref);
      if (block === undefined) {
        lines.push(`  ${ref}: [not found]`);
      } else {
        const sig = computeSignature(block.id, [...block.input], [...block.output]);
        lines.push(`  ${ref}: ${sig}`);
      }
    }
  }

  return lines.join("\n");
}

// ── EventGraph overview/detail ──

function viewEventGraphOverviewLines(eg: L4EventGraph): string[] {
  const lines: string[] = [];
  const stateCount = Object.keys(eg.state).length;
  const handlerCount = eg.handlers.length;
  lines.push(
    `${eg.id} [event-graph]  state: ${String(stateCount)} keys, handlers: ${String(handlerCount)}`,
  );

  const events = eg.handlers.map((h) => h.event).join(", ");
  if (events.length > 0) {
    lines.push(`  events: ${events}`);
  }

  return lines;
}

function viewEventGraphDetail(
  eg: L4EventGraph,
  l3Blocks: readonly L3Block[],
  l5?: L5Blueprint,
): string {
  const lines: string[] = [eg.id, "═".repeat(Math.max(eg.id.length, 12)), `kind: event-graph`];

  // state declarations
  const stateEntries = Object.entries(eg.state);
  if (stateEntries.length > 0) {
    lines.push("", `state (${String(stateEntries.length)} keys):`);
    for (const [key, field] of stateEntries) {
      lines.push(`  ${key}: ${field.type} — ${field.description}`);
    }
  }

  // handlers
  lines.push("", `handlers (${String(eg.handlers.length)}):`);
  for (const handler of eg.handlers) {
    lines.push(`  [${handler.id}] on "${handler.event}"  (${String(handler.steps.length)} steps)`);
    for (const step of handler.steps) {
      lines.push(`    ${formatStep(step).trim()}`);
    }
    if (handler.dataFlows.length > 0) {
      for (const df of handler.dataFlows) {
        lines.push(`    ${df.from} → ${df.to}`);
      }
    }
  }

  if (l5 !== undefined) {
    lines.push("", `↑ L5: ${l5.name}`);
  }

  // referenced L3 blocks
  const allBlockRefs = new Set<string>();
  for (const handler of eg.handlers) {
    for (const step of handler.steps) {
      if (step.blockRef !== undefined) allBlockRefs.add(step.blockRef);
    }
  }

  if (allBlockRefs.size > 0) {
    lines.push("", `↓ L3 blocks (${String(allBlockRefs.size)}):`);
    for (const ref of allBlockRefs) {
      const block = l3Blocks.find((b) => b.id === ref);
      if (block === undefined) {
        lines.push(`  ${ref}: [not found]`);
      } else {
        const sig = computeSignature(block.id, [...block.input], [...block.output]);
        lines.push(`  ${ref}: ${sig}`);
      }
    }
  }

  return lines.join("\n");
}

// ── StateMachine overview/detail ──

function viewStateMachineOverviewLines(sm: L4StateMachine): string[] {
  const stateCount = Object.keys(sm.states).length;
  const transCount = sm.transitions.length;
  return [
    `${sm.id} [state-machine]  states: ${String(stateCount)}, transitions: ${String(transCount)}, initial: ${sm.initialState}`,
  ];
}

function viewStateMachineDetail(
  sm: L4StateMachine,
  l3Blocks: readonly L3Block[],
  l5?: L5Blueprint,
): string {
  const lines: string[] = [
    sm.id,
    "═".repeat(Math.max(sm.id.length, 12)),
    `kind: state-machine`,
    `entity: ${sm.entity}`,
    `initialState: ${sm.initialState}`,
  ];

  // states
  const stateEntries = Object.entries(sm.states);
  lines.push("", `states (${String(stateEntries.length)}):`);
  for (const [name, config] of stateEntries) {
    const parts: string[] = [name];
    if (config.onEntry !== undefined) parts.push(`onEntry → ${config.onEntry.blockRef}`);
    if (config.onExit !== undefined) parts.push(`onExit → ${config.onExit.blockRef}`);
    lines.push(`  ${parts.join("  ")}`);
  }

  // transitions
  lines.push("", `transitions (${String(sm.transitions.length)}):`);
  for (const t of sm.transitions) {
    const guard = t.guard === undefined ? "" : ` [guard: ${t.guard}]`;
    lines.push(`  ${t.from} → ${t.to}  on "${t.event}"${guard}`);
  }

  if (l5 !== undefined) {
    lines.push("", `↑ L5: ${l5.name}`);
  }

  // referenced L3 blocks
  const allBlockRefs = new Set<string>();
  for (const config of Object.values(sm.states)) {
    if (config.onEntry?.blockRef !== undefined) allBlockRefs.add(config.onEntry.blockRef);
    if (config.onExit?.blockRef !== undefined) allBlockRefs.add(config.onExit.blockRef);
  }
  for (const t of sm.transitions) {
    if (t.guard !== undefined) allBlockRefs.add(t.guard);
  }

  if (allBlockRefs.size > 0) {
    lines.push("", `↓ L3 blocks (${String(allBlockRefs.size)}):`);
    for (const ref of allBlockRefs) {
      const block = l3Blocks.find((b) => b.id === ref);
      if (block === undefined) {
        lines.push(`  ${ref}: [not found]`);
      } else {
        const sig = computeSignature(block.id, [...block.input], [...block.output]);
        lines.push(`  ${ref}: ${sig}`);
      }
    }
  }

  return lines.join("\n");
}

// ── L3 ──

export function viewL3Overview(blocks: readonly L3Block[]): string {
  const lines: string[] = [`L3 Logic Blocks (${String(blocks.length)} blocks)`, "─".repeat(30)];

  const maxIdLength = Math.max(...blocks.map((b) => b.id.length), 0);

  for (const block of blocks) {
    const sig = formatShortSignature(block);
    const padding = " ".repeat(Math.max(maxIdLength - block.id.length, 0));
    const validateCount = Object.keys(block.validate).length;
    const stats = `validate: ${String(validateCount)} | constraints: ${String(block.constraints.length)} | desc: ${truncate(block.description, 40)}`;
    lines.push(`${block.id}${padding}  ${sig}`, `${" ".repeat(maxIdLength + 2)}${stats}`, "");
  }

  return lines.join("\n").trimEnd();
}

export function viewL3Detail(
  block: L3Block,
  flows: readonly L4Artifact[],
  l2Blocks: readonly L2CodeBlock[],
): string {
  const lines: string[] = [
    block.id,
    "═".repeat(Math.max(block.id.length, 12)),
    formatShortSignature(block),
    "",
    "pins:",
  ];

  if (block.input.length > 0) {
    const maxPinName = Math.max(...block.input.map((p) => p.name.length));
    for (const pin of block.input) {
      const padding = " ".repeat(maxPinName - pin.name.length);
      const opt = pin.optional === true ? "[optional]" : "[required]";
      lines.push(`  in:  ${pin.name}${padding}: ${pin.type}  ${opt}`);
    }
  }

  if (block.output.length > 0) {
    const maxPinName = Math.max(...block.output.map((p) => p.name.length));
    for (const pin of block.output) {
      const padding = " ".repeat(maxPinName - pin.name.length);
      lines.push(`  out: ${pin.name}${padding}: ${pin.type}`);
    }
  }

  const validateEntries = Object.entries(block.validate);
  if (validateEntries.length > 0) {
    lines.push("", "validate:");
    const maxKey = Math.max(...validateEntries.map(([k]) => k.length));
    for (const [key, rule] of validateEntries) {
      const padding = " ".repeat(maxKey - key.length);
      lines.push(`  ${key}${padding} → ${rule}`);
    }
  }

  if (block.constraints.length > 0) {
    lines.push("", "constraints:");
    for (const c of block.constraints) {
      lines.push(`  • ${c}`);
    }
  }

  lines.push("", "description:", `  ${block.description}`);

  // ↑ L4: 哪些 artifact 引用了这个 block
  const referencingL4s = flows.filter((f) => extractBlockRefs(f).includes(block.id));

  if (referencingL4s.length > 0) {
    lines.push("");
    for (const l4 of referencingL4s) {
      const kind = getL4Kind(l4);
      lines.push(`↑ L4: used in ${l4.id} [${kind}]`);
    }
  }

  const l2 = l2Blocks.find((cb) => cb.blockRef === block.id);
  if (l2 !== undefined) {
    const synced = l2.sourceHash === block.contentHash ? "synced ✓" : "drift ⚠";
    lines.push(`↓ L2: ${l2.id} [${synced}]`);
  }

  return lines.join("\n");
}

// ── L2 ──

export function viewL2Overview(
  l2Blocks: readonly L2CodeBlock[],
  l3Blocks: readonly L3Block[],
): string {
  const lines: string[] = [`L2 Code Blocks (${String(l2Blocks.length)} blocks)`, "─".repeat(30)];

  const l3Map = new Map(l3Blocks.map((b) => [b.id, b]));

  for (const cb of l2Blocks) {
    const l3 = l3Map.get(cb.blockRef);
    const synced = cb.sourceHash === l3?.contentHash ? "synced" : "drift";
    const files = cb.files.length === 1 ? cb.files[0] : `${String(cb.files.length)} files`;
    lines.push(`${cb.id}  [${cb.language}] ${files}  (${synced})`);
  }

  return lines.join("\n");
}

export function viewL2Detail(cb: L2CodeBlock, l3Blocks: readonly L3Block[]): string {
  const l3 = l3Blocks.find((b) => b.id === cb.blockRef);
  const synced = cb.sourceHash === l3?.contentHash ? "synced ✓" : "drift ⚠";

  const lines: string[] = [
    cb.id,
    "═".repeat(Math.max(cb.id.length, 12)),
    "",
    `language: ${cb.language}`,
    `blockRef: ${cb.blockRef}`,
    `status:   ${synced}`,
    "",
    "files:",
  ];

  for (const file of cb.files) {
    lines.push(`  ${file}`);
  }

  if (l3 !== undefined) {
    lines.push("", `↑ L3: ${l3.id} — ${formatShortSignature(l3)}`);
  }

  lines.push(`↓ L1: ${cb.files.join(", ")}`);

  return lines.join("\n");
}

// ── 辅助函数 ──

function formatTrigger(flow: L4Flow): string {
  if (flow.trigger === undefined) return "";
  const config = flow.trigger.config;
  if (flow.trigger.type === "http") {
    const method = typeof config.method === "string" ? config.method : "?";
    const urlPath = typeof config.path === "string" ? config.path : "?";
    return `  ${method} ${urlPath}`;
  }
  return `  [${flow.trigger.type}]`;
}

function formatStep(step: Step): string {
  const ref = step.blockRef ?? step.flowRef ?? "";
  switch (step.action) {
    case "process": {
      const next = step.next !== undefined && step.next !== null ? ` → ${step.next}` : "";
      return `  [${step.id}] process ${ref}${next}`;
    }
    case "call": {
      const next = step.next !== undefined && step.next !== null ? ` → ${step.next}` : "";
      return `  [${step.id}] call ${ref}${next}`;
    }
    case "parallel": {
      const branches = step.branches?.join(", ") ?? "";
      return `  [${step.id}] parallel [${branches}]`;
    }
    case "wait": {
      const waitFor = step.waitFor?.join(", ") ?? "";
      const next = step.next !== undefined && step.next !== null ? ` → ${step.next}` : "";
      return `  [${step.id}] wait [${waitFor}]${next}`;
    }
  }
}

function formatShortSignature(block: L3Block): string {
  const inputs = block.input.map((p) => p.type).join(", ");
  const output =
    block.output.length === 1
      ? block.output[0].type
      : block.output.length === 0
        ? "void"
        : `(${block.output.map((p) => p.type).join(", ")})`;
  return `(${inputs}) → ${output}`;
}

function truncate(text: string, maxLength: number): string {
  const oneLine = text.replaceAll("\n", " ").trim();
  if (oneLine.length <= maxLength) return oneLine;
  return `${oneLine.slice(0, maxLength - 3)}...`;
}
