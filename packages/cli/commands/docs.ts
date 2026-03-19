// forge docs — 文档质量检查 CLI 命令
// list: 列出已有文档  check: 检查文档覆盖率

import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { checkDocs } from "../../core/docs.js";
import { loadCheckInput } from "../load.js";
import type { DocsCheckInput } from "../../core/docs.js";
import type { Command } from "commander";

/** Scan nodes/{id}/docs.md, return nodeId set with existing docs */
async function scanNodeDocs(root: string): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  const nodesDir = path.join(root, "nodes");
  try {
    const entries = await readdir(nodesDir);
    for (const entry of entries) {
      const docsPath = path.join(nodesDir, entry, "docs.md");
      try {
        const s = await stat(docsPath);
        if (s.isFile()) result.set(entry, true);
      } catch {
        // docs.md doesn't exist for this node
      }
    }
  } catch {
    // nodes/ directory doesn't exist
  }
  return result;
}

/** Scan graphs/{name}.docs.md, return graphName set with existing docs */
async function scanGraphDocs(root: string): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  const graphsDir = path.join(root, "graphs");
  try {
    const entries = await readdir(graphsDir);
    for (const entry of entries) {
      if (entry.endsWith(".docs.md")) {
        const graphName = entry.slice(0, -".docs.md".length);
        result.set(graphName, true);
      }
    }
  } catch {
    // graphs/ directory doesn't exist
  }
  return result;
}

/** 检查 docs/l5.md 是否存在 */
async function hasL5Docs(root: string): Promise<boolean> {
  try {
    const s = await stat(path.join(root, "docs", "l5.md"));
    return s.isFile();
  } catch {
    return false;
  }
}

/** 注册 forge docs 子命令组 */
export function registerDocs(program: Command): void {
  const docs = program
    .command("docs")
    .description("Documentation quality tools");

  // ── forge docs list ──
  docs
    .command("list")
    .description("List all existing documentation files and their linked artifacts")
    .option("-r, --root <path>", "Project root directory", ".")
    .action(async (options: { root: string }) => {
      const root = options.root;
      const nodes = await scanNodeDocs(root);
      const graphs = await scanGraphDocs(root);
      const l5 = await hasL5Docs(root);

      const rows: Array<{ path: string; artifact: string; status: string }> = [];

      if (l5) {
        rows.push({ path: "docs/l5.md", artifact: "L5 blueprint", status: "ok" });
      }

      for (const [nodeId] of nodes) {
        rows.push({
          path: `nodes/${nodeId}/docs.md`,
          artifact: `L3 block "${nodeId}"`,
          status: "ok",
        });
      }

      for (const [graphName] of graphs) {
        rows.push({
          path: `graphs/${graphName}.docs.md`,
          artifact: `L4 artifact "${graphName}"`,
          status: "ok",
        });
      }

      if (rows.length === 0) {
        console.log("No documentation files found.");
        console.log("Create docs with: nodes/<id>/docs.md or graphs/<name>.docs.md");
        return;
      }

      // Simple table output
      const pathWidth = Math.max(4, ...rows.map((r) => r.path.length));
      const artWidth = Math.max(8, ...rows.map((r) => r.artifact.length));

      console.log(
        `${"PATH".padEnd(pathWidth)}  ${"ARTIFACT".padEnd(artWidth)}  STATUS`,
      );
      console.log(`${"─".repeat(pathWidth)}  ${"─".repeat(artWidth)}  ──────`);
      for (const row of rows) {
        console.log(
          `${row.path.padEnd(pathWidth)}  ${row.artifact.padEnd(artWidth)}  ${row.status}`,
        );
      }
    });

  // ── forge docs check ──
  docs
    .command("check")
    .description("Check documentation coverage against .svp/ artifacts")
    .option("-r, --root <path>", "Project root directory", ".")
    .option("--json", "Output results as JSON")
    .action(async (options: { root: string; json?: boolean }) => {
      const root = options.root;

      let input;
      try {
        input = await loadCheckInput(root);
      } catch {
        console.error(
          `Error: cannot load .svp/ data from "${root}". Run \`forge init\` first.`,
        );
        process.exitCode = 1;
        return;
      }

      const [nodes, graphs, l5] = await Promise.all([
        scanNodeDocs(root),
        scanGraphDocs(root),
        hasL5Docs(root),
      ]);

      const docsInput: DocsCheckInput = {
        l5: input.l5,
        l4Flows: input.l4Flows,
        l3Blocks: input.l3Blocks,
        l2Blocks: input.l2Blocks,
        existingDocs: { l5, nodes, graphs },
      };

      const issues = checkDocs(docsInput);

      // Calculate coverage
      const totalArtifacts =
        (input.l5 === undefined ? 0 : 1) +
        input.l3Blocks.length +
        input.l4Flows.length;
      const documented =
        (input.l5 === undefined ? 0 : l5 ? 1 : 0) +
        input.l3Blocks.filter((b) => nodes.has(b.id)).length +
        input.l4Flows.filter((f) => graphs.has(f.id)).length;
      const coverage =
        totalArtifacts === 0
          ? 100
          : Math.round((documented / totalArtifacts) * 100);

      if (options.json === true) {
        console.log(
          JSON.stringify({ issues, coverage, total: totalArtifacts, documented }, null, 2),
        );
        return;
      }

      if (issues.length === 0) {
        console.log(`Documentation coverage: ${String(coverage)}% (${String(documented)}/${String(totalArtifacts)} artifacts)`);
        console.log("All artifacts have documentation.");
        return;
      }

      console.log(`Documentation coverage: ${String(coverage)}% (${String(documented)}/${String(totalArtifacts)} artifacts)`);
      console.log();
      console.log("Missing documentation:");
      for (const issue of issues) {
        console.log(`  [${issue.layer}] ${issue.message}`);
      }
    });
}
