// design-l3 — L3 Contract 设计 prompt 模板
// 由 slash commands / forge prompt 驱动

import { languageDirective } from "../../core/i18n.js";
import { viewL4Detail } from "../../core/view.js";
import { complexityHeader } from "./complexity-header.js";
import type { L3Block } from "../../core/l3.js";
import type { L4Artifact, L4Flow, BlockContext } from "../../core/l4.js";

export interface DesignL3Input {
  readonly l4Context:
    | {
        // Legacy flow-only form (backward compat)
        readonly flow: L4Flow;
        readonly stepIndex: number;
        readonly prevBlock?: L3Block;
        readonly nextBlock?: L3Block;
      }
    | {
        // Generalized form for any L4 kind
        readonly l4: L4Artifact;
        readonly blockContext: BlockContext;
        readonly prevBlock?: L3Block;
        readonly nextBlock?: L3Block;
      };
  readonly existingBlock?: L3Block;
  readonly userIntent: string;
  readonly language?: string;
}

const L3_SCHEMA_EXAMPLE = `{
  "id": "validate-order",
  "name": "验证订单请求",
  "input": [
    { "name": "request", "type": "OrderRequest" }
  ],
  "output": [
    { "name": "result", "type": "ValidationResult" }
  ],
  "validate": {
    "request": "required",
    "request.items": "array, min 1, max 50",
    "request.customerId": "non-empty string"
  },
  "constraints": [
    "output.result.valid iff output.result.errors is empty",
    "output.result.errors contains all failed checks, not just first"
  ],
  "description": "逐项校验所有字段，包括 items 数量、金额范围、客户存在性",
  "contentHash": "placeholder",
  "revision": { "rev": 1, "parentRev": null, "source": { "type": "init" }, "timestamp": "..." }
}`;

export function buildDesignL3Prompt(input: DesignL3Input): string {
  const { l4Context, existingBlock } = input;
  const isNew = existingBlock === undefined;
  const action = isNew ? "Create" : "Update";

  // Normalize both input forms into a common shape
  let l4Artifact: L4Artifact;
  let blockId: string;
  let location: string;
  let prevBlock: L3Block | undefined;
  let nextBlock: L3Block | undefined;

  if ("blockContext" in l4Context) {
    // Generalized form
    l4Artifact = l4Context.l4;
    blockId = l4Context.blockContext.blockId;
    location = l4Context.blockContext.location;
    prevBlock = l4Context.prevBlock;
    nextBlock = l4Context.nextBlock;
  } else {
    // Legacy flow form
    l4Artifact = l4Context.flow;
    const step = l4Context.flow.steps[l4Context.stepIndex] as
      | (typeof l4Context.flow.steps)[number]
      | undefined;
    blockId = step?.blockRef ?? "unknown";
    location = `step ${String(l4Context.stepIndex)} in flow "${l4Context.flow.id}"`;
    prevBlock = l4Context.prevBlock;
    nextBlock = l4Context.nextBlock;
  }

  // Build L4 context view
  const l3sForContext: L3Block[] = [];
  if (prevBlock !== undefined) l3sForContext.push(prevBlock);
  if (nextBlock !== undefined) l3sForContext.push(nextBlock);
  if (existingBlock !== undefined) l3sForContext.push(existingBlock);

  const l4View = viewL4Detail(l4Artifact, l3sForContext);

  // Neighbor context
  const neighborSection: string[] = [];
  if (prevBlock !== undefined) {
    neighborSection.push(
      "### Upstream Block (previous step output)",
      `- id: ${prevBlock.id}`,
      `- output: ${prevBlock.output.map((p) => `${p.name}: ${p.type}`).join(", ")}`,
    );
  }
  if (nextBlock !== undefined) {
    neighborSection.push(
      "### Downstream Block (next step input)",
      `- id: ${nextBlock.id}`,
      `- input: ${nextBlock.input.map((p) => `${p.name}: ${p.type}`).join(", ")}`,
    );
  }

  const currentSection = isNew
    ? "No existing L3 block. Creating new contract."
    : ["### Current L3 Block", "```json", JSON.stringify(existingBlock, null, 2), "```"].join("\n");

  return (
    complexityHeader("standard") +
    [
      `# ${action} L3 Contract: ${blockId}`,
      "",
      "You are designing a contract box (L3) — the specification for a single logic unit.",
      "L3 is the interface between human intent and AI implementation.",
      "",
      `## L4 Context (${location})`,
      "",
      l4View,
      "",
      ...(neighborSection.length > 0 ? ["## Neighbor Context", "", ...neighborSection, ""] : []),
      "## User Intent",
      "",
      input.userIntent,
      "",
      "## Current State",
      "",
      currentSection,
      "",
      "## Instructions",
      "",
      "Design the contract box with:",
      "- **input pins**: Each has `name`, `type` (TypeScript interface name), optional `optional?: true`",
      "- **output pins**: Same format as input",
      "- **validate**: Input constraints as natural language rules",
      "  - Key = field path (e.g., `request.items`)",
      "  - Value = natural language rule (e.g., `array, min 1, max 50`)",
      "- **constraints**: Output assertions as natural language",
      "  - Each string asserts a relationship about the output",
      "- **description**: Natural language describing the internal logic",
      "",
      "The three parts work together:",
      "- **validate** constrains INPUT",
      "- **constraints** constrains OUTPUT",
      "- **description** covers the MIDDLE (transformation logic)",
      "",
      "Write to `.svp/l3/<block-id>.json` using this schema:",
      "",
      "```json",
      L3_SCHEMA_EXAMPLE,
      "```",
      "",
      "After writing, run `forge rehash l3/${blockId}` to fix contentHash.",
      "Then show `forge view l3/${blockId}` to the user for confirmation.",
      "",
      "## Rules",
      "",
      "- Pin types reference TypeScript interface names from the project's types/ directory",
      '- validate uses natural language, not code: `"array, min 1"` not `"Array.isArray && length >= 1"`',
      "- constraints use natural language assertions about output",
      "- description explains HOW to transform input to output",
      "- Ensure pin types are compatible with upstream/downstream blocks",
      "- Write 'placeholder' for contentHash — rehash will fix it",
    ].join("\n") +
    languageDirective(input.language ?? "en")
  );
}
