#!/usr/bin/env tsx
// design-l3-all-kinds.ts — E2E test: design-l3 for all L4 kinds (flow, event-graph, state-machine)
//
// Runs `forge prompt design-l3` against an existing project, then pipes each prompt to Claude
// to actually generate L3 blocks. Verifies that valid L3 JSON is produced for every blockRef
// across all three L4 kinds.
//
// Usage:
//   npx tsx tests/e2e/design-l3-all-kinds.ts --dry-run                          # prompt generation only
//   npx tsx tests/e2e/design-l3-all-kinds.ts                                    # full run with Claude
//   npx tsx tests/e2e/design-l3-all-kinds.ts --project examples/other-project   # custom project
//   npx tsx tests/e2e/design-l3-all-kinds.ts --model haiku                      # cheaper model
//   npx tsx tests/e2e/design-l3-all-kinds.ts --budget 3.0 --step-budget 0.30    # budget caps
//   npx tsx tests/e2e/design-l3-all-kinds.ts --pick 1                           # 1 block per kind (smoke test)

import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  type PhaseResult,
  type StepResult,
  buildReport,
  copyDir,
  fmtMs,
  getFlagVal,
  hasFlag,
  listJsonFiles,
  readJson,
  renderReport,
  runClaude,
  runSvp,
  timer,
} from "./helpers.js";

// ── Types ──

interface L4BlockTarget {
  l4Id: string;
  kind: string;
  blockId: string;
  location: string;
}

interface CLIOptions {
  projectPath: string;
  dryRun: boolean;
  model: string;
  budgetUsd: number;
  stepBudgetUsd: number;
  pick: number; // 0 = all, N = pick N per kind
}

// ── CLI args ──

function parseArgs(): CLIOptions {
  const rel = getFlagVal("--project", "examples/cockatiel-resilience");
  const projectPath = path.resolve(import.meta.dirname, "../..", rel);

  return {
    projectPath,
    dryRun: hasFlag("--dry-run"),
    model: getFlagVal("--model", "sonnet"),
    budgetUsd: Number.parseFloat(getFlagVal("--budget", "0")),
    stepBudgetUsd: Number.parseFloat(getFlagVal("--step-budget", "0")),
    pick: Number.parseInt(getFlagVal("--pick", "0"), 10),
  };
}

// ── Extract all blockRef targets from all L4 kinds ──

function discoverTargets(projectPath: string): L4BlockTarget[] {
  const l4Dir = path.join(projectPath, ".svp", "l4");
  const files = listJsonFiles(l4Dir);
  const targets: L4BlockTarget[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const l4 = readJson(path.join(l4Dir, file));
    const kind: string = l4.kind ?? "flow";

    if (kind === "flow" && Array.isArray(l4.steps)) {
      for (let i = 0; i < l4.steps.length; i++) {
        const step = l4.steps[i];
        if (step.blockRef && !seen.has(step.blockRef)) {
          seen.add(step.blockRef);
          targets.push({ l4Id: l4.id, kind, blockId: step.blockRef, location: `step ${String(i)}` });
        }
      }
    } else if (kind === "event-graph" && Array.isArray(l4.handlers)) {
      for (const handler of l4.handlers) {
        if (!Array.isArray(handler.steps)) continue;
        for (let i = 0; i < handler.steps.length; i++) {
          const step = handler.steps[i];
          if (step.blockRef && !seen.has(step.blockRef)) {
            seen.add(step.blockRef);
            targets.push({ l4Id: l4.id, kind, blockId: step.blockRef, location: `handler "${handler.id}" step ${String(i)}` });
          }
        }
      }
    } else if (kind === "state-machine") {
      if (l4.states) {
        for (const [stateName, config] of Object.entries(l4.states) as [string, any][]) {
          if (config.onEntry?.blockRef && !seen.has(config.onEntry.blockRef)) {
            seen.add(config.onEntry.blockRef);
            targets.push({ l4Id: l4.id, kind, blockId: config.onEntry.blockRef, location: `state "${stateName}" onEntry` });
          }
          if (config.onExit?.blockRef && !seen.has(config.onExit.blockRef)) {
            seen.add(config.onExit.blockRef);
            targets.push({ l4Id: l4.id, kind, blockId: config.onExit.blockRef, location: `state "${stateName}" onExit` });
          }
        }
      }
      if (Array.isArray(l4.transitions)) {
        for (const t of l4.transitions) {
          if (t.guard && !seen.has(t.guard)) {
            seen.add(t.guard);
            targets.push({ l4Id: l4.id, kind, blockId: t.guard, location: `transition "${t.from}" → "${t.to}" guard` });
          }
        }
      }
    }
  }

  return targets;
}

/** Pick N targets per kind for smoke testing */
function pickPerKind(targets: L4BlockTarget[], n: number): L4BlockTarget[] {
  if (n <= 0) return targets;
  const byKind = new Map<string, L4BlockTarget[]>();
  for (const t of targets) {
    const list = byKind.get(t.kind) ?? [];
    list.push(t);
    byKind.set(t.kind, list);
  }
  const picked: L4BlockTarget[] = [];
  for (const list of byKind.values()) {
    picked.push(...list.slice(0, n));
  }
  return picked;
}

// ── Phases ──

function phase1_discover(targets: L4BlockTarget[]): PhaseResult {
  const kindCounts = new Map<string, number>();
  for (const t of targets) {
    kindCounts.set(t.kind, (kindCounts.get(t.kind) ?? 0) + 1);
  }

  const details = [`Found ${String(targets.length)} blockRefs across ${String(kindCounts.size)} L4 kind(s)`];
  for (const [kind, count] of kindCounts) {
    details.push(`  ${kind}: ${String(count)} block(s)`);
  }

  const kinds = new Set(targets.map((t) => t.kind));
  const errors: string[] = [];
  if (!kinds.has("flow") || !kinds.has("event-graph") || !kinds.has("state-machine")) {
    errors.push(`Expected all 3 L4 kinds but found: [${[...kinds].join(", ")}]`);
  }

  return {
    phase: 1,
    name: "Discover",
    ok: targets.length > 0,
    durationMs: 0,
    steps: [{ name: "discover blockRefs", ok: targets.length > 0, durationMs: 0, details, errors }],
  };
}

function phase2_designL3(
  targets: L4BlockTarget[],
  workDir: string,
  opts: CLIOptions,
): PhaseResult {
  const elapsed = timer();
  const steps: StepResult[] = [];
  let totalCost = 0;

  for (const target of targets) {
    const stepElapsed = timer();
    const intent = `Design the "${target.blockId}" block for the cockatiel resilience library`;

    // 1. Generate prompt
    const promptResult = runSvp(
      `prompt design-l3 ${target.blockId} --intent "${intent}" --flow ${target.l4Id} -r "${workDir}"`,
      workDir,
    );

    if (!promptResult.ok) {
      steps.push({
        name: `design-l3 ${target.blockId}`,
        ok: false,
        durationMs: stepElapsed(),
        details: [`kind: ${target.kind}`, `location: ${target.location}`],
        errors: [`prompt generation failed: ${promptResult.stderr.trim().split("\n")[0]}`],
      });
      console.log(`  [FAIL] ${target.blockId} — prompt generation failed`);
      continue;
    }

    const prompt = promptResult.stdout;

    // Basic sanity checks on prompt
    const promptErrors: string[] = [];
    if (!prompt.includes(target.blockId)) promptErrors.push("prompt missing blockId");
    if (!prompt.includes("L3 Contract")) promptErrors.push("prompt missing header");
    if (prompt.length < 200) promptErrors.push("prompt too short");

    if (promptErrors.length > 0) {
      steps.push({
        name: `design-l3 ${target.blockId}`,
        ok: false,
        durationMs: stepElapsed(),
        details: [`kind: ${target.kind}`, `location: ${target.location}`, `prompt: ${String(prompt.length)} chars`],
        errors: promptErrors,
      });
      console.log(`  [FAIL] ${target.blockId} — ${promptErrors.join("; ")}`);
      continue;
    }

    // 2. In dry-run, stop here
    if (opts.dryRun) {
      steps.push({
        name: `design-l3 ${target.blockId}`,
        ok: true,
        durationMs: stepElapsed(),
        details: [`kind: ${target.kind}`, `location: ${target.location}`, `prompt: ${String(prompt.length)} chars`],
        errors: [],
      });
      console.log(`  [PASS] ${target.blockId} — ${String(prompt.length)} chars (${target.kind})`);
      continue;
    }

    // 3. Budget check (0 = no limit)
    if (opts.budgetUsd > 0 && totalCost >= opts.budgetUsd) {
      steps.push({
        name: `design-l3 ${target.blockId}`,
        ok: false,
        durationMs: stepElapsed(),
        details: [`kind: ${target.kind}`],
        errors: [`budget exceeded ($${totalCost.toFixed(2)} >= $${opts.budgetUsd.toFixed(2)})`],
      });
      console.log(`  [SKIP] ${target.blockId} — budget exceeded`);
      continue;
    }

    // 4. Call Claude
    console.log(`  [....] ${target.blockId} (${target.kind}) — calling Claude...`);
    const claudeResult = runClaude(prompt, opts.model, workDir, opts.stepBudgetUsd, opts);
    totalCost += claudeResult.costUsd;

    const details: string[] = [
      `kind: ${target.kind}`,
      `location: ${target.location}`,
      `prompt: ${String(prompt.length)} chars`,
    ];
    const errors: string[] = [];

    if (!claudeResult.ok) {
      details.push(`Claude error: ${claudeResult.error ?? "unknown"}`);
    } else {
      details.push(`tokens: ${String(claudeResult.inputTokens)} in / ${String(claudeResult.outputTokens)} out`);
      details.push(`cost: $${claudeResult.costUsd.toFixed(4)}`);
    }

    // 5. Verify L3 was created (treat as pass if L3 is valid even when Claude timed out)
    const l3Path = path.join(workDir, ".svp", "l3", `${target.blockId}.json`);
    let l3Valid = false;
    if (!existsSync(l3Path)) {
      errors.push(claudeResult.ok ? "L3 file not created by Claude" : `Claude failed: ${claudeResult.error ?? "unknown"}`);
    } else {
      try {
        const l3 = readJson(l3Path);
        const required = ["id", "name", "input", "output"];
        const missing = required.filter((f) => l3[f] === undefined);
        if (missing.length > 0) {
          errors.push(`L3 missing fields: ${missing.join(", ")}`);
        } else {
          details.push(`L3 created with ${String(Object.keys(l3).length)} fields`);
          l3Valid = true;
        }
      } catch (e: any) {
        errors.push(`L3 parse error: ${e.message}`);
      }
    }

    // Pass if L3 is valid — even if Claude process timed out after writing the file
    const ok = l3Valid && errors.length === 0;
    steps.push({
      name: `design-l3 ${target.blockId}`,
      ok,
      durationMs: stepElapsed(),
      claudeResult,
      details,
      errors,
    });

    if (ok) {
      console.log(`  [PASS] ${target.blockId} — L3 created ($${claudeResult.costUsd.toFixed(4)}, ${fmtMs(claudeResult.durationMs)})`);
    } else {
      console.log(`  [FAIL] ${target.blockId} — ${errors[0] ?? "unknown"}`);
    }
  }

  const ok = steps.every((s) => s.ok);
  return { phase: 2, name: "Design L3", ok, durationMs: elapsed(), steps };
}

// ── Main ──

function main(): void {
  const opts = parseArgs();

  console.log("=== design-l3 All Kinds E2E Test ===");
  console.log(`Project: ${opts.projectPath}`);
  console.log(`Mode: ${opts.dryRun ? "DRY RUN (prompt only)" : "FULL RUN (Claude calls)"}`);
  if (!opts.dryRun) {
    console.log(`Model: ${opts.model}`);
    console.log(`Budget: $${opts.budgetUsd.toFixed(2)} total, $${opts.stepBudgetUsd.toFixed(2)}/step`);
  }
  if (opts.pick > 0) console.log(`Pick: ${String(opts.pick)} block(s) per kind`);
  console.log();

  // Discover targets
  let targets = discoverTargets(opts.projectPath);
  if (opts.pick > 0) targets = pickPerKind(targets, opts.pick);

  // Phase 1: Discover
  const p1 = phase1_discover(targets);
  for (const d of p1.steps[0].details) console.log(d);
  console.log();

  if (!p1.ok) {
    console.error("No blockRefs found — nothing to test.");
    process.exitCode = 1;
    return;
  }

  // Copy project to temp dir so Claude writes don't pollute the source
  let workDir: string;
  if (opts.dryRun) {
    workDir = opts.projectPath;
  } else {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "svp-l3-e2e-"));
    copyDir(path.join(opts.projectPath, ".svp"), path.join(tmpDir, ".svp"));
    workDir = tmpDir;
    console.log(`Working directory: ${workDir}`);
    console.log();
  }

  // Phase 2: Design L3
  const p2 = phase2_designL3(targets, workDir, opts);

  const phases: PhaseResult[] = [p1, p2];

  // ── Summary ──
  console.log();
  console.log("═".repeat(90));

  const maxBlockId = Math.max(...p2.steps.map((s) => s.name.replace("design-l3 ", "").length));

  for (const step of p2.steps) {
    const icon = step.ok ? "PASS" : "FAIL";
    const blockId = step.name.replace("design-l3 ", "");
    const kindDetail = step.details.find((d) => d.startsWith("kind:")) ?? "";
    const locDetail = step.details.find((d) => d.startsWith("location:")) ?? "";
    const blockPad = " ".repeat(Math.max(maxBlockId - blockId.length, 0));

    let summary: string;
    if (step.ok && step.claudeResult) {
      summary = `L3 OK $${step.claudeResult.costUsd.toFixed(4)}`;
    } else if (step.ok) {
      const promptDetail = step.details.find((d) => d.startsWith("prompt:")) ?? "";
      summary = promptDetail || "OK";
    } else {
      summary = step.errors[0] ?? "unknown error";
    }

    console.log(`  [${icon}] ${blockId}${blockPad}  ${kindDetail}  ${locDetail}  → ${summary}`);
  }

  console.log("═".repeat(90));
  console.log();

  // Per-kind summary
  const passed = p2.steps.filter((s) => s.ok).length;
  const failed = p2.steps.filter((s) => !s.ok).length;
  console.log(`Total: ${String(p2.steps.length)}  Passed: ${String(passed)}  Failed: ${String(failed)}`);

  for (const kind of ["flow", "event-graph", "state-machine"]) {
    const kindSteps = p2.steps.filter((s) => s.details.some((d) => d === `kind: ${kind}`));
    if (kindSteps.length === 0) continue;
    const kindPassed = kindSteps.filter((s) => s.ok).length;
    console.log(`  ${kind}: ${String(kindPassed)}/${String(kindSteps.length)} passed`);
  }

  // Write report (same format as svp-workflow.ts)
  if (!opts.dryRun) {
    const report = buildReport(phases, workDir, opts.dryRun);
    const markdown = renderReport(report);
    const reportDir = path.resolve(import.meta.dirname);
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const reportPath = path.join(reportDir, `report-l3-${ts}.md`);
    writeFileSync(reportPath, markdown, "utf8");
    const jsonPath = path.join(reportDir, `report-l3-${ts}.json`);
    writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`\nReport: ${reportPath}`);
    console.log(`Working directory: ${workDir}`);
  }

  console.log();
  if (failed > 0) {
    console.log("FAILED");
    process.exitCode = 1;
  } else {
    console.log("ALL PASSED");
  }
}

main();
