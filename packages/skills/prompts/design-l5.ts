// design-l5 — L5 Blueprint 设计 prompt 模板
// 由 slash commands / forge prompt 驱动

import { languageDirective } from "../../core/i18n.js";
import { complexityHeader } from "./complexity-header.js";
import type { L5Blueprint } from "../../core/l5.js";

export interface DesignL5Input {
  readonly currentL5?: L5Blueprint;
  readonly userIntent: string;
  readonly language?: string;
}

const L5_SCHEMA_EXAMPLE = `{
  "id": "my-project",
  "name": "My Project",
  "version": "0.1.0",
  "intent": "解决什么问题，怎么解决，成功标准是什么",
  "constraints": ["约束1", "约束2"],
  "domains": [
    { "name": "order", "description": "订单领域", "dependencies": ["inventory"] }
  ],
  "integrations": [
    { "name": "postgres", "type": "database", "description": "主数据库" }
  ],
  "contentHash": "placeholder",
  "revision": { "rev": 1, "parentRev": null, "source": { "type": "init" }, "timestamp": "..." }
}`;

export function buildDesignL5Prompt(input: DesignL5Input): string {
  const isNew = input.currentL5 === undefined;
  const action = isNew ? "Create" : "Update";
  const currentSection = isNew
    ? "No existing L5 blueprint. This is a new project."
    : ["### Current L5 Blueprint", "```json", JSON.stringify(input.currentL5, null, 2), "```"].join(
        "\n",
      );

  return (
    complexityHeader("heavy") +
    [
      `# ${action} L5 Blueprint`,
      "",
      "You are designing the top-level blueprint (L5) for an SVP project.",
      "L5 captures the system's intent, constraints, domains, and integrations.",
      "Keep it concise (~10 lines of effective information).",
      "",
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
      "From the user description, extract:",
      "- **intent**: Core problem + solution approach + success criteria (1-2 sentences)",
      "- **constraints**: Functional, non-functional, and business constraints",
      "- **domains**: Bounded contexts with dependency relationships",
      "- **integrations**: External systems with type (database/api/queue/storage)",
      "",
      "Write the result to `.svp/l5.json` using this schema:",
      "",
      "```json",
      L5_SCHEMA_EXAMPLE,
      "```",
      "",
      "After writing, run `forge rehash l5` to fix the contentHash.",
      "Then show `forge view l5` to the user for confirmation.",
      "",
      "## Rules",
      "",
      "- Only describe WHAT the system does, not HOW",
      "- Keep intent to 1-2 sentences",
      "- Constraints are strings, not objects",
      "- Domain dependencies reference other domain names",
      "- Write 'placeholder' for contentHash — rehash will fix it",
    ].join("\n") +
    languageDirective(input.language ?? "en")
  );
}
