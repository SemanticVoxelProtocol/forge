// 文档检查核心逻辑 — 纯函数，不做 IO

import type { L2CodeBlock } from "./l2.js";
import type { L3Block } from "./l3.js";
import type { L4Artifact } from "./l4.js";
import type { L5Blueprint } from "./l5.js";

export interface DocsCheckInput {
  readonly l5?: L5Blueprint;
  readonly l4Flows: readonly L4Artifact[];
  readonly l3Blocks: readonly L3Block[];
  readonly l2Blocks: readonly L2CodeBlock[];
  readonly existingDocs: {
    readonly l5: boolean;
    readonly nodes: ReadonlyMap<string, boolean>; // nodeId → has docs.md
    readonly graphs: ReadonlyMap<string, boolean>; // graphName → has docs.md
  };
}

export interface DocsIssue {
  readonly severity: "warning";
  readonly layer: string;
  readonly entityId: string;
  readonly code: "MISSING_DOCS";
  readonly message: string;
}

/** 检查文档覆盖率，返回缺失文档的 warning 列表 */
export function checkDocs(input: DocsCheckInput): DocsIssue[] {
  const issues: DocsIssue[] = [];

  // L5 blueprint → docs/l5.md
  if (input.l5 !== undefined && !input.existingDocs.l5) {
    issues.push({
      severity: "warning",
      layer: "l5",
      entityId: input.l5.id,
      code: "MISSING_DOCS",
      message: `L5 blueprint "${input.l5.id}" has no project documentation (docs/l5.md)`,
    });
  }

  // L3 blocks → nodes/<id>/docs.md
  for (const block of input.l3Blocks) {
    if (!input.existingDocs.nodes.has(block.id)) {
      issues.push({
        severity: "warning",
        layer: "l3",
        entityId: block.id,
        code: "MISSING_DOCS",
        message: `L3 block "${block.id}" has no module documentation (nodes/${block.id}/docs.md)`,
      });
    }
  }

  // L4 artifacts → graphs/<id>.docs.md
  for (const artifact of input.l4Flows) {
    if (!input.existingDocs.graphs.has(artifact.id)) {
      issues.push({
        severity: "warning",
        layer: "l4",
        entityId: artifact.id,
        code: "MISSING_DOCS",
        message: `L4 artifact "${artifact.id}" has no graph documentation (graphs/${artifact.id}.docs.md)`,
      });
    }
  }

  return issues;
}
