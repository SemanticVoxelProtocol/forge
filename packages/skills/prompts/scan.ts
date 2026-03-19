// scan — Brownfield reverse generation prompt templates
// Three phases: L1→L3, L3→L4, L3+L4→L5
// Each outputs a prompt instructing AI to write SVP artifacts from existing code

import { languageDirective } from "../../core/i18n.js";
import { complexityHeader } from "./complexity-header.js";
import type { L3Block } from "../../core/l3.js";
import type { L4Artifact } from "../../core/l4.js";
import type { ScanContext } from "../../core/scan.js";

// ── Shared helpers ──

function formatFileTree(ctx: ScanContext): string {
  const lines: string[] = [];
  for (const f of ctx.files) {
    if (f.exports.length === 0) {
      lines.push(`- ${f.filePath}`);
    } else {
      lines.push(`- ${f.filePath}`);
      for (const exp of f.exports) {
        lines.push(`    ${exp.kind} ${exp.name}: ${exp.signature}`);
      }
    }
  }
  if (ctx.summary.truncated) {
    lines.push(`  ... (truncated to ${String(ctx.summary.totalFiles)} files)`);
  }
  return lines.join("\n");
}

function summaryLine(ctx: ScanContext): string {
  return `${String(ctx.summary.totalFiles)} files, ${String(ctx.summary.totalExports)} exported symbols${ctx.summary.truncated ? " (truncated)" : ""}`;
}

// ── Phase 1: L1 → L3 ──

export interface ScanL3Input {
  readonly scanContext: ScanContext;
  readonly userIntent?: string;
  readonly language?: string;
}

const L3_SCHEMA_EXAMPLE = `{
  "id": "<block-id>",
  "name": "<human-readable name>",
  "input": [
    { "name": "request", "type": "OrderRequest" }
  ],
  "output": [
    { "name": "result", "type": "ValidationResult" }
  ],
  "validate": {
    "request": "required",
    "request.items": "array, min 1"
  },
  "constraints": [
    "output.result.valid iff no errors"
  ],
  "description": "What this block does internally",
  "contentHash": "placeholder",
  "revision": { "rev": 1, "parentRev": null, "source": { "type": "init" }, "timestamp": "..." }
}`;

export function buildScanL3Prompt(input: ScanL3Input): string {
  const { scanContext } = input;

  return (
    complexityHeader("heavy") +
    [
      "# Reverse-Engineer L3 Contracts from Existing Code",
      "",
      "You are analyzing an existing codebase to extract L3 contract blocks for SVP.",
      "L3 blocks are the interface specifications — each groups related exports into a logical unit.",
      "",
      ...(input.userIntent === undefined
        ? []
        : ["## System Intent", "", input.userIntent, ""]),
      "## Scanned Codebase",
      "",
      `Summary: ${summaryLine(scanContext)}`,
      "",
      "```",
      formatFileTree(scanContext),
      "```",
      "",
      "## Instructions",
      "",
      "Analyze the scanned code and group related exports into logical L3 blocks.",
      "Each block represents one cohesive responsibility unit.",
      "",
      "For each block:",
      "1. **Identify cohesion**: Group exports that work together (same domain, shared types)",
      "2. **Infer input pins**: From function parameters and imported types",
      "3. **Infer output pins**: From return types",
      "4. **Infer validate rules**: From parameter constraints visible in signatures",
      "5. **Write constraints**: Output assertions based on the function contracts",
      "6. **Write description**: What the block does internally",
      "",
      "Write each block to `.svp/l3/<block-id>.json` using this schema:",
      "",
      "```json",
      L3_SCHEMA_EXAMPLE,
      "```",
      "",
      "## Grouping Guidelines",
      "",
      "- One file with multiple related exports → usually one L3 block",
      "- Multiple files sharing a domain concept → consider one L3 block",
      "- A single large class → may split into multiple L3 blocks by responsibility",
      "- Utility/helper files → may group into a shared utility block or skip",
      "- Use kebab-case for block IDs (e.g., `validate-order`, `process-payment`)",
      "",
      "## After Writing",
      "",
      "Run `forge rehash l3` to fix all contentHash values.",
      "Then run `forge prompt scan` to proceed to Phase 2 (L4 flow design).",
      "",
      "## Rules",
      "",
      "- Pin types reference TypeScript interface names from the project",
      '- validate uses natural language: `"array, min 1"` not code',
      "- constraints use natural language assertions about output",
      "- description explains WHAT, not HOW (implementation is already in code)",
      '- Write "placeholder" for contentHash — rehash will fix it',
      "- Do NOT create blocks for test files, configs, or build artifacts",
    ].join("\n") +
    languageDirective(input.language ?? "en")
  );
}

// ── Phase 2: L3 → L4 ──

export interface ScanL4Input {
  readonly scanContext: ScanContext;
  readonly l3Blocks: readonly L3Block[];
  readonly userIntent?: string;
  readonly language?: string;
}

const L4_FLOW_SCHEMA_EXAMPLE = `{
  "kind": "flow",
  "id": "<flow-id>",
  "name": "<human-readable name>",
  "trigger": { "type": "http", "config": { "method": "POST", "path": "/api/..." } },
  "steps": [
    { "id": "s1", "action": "process", "blockRef": "<l3-block-id>", "next": "s2" },
    { "id": "s2", "action": "process", "blockRef": "<l3-block-id>", "next": null }
  ],
  "dataFlows": [
    { "from": "s1.result", "to": "s2.input" }
  ],
  "contentHash": "placeholder",
  "revision": { "rev": 1, "parentRev": null, "source": { "type": "init" }, "timestamp": "..." }
}`;

export function buildScanL4Prompt(input: ScanL4Input): string {
  const { scanContext, l3Blocks } = input;

  const l3Summary = l3Blocks
    .map((b) => {
      const ins = b.input.map((p) => `${p.name}: ${p.type}`).join(", ");
      const outs = b.output.map((p) => `${p.name}: ${p.type}`).join(", ");
      return `- **${b.id}** (${b.name}): (${ins}) → (${outs})`;
    })
    .join("\n");

  return (
    complexityHeader("standard") +
    [
      "# Infer L4 Flows from L3 Contracts and Code Structure",
      "",
      "You are analyzing L3 contracts and code patterns to infer L4 flow artifacts for SVP.",
      "L4 describes how L3 blocks connect — the orchestration layer.",
      "",
      ...(input.userIntent === undefined
        ? []
        : ["## System Intent", "", input.userIntent, ""]),
      "## Existing L3 Contracts",
      "",
      l3Summary,
      "",
      "## Code Structure (for import/call pattern hints)",
      "",
      "```",
      formatFileTree(scanContext),
      "```",
      "",
      "## Instructions",
      "",
      "Analyze how L3 blocks relate to each other by examining:",
      "1. **Import patterns**: Which files import from which → data flow direction",
      "2. **Type dependencies**: Shared types between blocks → they likely connect in a flow",
      "3. **Call patterns**: Function A calls function B → A's step comes before B's step",
      "",
      "Identify flows and write L4 artifacts:",
      "- **Request-response pipelines**: trigger → step chain → result → use `kind: \"flow\"`",
      "- **Event-driven patterns**: shared state + handlers → use `kind: \"event-graph\"`",
      "- **State machines**: entity lifecycle → use `kind: \"state-machine\"`",
      "",
      "Write each artifact to `.svp/l4/<flow-id>.json` using this schema (flow example):",
      "",
      "```json",
      L4_FLOW_SCHEMA_EXAMPLE,
      "```",
      "",
      "## Wiring Guidelines",
      "",
      "- Each step references an L3 block via `blockRef`",
      "- `dataFlows` connect output pins of one step to input pins of the next",
      "- Use format `\"stepId.pinName\"` for dataFlow endpoints",
      "- Steps execute in `next` chain order",
      "- Group related flows by domain (e.g., `order-flow`, `payment-flow`)",
      "",
      "## After Writing",
      "",
      "Run `forge rehash l4` to fix all contentHash values.",
      "Then run `forge prompt scan` to proceed to Phase 3 (L5 blueprint).",
      "",
      "## Rules",
      "",
      "- Every L3 block should appear in at least one L4 flow",
      "- Flows must have at least one step",
      "- dataFlows must reference valid step IDs and pin names from L3 contracts",
      '- Write "placeholder" for contentHash — rehash will fix it',
      "- Use kebab-case for flow IDs",
    ].join("\n") +
    languageDirective(input.language ?? "en")
  );
}

// ── Phase 3: L3 + L4 → L5 ──

export interface ScanL5Input {
  readonly scanContext: ScanContext;
  readonly l3Blocks: readonly L3Block[];
  readonly l4Flows: readonly L4Artifact[];
  readonly userIntent?: string;
  readonly language?: string;
}

const L5_SCHEMA_EXAMPLE = `{
  "id": "<project-id>",
  "name": "<Project Name>",
  "version": "0.1.0",
  "intent": "Core problem + solution approach + success criteria",
  "constraints": ["constraint1", "constraint2"],
  "domains": [
    { "name": "order", "description": "Order processing domain", "dependencies": ["inventory"] }
  ],
  "integrations": [
    { "name": "postgres", "type": "database", "description": "Primary database" }
  ],
  "contentHash": "placeholder",
  "revision": { "rev": 1, "parentRev": null, "source": { "type": "init" }, "timestamp": "..." }
}`;

export function buildScanL5Prompt(input: ScanL5Input): string {
  const { l3Blocks, l4Flows } = input;

  const l4Summary = l4Flows
    .map((f) => `- **${f.id}** (${f.name})`)
    .join("\n");

  const l3Summary = l3Blocks
    .map((b) => `- **${b.id}** (${b.name})`)
    .join("\n");

  return (
    complexityHeader("standard") +
    [
      "# Synthesize L5 Blueprint from L3 Contracts and L4 Flows",
      "",
      "You are synthesizing the top-level L5 blueprint from existing L3 and L4 artifacts.",
      "L5 captures the system's intent, constraints, domains, and integrations.",
      "",
      ...(input.userIntent === undefined
        ? []
        : ["## System Intent", "", input.userIntent, ""]),
      "## Existing L4 Flows",
      "",
      l4Summary,
      "",
      "## Existing L3 Contracts",
      "",
      l3Summary,
      "",
      "## Instructions",
      "",
      "From the L3 contracts and L4 flows, synthesize:",
      "- **intent**: What does this system do? Core problem + solution + success criteria (1-2 sentences)",
      "- **constraints**: Functional, non-functional, and business constraints inferred from the code",
      "- **domains**: Bounded contexts derived from L4 flow groupings",
      "  - Each domain groups related L4 flows",
      "  - Include dependency relationships between domains",
      "- **integrations**: External systems inferred from code patterns",
      "  - Look for database connections, API calls, message queues, storage",
      "",
      "Write to `.svp/l5.json` using this schema:",
      "",
      "```json",
      L5_SCHEMA_EXAMPLE,
      "```",
      "",
      "## After Writing",
      "",
      "Run `forge rehash l5` to fix the contentHash.",
      "Then run `forge check` to verify the full SVP structure is consistent.",
      "",
      "## Rules",
      "",
      "- Only describe WHAT the system does, not HOW",
      "- Keep intent to 1-2 sentences",
      "- Constraints are strings, not objects",
      "- Domain dependencies reference other domain names",
      '- Write "placeholder" for contentHash — rehash will fix it',
    ].join("\n") +
    languageDirective(input.language ?? "en")
  );
}
