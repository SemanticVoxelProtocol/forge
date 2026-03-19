// design-l4 — L4 Flow 设计 prompt 模板
// 由 slash commands / forge prompt 驱动

import { languageDirective } from "../../core/i18n.js";
import { extractBlockRefs, getL4Kind } from "../../core/l4.js";
import { viewL5Overview } from "../../core/view.js";
import { complexityHeader } from "./complexity-header.js";
import type { L3Block } from "../../core/l3.js";
import type { L4Artifact } from "../../core/l4.js";
import type { L5Blueprint } from "../../core/l5.js";

export interface DesignL4Input {
  readonly l5: L5Blueprint;
  readonly existingFlows: readonly L4Artifact[];
  readonly existingBlocks: readonly L3Block[];
  readonly userIntent: string;
  readonly targetFlowId?: string;
  readonly language?: string;
  readonly docs?: string;
}

const L4_SCHEMA_EXAMPLE = `{
  "id": "order-flow",
  "name": "Order Processing Flow",
  "trigger": { "type": "http", "config": { "method": "POST", "path": "/orders" } },
  "steps": [
    { "id": "validate", "action": "process", "blockRef": "validate-order", "next": "check-inventory" },
    { "id": "check-inventory", "action": "process", "blockRef": "check-inventory", "next": "create-order" },
    { "id": "create-order", "action": "process", "blockRef": "create-order", "next": null }
  ],
  "dataFlows": [
    { "from": "validate.result", "to": "check-inventory.request" },
    { "from": "check-inventory.result", "to": "create-order.request" }
  ],
  "contentHash": "placeholder",
  "revision": { "rev": 1, "parentRev": null, "source": { "type": "init" }, "timestamp": "..." }
}`;

export function buildDesignL4Prompt(input: DesignL4Input): string {
  const isNew = input.targetFlowId === undefined;
  const action = isNew ? "Create" : "Update";

  const l5View = viewL5Overview(input.l5);

  const existingFlowsSection =
    input.existingFlows.length === 0
      ? "No existing flows."
      : input.existingFlows
          .map(
            (f) => `- ${f.id} [${getL4Kind(f)}]: ${String(extractBlockRefs(f).length)} block refs`,
          )
          .join("\n");

  const existingBlocksSection =
    input.existingBlocks.length === 0
      ? "No existing L3 blocks."
      : input.existingBlocks
          .map(
            (b) =>
              `- ${b.id}: (${b.input.map((p) => p.type).join(", ")}) → ${b.output.map((p) => p.type).join(", ")}`,
          )
          .join("\n");

  return (
    complexityHeader("heavy") +
    [
      `# ${action} L4 Flow`,
      "",
      "You are designing a flow (L4) that orchestrates L3 logic blocks.",
      "Each flow defines steps, their execution order, and data flow between them.",
      "",
      "## Project Context (L5)",
      "",
      l5View,
      "",
      "## User Intent",
      "",
      input.userIntent,
      "",
      ...(input.docs === undefined
        ? []
        : ["## Graph Documentation", "", input.docs, ""]),
      "## Existing Flows",
      "",
      existingFlowsSection,
      "",
      "## Existing L3 Blocks (available for reuse)",
      "",
      existingBlocksSection,
      "",
      "## Instructions",
      "",
      "Design the flow with:",
      "- **steps**: Each step has id, action, and navigation (next/branches/waitFor)",
      "  - `process`: References an L3 block via `blockRef` (can reference blocks that don't exist yet)",
      "  - `call`: References another L4 flow via `flowRef`",
      "  - `parallel`: Fan-out with `branches` array of step ids",
      "  - `wait`: Join point with `waitFor` array of step ids",
      '- **dataFlows**: Connect output pins to input pins: `"stepId.pinName"` → `"stepId.pinName"`',
      "- **trigger** (optional): HTTP, event, schedule, or manual",
      "",
      "Write to `.svp/l4/<flow-id>.json` using this schema:",
      "",
      "```json",
      L4_SCHEMA_EXAMPLE,
      "```",
      "",
      "After writing, run `forge rehash l4` to fix contentHash.",
      "Then show `forge view l4` to the user for confirmation.",
      "",
      "## Rules",
      "",
      "- Every `process` step MUST have a `blockRef`",
      "- Step ids must be unique within the flow",
      '- dataFlows use format `"stepId.pinName"`',
      "- Fan-out uses `parallel` action, join uses `wait` action",
      "- Write 'placeholder' for contentHash — rehash will fix it",
      "- Do NOT create L3 blocks here — only reference them by id",
      "",
      "**Design quality guidelines:**",
      "- Each blockRef should map to a single-responsibility unit — if a step name contains 'all' or 'everything', it likely needs splitting",
      "- Avoid 'god blocks' that orchestrate across all domains — prefer one flow per domain or use case",
      "- Cross-cutting concerns (auth, routing, logging) should be separate blocks, not bundled into a domain block",
      "- If a flow has more than 8 steps, consider whether it should be split into sub-flows",
    ].join("\n") +
    languageDirective(input.language ?? "en")
  );
}
