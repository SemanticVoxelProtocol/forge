// Changeset — cross-artifact version grouping
// Records a baseline snapshot, computes diff at view/complete time

import type { CheckInput } from "./check.js";

/** A changeset groups related cross-artifact changes */
export interface Changeset {
  readonly id: string; // kebab-case, e.g. "add-stockout-notification"
  readonly name: string; // human-readable
  readonly reason: string; // why this change is being made
  readonly status: "active" | "completed";
  readonly baseline: Record<string, number>; // "l5:project-id" → rev, "l3:validate-order" → 2
  readonly createdAt: string; // ISO 8601
  readonly completedAt?: string;
}

/** Computed diff between baseline and current state */
export interface ChangesetDiff {
  readonly created: Array<{ layer: string; id: string; currentRev: number }>;
  readonly modified: Array<{ layer: string; id: string; fromRev: number; toRev: number }>;
  readonly unchanged: Array<{ layer: string; id: string; rev: number }>;
}

/** Build a baseline snapshot from current artifact revisions */
export function computeBaselineFromArtifacts(input: CheckInput): Record<string, number> {
  const baseline: Record<string, number> = {};

  if (input.l5 !== undefined) {
    baseline[`l5:${input.l5.id}`] = input.l5.revision.rev;
  }

  for (const l4 of input.l4Flows) {
    baseline[`l4:${l4.id}`] = l4.revision.rev;
  }

  for (const l3 of input.l3Blocks) {
    baseline[`l3:${l3.id}`] = l3.revision.rev;
  }

  for (const l2 of input.l2Blocks) {
    baseline[`l2:${l2.id}`] = l2.revision.rev;
  }

  return baseline;
}

/** Compute diff between baseline revs and current revs */
export function computeDiff(
  baseline: Record<string, number>,
  current: Record<string, number>,
): ChangesetDiff {
  const created: ChangesetDiff["created"] = [];
  const modified: ChangesetDiff["modified"] = [];
  const unchanged: ChangesetDiff["unchanged"] = [];

  // Check current artifacts against baseline
  for (const [key, currentRev] of Object.entries(current)) {
    const [layer, id] = splitKey(key);

    if (!(key in baseline)) {
      created.push({ layer, id, currentRev });
    } else if (currentRev > baseline[key]) {
      modified.push({ layer, id, fromRev: baseline[key], toRev: currentRev });
    } else {
      unchanged.push({ layer, id, rev: currentRev });
    }
  }

  // Baseline artifacts still present in current are already handled above.
  // Baseline artifacts NOT in current would be "deleted", but we don't track that.
  // (Deletion is rare in SVP and is git's domain.)

  return { created, modified, unchanged };
}

/** Format a diff summary for human-readable output */
export function formatDiffSummary(diff: ChangesetDiff): string {
  const lines: string[] = [];

  if (diff.created.length > 0) {
    lines.push(`Created (${String(diff.created.length)}):`);
    for (const c of diff.created) {
      lines.push(`  + ${c.layer}/${c.id} (rev ${String(c.currentRev)})`);
    }
  }

  if (diff.modified.length > 0) {
    lines.push(`Modified (${String(diff.modified.length)}):`);
    for (const m of diff.modified) {
      lines.push(`  ~ ${m.layer}/${m.id} (rev ${String(m.fromRev)} → ${String(m.toRev)})`);
    }
  }

  if (diff.unchanged.length > 0) {
    lines.push(`Unchanged (${String(diff.unchanged.length)}):`);
    for (const u of diff.unchanged) {
      lines.push(`  . ${u.layer}/${u.id} (rev ${String(u.rev)})`);
    }
  }

  if (lines.length === 0) {
    lines.push("No artifacts in scope.");
  }

  return lines.join("\n");
}

/** Split a baseline key like "l3:validate-order" into [layer, id] */
function splitKey(key: string): [string, string] {
  const idx = key.indexOf(":");
  if (idx === -1) return ["unknown", key];
  return [key.slice(0, idx), key.slice(idx + 1)];
}
