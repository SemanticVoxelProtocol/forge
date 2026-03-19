// forge changeset — cross-artifact version grouping
// Start, complete, list, view, and abandon changesets

import {
  computeBaselineFromArtifacts,
  computeDiff,
  findActiveChangeset,
  formatDiffSummary,
  listChangesets,
  readChangeset,
  writeChangeset,
  deleteChangeset,
} from "../../core/index.js";
import { loadCheckInput } from "../load.js";
import type { Changeset } from "../../core/index.js";
import type { Command } from "commander";

/** Convert a name to kebab-case id */
function toId(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replaceAll(/[^\da-z]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

/** Build current rev map from CheckInput (same shape as baseline) */
function currentRevsFromInput(
  input: Awaited<ReturnType<typeof loadCheckInput>>,
): Record<string, number> {
  return computeBaselineFromArtifacts(input);
}

export function registerChangeset(program: Command): void {
  const cmd = program.command("changeset").description("Cross-artifact version grouping");

  // ── start ──
  cmd
    .command("start <name>")
    .description("Start a new changeset (snapshot baseline)")
    .requiredOption("--reason <reason>", "Why this change is being made")
    .option("-r, --root <path>", "Project root directory", ".")
    .action(async (name: string, options: { reason: string; root: string }) => {
      const existing = await findActiveChangeset(options.root);
      if (existing !== null) {
        console.error(
          `Error: Active changeset "${existing.id}" already exists. Complete or abandon it first.`,
        );
        process.exitCode = 1;
        return;
      }

      const input = await loadCheckInput(options.root);
      const baseline = computeBaselineFromArtifacts(input);
      const id = toId(name);

      const cs: Changeset = {
        id,
        name,
        reason: options.reason,
        status: "active",
        baseline,
        createdAt: new Date().toISOString(),
      };

      await writeChangeset(options.root, cs);
      console.log(`Changeset "${id}" started.`);
      console.log(`Baseline: ${String(Object.keys(baseline).length)} artifact(s) captured.`);
    });

  // ── complete ──
  cmd
    .command("complete")
    .description("Complete the active changeset")
    .option("-r, --root <path>", "Project root directory", ".")
    .action(async (options: { root: string }) => {
      const active = await findActiveChangeset(options.root);
      if (active === null) {
        console.error("Error: No active changeset to complete.");
        process.exitCode = 1;
        return;
      }

      const input = await loadCheckInput(options.root);
      const current = currentRevsFromInput(input);
      const diff = computeDiff(active.baseline, current);

      const completed: Changeset = {
        ...active,
        status: "completed",
        completedAt: new Date().toISOString(),
      };
      await writeChangeset(options.root, completed);

      console.log(`Changeset "${active.id}" completed.`);
      console.log();
      console.log(formatDiffSummary(diff));
    });

  // ── list ──
  cmd
    .command("list")
    .description("List all changesets")
    .option("-r, --root <path>", "Project root directory", ".")
    .action(async (options: { root: string }) => {
      const ids = await listChangesets(options.root);
      if (ids.length === 0) {
        console.log("No changesets found.");
        return;
      }

      // Load all, show active first
      const all: Changeset[] = [];
      for (const id of ids) {
        const cs = await readChangeset(options.root, id);
        if (cs !== null) all.push(cs);
      }

      const active = all.filter((c) => c.status === "active");
      const completed = all.filter((c) => c.status === "completed");

      for (const cs of [...active, ...completed]) {
        const marker = cs.status === "active" ? "* " : "  ";
        const date =
          cs.status === "completed" && cs.completedAt !== undefined
            ? ` (completed ${cs.completedAt.slice(0, 10)})`
            : "";
        console.log(`${marker}${cs.id} — ${cs.reason}${date}`);
      }
    });

  // ── view ──
  cmd
    .command("view [id]")
    .description("View changeset diff (defaults to active)")
    .option("-r, --root <path>", "Project root directory", ".")
    .action(async (id: string | undefined, options: { root: string }) => {
      const cs =
        id === undefined
          ? await findActiveChangeset(options.root)
          : await readChangeset(options.root, id);

      if (cs === null) {
        const msg =
          id === undefined ? "Error: No active changeset." : `Error: Changeset "${id}" not found.`;
        console.error(msg);
        process.exitCode = 1;
        return;
      }

      const input = await loadCheckInput(options.root);
      const current = currentRevsFromInput(input);
      const diff = computeDiff(cs.baseline, current);

      console.log(`Changeset: ${cs.id}`);
      console.log(`Reason: ${cs.reason}`);
      console.log(`Status: ${cs.status}`);
      console.log();
      console.log(formatDiffSummary(diff));
    });

  // ── abandon ──
  cmd
    .command("abandon [id]")
    .description("Delete an active changeset")
    .option("-r, --root <path>", "Project root directory", ".")
    .action(async (id: string | undefined, options: { root: string }) => {
      const cs =
        id === undefined
          ? await findActiveChangeset(options.root)
          : await readChangeset(options.root, id);

      if (cs === null) {
        const msg =
          id === undefined
            ? "Error: No active changeset to abandon."
            : `Error: Changeset "${id}" not found.`;
        console.error(msg);
        process.exitCode = 1;
        return;
      }

      if (cs.status !== "active") {
        console.error(`Error: Changeset "${cs.id}" is already completed. Cannot abandon.`);
        process.exitCode = 1;
        return;
      }

      await deleteChangeset(options.root, cs.id);
      console.log(`Changeset "${cs.id}" abandoned.`);
    });
}
