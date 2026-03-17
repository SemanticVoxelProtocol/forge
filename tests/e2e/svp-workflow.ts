#!/usr/bin/env tsx
// svp-workflow.ts — E2E test: full SVP design→implement workflow via Claude Code CLI
//
// Runs the complete SVP pipeline on a throwaway project:
//   Phase 1: Setup      → svp init
//   Phase 2: Design L5  → svp prompt design-l5 → claude -p → verify l5.json
//   Phase 3: Design L4  → svp prompt design-l4 → claude -p → verify l4/*.json
//   Phase 4: Design L3  → svp prompt design-l3 (per step) → claude -p → verify l3/*.json
//   Phase 5: Check      → svp check → cross-layer consistency
//   Phase 6: Compile    → svp prompt compile (per l3) → claude -p → verify l2/*.json + sources
//   Phase 7: Report     → markdown summary
//
// Usage:
//   npx tsx tests/e2e/svp-workflow.ts                  # full run
//   npx tsx tests/e2e/svp-workflow.ts --dry-run        # SVP CLI only, skip Claude calls
//   npx tsx tests/e2e/svp-workflow.ts --all-sonnet     # use sonnet for all steps
//   npx tsx tests/e2e/svp-workflow.ts --budget 2.0     # total budget cap

import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  type ClaudeResult,
  type PhaseResult,
  type StepResult,
  buildReport,
  buildSkippedPhase,
  fmtMs,
  getFlagVal,
  hasFlag,
  listJsonFiles,
  mapModel,
  parseComplexity,
  readJson,
  renderReport,
  runClaude,
  runSvp,
  timer,
} from "./helpers.js";

// ── Types ──

interface CLIOptions {
  dryRun: boolean;
  allSonnet: boolean;
  budgetUsd: number;
  stepBudgetUsd: number;
}

// ── Constants ──

const PROJECT_INTENT = "A simple string transformer tool that validates input, transforms text (reverse, uppercase, etc.), and formats the output with metadata.";
const L4_INTENT = "A pipeline: validate-input → transform-text → format-output";

// ── CLI arg parsing ──

function parseArgs(): CLIOptions {
  return {
    dryRun: hasFlag("--dry-run"),
    allSonnet: hasFlag("--all-sonnet"),
    budgetUsd: Number.parseFloat(getFlagVal("--budget", "5.0")),
    stepBudgetUsd: Number.parseFloat(getFlagVal("--step-budget", "0.50")),
  };
}

// ── Phase implementations ──

function phase1_setup(opts: CLIOptions): PhaseResult {
  const elapsed = timer();
  const steps: StepResult[] = [];

  // Create temp directory
  const projectDir = mkdtempSync(path.join(tmpdir(), "svp-e2e-"));
  const stepTimer = timer();

  // Run svp init
  const initResult = runSvp(
    `init -n string-transformer -r "${projectDir}" -i "${PROJECT_INTENT}"`,
    projectDir,
  );

  const details: string[] = [`Temp directory: ${projectDir}`];
  const errors: string[] = [];

  if (!initResult.ok) {
    errors.push(`svp init failed: ${initResult.stderr}`);
  } else {
    details.push("svp init completed");
  }

  // Verify directory structure
  const svpDir = path.join(projectDir, ".svp");
  const expected = ["l5.json", "l4", "l3", "l2"];
  for (const entry of expected) {
    const p = path.join(svpDir, entry);
    if (existsSync(p)) {
      details.push(`  .svp/${entry} exists`);
    } else {
      errors.push(`  .svp/${entry} MISSING`);
    }
  }

  steps.push({
    name: "svp init + verify structure",
    ok: initResult.ok && errors.length === 0,
    durationMs: stepTimer(),
    details,
    errors,
  });

  const ok = steps.every((s) => s.ok);
  return {
    phase: 1,
    name: "Setup",
    ok,
    durationMs: elapsed(),
    steps,
    // Stash projectDir on the result for downstream phases
    ...({ _projectDir: projectDir } as any),
  };
}

function phase2_designL5(projectDir: string, opts: CLIOptions): PhaseResult {
  const elapsed = timer();
  const steps: StepResult[] = [];

  // Generate L5 design prompt
  const stepTimer = timer();
  const promptResult = runSvp(
    `prompt design-l5 --intent "${PROJECT_INTENT}" -r "${projectDir}"`,
    projectDir,
  );

  if (!promptResult.ok) {
    steps.push({
      name: "svp prompt design-l5",
      ok: false,
      durationMs: stepTimer(),
      details: [],
      errors: [`Failed: ${promptResult.stderr}`],
    });
    return { phase: 2, name: "Design L5", ok: false, durationMs: elapsed(), steps };
  }

  const prompt = promptResult.stdout;
  const complexity = parseComplexity(prompt);
  const model = mapModel(complexity, opts.allSonnet);

  steps.push({
    name: "svp prompt design-l5",
    ok: true,
    durationMs: stepTimer(),
    details: [
      `Complexity: ${complexity} → model: ${model}`,
      `Prompt length: ${String(prompt.length)} chars`,
    ],
    errors: [],
  });

  // Call Claude to execute the design
  const claudeTimer = timer();
  const claudeResult = runClaude(prompt, model, projectDir, opts.stepBudgetUsd, opts);

  const claudeDetails: string[] = [];
  const claudeErrors: string[] = [];

  if (!claudeResult.ok) {
    claudeErrors.push(`Claude call failed: ${claudeResult.error ?? "unknown"}`);
  } else {
    claudeDetails.push(`Tokens: ${String(claudeResult.inputTokens)} in / ${String(claudeResult.outputTokens)} out`);
    claudeDetails.push(`Cost: $${claudeResult.costUsd.toFixed(4)}`);
  }

  steps.push({
    name: "claude design-l5",
    ok: claudeResult.ok,
    durationMs: claudeTimer(),
    claudeResult,
    details: claudeDetails,
    errors: claudeErrors,
  });

  // Verify l5.json was updated
  const verifyTimer = timer();
  const l5Path = path.join(projectDir, ".svp", "l5.json");
  const verifyDetails: string[] = [];
  const verifyErrors: string[] = [];
  let verifyOk = true;

  if (!existsSync(l5Path)) {
    verifyErrors.push("l5.json not found after design");
    verifyOk = false;
  } else {
    try {
      const l5 = readJson(l5Path);
      const requiredFields = ["id", "name", "intent"];
      for (const field of requiredFields) {
        if (l5[field] !== undefined && l5[field] !== "") {
          verifyDetails.push(`  l5.${field}: present`);
        } else {
          verifyErrors.push(`  l5.${field}: MISSING or empty`);
          verifyOk = false;
        }
      }
      // Optional but expected
      if (Array.isArray(l5.domains) && l5.domains.length > 0) {
        verifyDetails.push(`  l5.domains: ${String(l5.domains.length)} domain(s)`);
      }
      if (Array.isArray(l5.constraints) && l5.constraints.length > 0) {
        verifyDetails.push(`  l5.constraints: ${String(l5.constraints.length)} constraint(s)`);
      }
    } catch (e: any) {
      verifyErrors.push(`l5.json parse error: ${e.message}`);
      verifyOk = false;
    }
  }

  steps.push({
    name: "verify l5.json",
    ok: verifyOk,
    durationMs: verifyTimer(),
    details: verifyDetails,
    errors: verifyErrors,
  });

  const ok = steps.every((s) => s.ok);
  return { phase: 2, name: "Design L5", ok, durationMs: elapsed(), steps };
}

function phase3_designL4(projectDir: string, opts: CLIOptions): PhaseResult {
  const elapsed = timer();
  const steps: StepResult[] = [];

  // Generate L4 design prompt
  const stepTimer = timer();
  const promptResult = runSvp(
    `prompt design-l4 --intent "${L4_INTENT}" -r "${projectDir}"`,
    projectDir,
  );

  if (!promptResult.ok) {
    steps.push({
      name: "svp prompt design-l4",
      ok: false,
      durationMs: stepTimer(),
      details: [],
      errors: [`Failed: ${promptResult.stderr}`],
    });
    return { phase: 3, name: "Design L4", ok: false, durationMs: elapsed(), steps };
  }

  const prompt = promptResult.stdout;
  const complexity = parseComplexity(prompt);
  const model = mapModel(complexity, opts.allSonnet);

  steps.push({
    name: "svp prompt design-l4",
    ok: true,
    durationMs: stepTimer(),
    details: [
      `Complexity: ${complexity} → model: ${model}`,
      `Prompt length: ${String(prompt.length)} chars`,
    ],
    errors: [],
  });

  // Call Claude
  const claudeTimer = timer();
  const claudeResult = runClaude(prompt, model, projectDir, opts.stepBudgetUsd, opts);

  const claudeDetails: string[] = [];
  const claudeErrors: string[] = [];
  if (!claudeResult.ok) {
    claudeErrors.push(`Claude call failed: ${claudeResult.error ?? "unknown"}`);
  } else {
    claudeDetails.push(`Tokens: ${String(claudeResult.inputTokens)} in / ${String(claudeResult.outputTokens)} out`);
    claudeDetails.push(`Cost: $${claudeResult.costUsd.toFixed(4)}`);
  }

  steps.push({
    name: "claude design-l4",
    ok: claudeResult.ok,
    durationMs: claudeTimer(),
    claudeResult,
    details: claudeDetails,
    errors: claudeErrors,
  });

  // Verify L4 files
  const verifyTimer = timer();
  const l4Dir = path.join(projectDir, ".svp", "l4");
  const l4Files = listJsonFiles(l4Dir);
  const verifyDetails: string[] = [];
  const verifyErrors: string[] = [];
  let verifyOk = true;

  if (l4Files.length === 0) {
    if (opts.dryRun) {
      verifyDetails.push("No L4 flow files (expected in dry-run — Claude call was skipped)");
    } else {
      verifyErrors.push("No L4 flow files found after design");
      verifyOk = false;
    }
  } else {
    verifyDetails.push(`Found ${String(l4Files.length)} L4 file(s): ${l4Files.join(", ")}`);

    for (const file of l4Files) {
      try {
        const l4 = readJson(path.join(l4Dir, file));
        const requiredFields = ["id", "name", "steps"];
        for (const field of requiredFields) {
          if (l4[field] === undefined) {
            verifyErrors.push(`  ${file}: missing field "${field}"`);
            verifyOk = false;
          }
        }
        if (Array.isArray(l4.steps)) {
          verifyDetails.push(`  ${file}: ${String(l4.steps.length)} step(s)`);
          // Collect blockRefs for Phase 4
          const refs = l4.steps
            .map((s: any) => s.blockRef)
            .filter((r: any) => r !== undefined);
          if (refs.length > 0) {
            verifyDetails.push(`  ${file}: blockRefs → [${refs.join(", ")}]`);
          }
        }
      } catch (e: any) {
        verifyErrors.push(`  ${file}: parse error: ${e.message}`);
        verifyOk = false;
      }
    }
  }

  steps.push({
    name: "verify l4/*.json",
    ok: verifyOk,
    durationMs: verifyTimer(),
    details: verifyDetails,
    errors: verifyErrors,
  });

  const ok = steps.every((s) => s.ok);
  return { phase: 3, name: "Design L4", ok, durationMs: elapsed(), steps };
}

function phase4_designL3(projectDir: string, opts: CLIOptions): PhaseResult {
  const elapsed = timer();
  const steps: StepResult[] = [];

  // Read L4 flows to discover steps needing L3 blocks
  const l4Dir = path.join(projectDir, ".svp", "l4");
  const l4Files = listJsonFiles(l4Dir);

  if (l4Files.length === 0) {
    const isExpected = opts.dryRun;
    steps.push({
      name: "discover L4 steps",
      ok: isExpected,
      durationMs: 0,
      details: isExpected ? ["No L4 flows (expected in dry-run)"] : [],
      errors: isExpected ? [] : ["No L4 flows found — cannot design L3 blocks"],
    });
    return { phase: 4, name: "Design L3", ok: isExpected, durationMs: elapsed(), steps };
  }

  // Collect all (flowId, blockId, stepIndex?) tuples from any L4 kind
  const targets: { flowId: string; blockId: string; stepIndex?: number }[] = [];
  const seen = new Set<string>(); // deduplicate blockIds across L4 artifacts
  for (const file of l4Files) {
    const l4 = readJson(path.join(l4Dir, file));
    const kind = l4.kind ?? "flow";

    if (kind === "flow" && Array.isArray(l4.steps)) {
      for (let i = 0; i < l4.steps.length; i++) {
        const step = l4.steps[i];
        if (step.blockRef && !seen.has(step.blockRef)) {
          seen.add(step.blockRef);
          targets.push({ flowId: l4.id, blockId: step.blockRef, stepIndex: i });
        }
      }
    } else if (kind === "event-graph" && Array.isArray(l4.handlers)) {
      for (const handler of l4.handlers) {
        if (!Array.isArray(handler.steps)) continue;
        for (const step of handler.steps) {
          if (step.blockRef && !seen.has(step.blockRef)) {
            seen.add(step.blockRef);
            targets.push({ flowId: l4.id, blockId: step.blockRef });
          }
        }
      }
    } else if (kind === "state-machine" && l4.states) {
      for (const config of Object.values(l4.states) as any[]) {
        if (config.onEntry?.blockRef && !seen.has(config.onEntry.blockRef)) {
          seen.add(config.onEntry.blockRef);
          targets.push({ flowId: l4.id, blockId: config.onEntry.blockRef });
        }
        if (config.onExit?.blockRef && !seen.has(config.onExit.blockRef)) {
          seen.add(config.onExit.blockRef);
          targets.push({ flowId: l4.id, blockId: config.onExit.blockRef });
        }
      }
      if (Array.isArray(l4.transitions)) {
        for (const t of l4.transitions) {
          if (t.guard && !seen.has(t.guard)) {
            seen.add(t.guard);
            targets.push({ flowId: l4.id, blockId: t.guard });
          }
        }
      }
    }
  }

  steps.push({
    name: "discover L4 steps",
    ok: targets.length > 0,
    durationMs: 0,
    details: [`Found ${String(targets.length)} step(s) needing L3 blocks`],
    errors: targets.length === 0 ? ["No steps with blockRef found in L4 flows"] : [],
  });

  // Design each L3 block
  for (const target of targets) {
    const { flowId, blockId, stepIndex } = target;

    // Check if L3 already exists (Claude may have created it in a prior step)
    const l3Path = path.join(projectDir, ".svp", "l3", `${blockId}.json`);
    if (existsSync(l3Path)) {
      steps.push({
        name: `design-l3 ${blockId}`,
        ok: true,
        durationMs: 0,
        details: [`L3 block "${blockId}" already exists — skipping`],
        errors: [],
      });
      continue;
    }

    const stepTimer = timer();
    const intentText = `Implement the "${blockId}" step of the string transformer pipeline`;
    const stepArg = stepIndex !== undefined ? ` --step ${String(stepIndex)}` : "";
    const promptResult = runSvp(
      `prompt design-l3 ${blockId} --intent "${intentText}" --flow ${flowId}${stepArg} -r "${projectDir}"`,
      projectDir,
    );

    if (!promptResult.ok) {
      steps.push({
        name: `svp prompt design-l3 ${blockId}`,
        ok: false,
        durationMs: stepTimer(),
        details: [],
        errors: [`Failed: ${promptResult.stderr}`],
      });
      continue;
    }

    const prompt = promptResult.stdout;
    const complexity = parseComplexity(prompt);
    const model = mapModel(complexity, opts.allSonnet);

    // Call Claude
    const claudeResult = runClaude(prompt, model, projectDir, opts.stepBudgetUsd, opts);

    const details: string[] = [
      `Complexity: ${complexity} → model: ${model}`,
    ];
    const errors: string[] = [];

    if (claudeResult.ok) {
      details.push(`Tokens: ${String(claudeResult.inputTokens)} in / ${String(claudeResult.outputTokens)} out`);
    } else {
      errors.push(`Claude call failed: ${claudeResult.error ?? "unknown"}`);
    }

    // Verify L3 was created
    if (existsSync(l3Path)) {
      try {
        const l3 = readJson(l3Path);
        const requiredFields = ["id", "name", "input", "output"];
        for (const field of requiredFields) {
          if (l3[field] === undefined) {
            errors.push(`l3/${blockId}.json: missing field "${field}"`);
          }
        }
        details.push(`l3/${blockId}.json created with ${String(Object.keys(l3).length)} fields`);
      } catch (e: any) {
        errors.push(`l3/${blockId}.json parse error: ${e.message}`);
      }
    } else if (claudeResult.ok && !opts.dryRun) {
      errors.push(`l3/${blockId}.json not found after Claude call`);
    } else if (opts.dryRun) {
      details.push(`l3/${blockId}.json not created (expected in dry-run)`);
    }

    steps.push({
      name: `design-l3 ${blockId}`,
      ok: claudeResult.ok && errors.length === 0,
      durationMs: stepTimer(),
      claudeResult,
      details,
      errors,
    });
  }

  const ok = steps.every((s) => s.ok);
  return { phase: 4, name: "Design L3", ok, durationMs: elapsed(), steps };
}

function phase5_check(projectDir: string): PhaseResult {
  const elapsed = timer();
  const steps: StepResult[] = [];

  // Run rehash first to fix placeholder hashes left by Claude
  const rehashTimer = timer();
  const rehashResult = runSvp(`rehash -r "${projectDir}"`, projectDir);
  steps.push({
    name: "svp rehash",
    ok: rehashResult.ok,
    durationMs: rehashTimer(),
    details: rehashResult.ok
      ? [`Rehash completed: ${rehashResult.stdout.trim().split("\n").length} line(s) output`]
      : [],
    errors: rehashResult.ok ? [] : [`svp rehash failed: ${rehashResult.stderr}`],
  });

  const stepTimer = timer();
  const result = runSvp(`check --json -r "${projectDir}"`, projectDir);

  const details: string[] = [];
  const errors: string[] = [];
  let checkOk = result.ok;

  if (!result.ok && result.stderr) {
    errors.push(`svp check failed: ${result.stderr}`);
  }

  // Parse JSON output
  try {
    const report = JSON.parse(result.stdout);
    const issueCount = report.issues?.length ?? 0;
    const errorCount = report.summary?.errors ?? 0;
    const warnCount = report.summary?.warnings ?? 0;

    details.push(`Issues: ${String(issueCount)} (${String(errorCount)} errors, ${String(warnCount)} warnings)`);

    if (errorCount > 0) {
      checkOk = false;
      for (const issue of report.issues) {
        if (issue.severity === "error") {
          errors.push(`  [${issue.code}] ${issue.layer}/${issue.entityId}: ${issue.message}`);
        }
      }
    }

    if (warnCount > 0) {
      for (const issue of report.issues) {
        if (issue.severity === "warning") {
          details.push(`  WARN [${issue.code}] ${issue.layer}/${issue.entityId}: ${issue.message}`);
        }
      }
    }
  } catch {
    // Not JSON — use raw stdout
    details.push(`Raw output: ${result.stdout.slice(0, 500)}`);
  }

  steps.push({
    name: "svp check --json",
    ok: checkOk,
    durationMs: stepTimer(),
    details,
    errors,
  });

  return { phase: 5, name: "Check", ok: checkOk, durationMs: elapsed(), steps };
}

function phase6_compile(projectDir: string, opts: CLIOptions): PhaseResult {
  const elapsed = timer();
  const steps: StepResult[] = [];

  // Find all L3 blocks to compile
  const l3Dir = path.join(projectDir, ".svp", "l3");
  const l3Files = listJsonFiles(l3Dir);

  if (l3Files.length === 0) {
    const isExpected = opts.dryRun;
    steps.push({
      name: "discover L3 blocks",
      ok: isExpected,
      durationMs: 0,
      details: isExpected ? ["No L3 blocks (expected in dry-run)"] : [],
      errors: isExpected ? [] : ["No L3 blocks found — nothing to compile"],
    });
    return { phase: 6, name: "Compile", ok: isExpected, durationMs: elapsed(), steps };
  }

  steps.push({
    name: "discover L3 blocks",
    ok: true,
    durationMs: 0,
    details: [`Found ${String(l3Files.length)} L3 block(s) to compile: ${l3Files.map((f) => f.replace(".json", "")).join(", ")}`],
    errors: [],
  });

  for (const file of l3Files) {
    const blockId = file.replace(".json", "");
    const stepTimer = timer();

    // Generate compile prompt
    const promptResult = runSvp(
      `prompt compile ${blockId} -r "${projectDir}"`,
      projectDir,
    );

    if (!promptResult.ok) {
      steps.push({
        name: `compile ${blockId}`,
        ok: false,
        durationMs: stepTimer(),
        details: [],
        errors: [`svp prompt compile failed: ${promptResult.stderr}`],
      });
      continue;
    }

    const prompt = promptResult.stdout;
    const complexity = parseComplexity(prompt);
    const model = mapModel(complexity, opts.allSonnet);

    // Call Claude to compile
    const claudeResult = runClaude(prompt, model, projectDir, opts.stepBudgetUsd, opts);

    const details: string[] = [`Complexity: ${complexity} → model: ${model}`];
    const errors: string[] = [];

    if (claudeResult.ok) {
      details.push(`Tokens: ${String(claudeResult.inputTokens)} in / ${String(claudeResult.outputTokens)} out`);
    } else {
      errors.push(`Claude call failed: ${claudeResult.error ?? "unknown"}`);
    }

    // Verify L2 was created
    const l2Dir = path.join(projectDir, ".svp", "l2");
    const l2Files = listJsonFiles(l2Dir);
    const l2ForBlock = l2Files.filter((f) => {
      try {
        const l2 = readJson(path.join(l2Dir, f));
        return l2.blockRef === blockId;
      } catch {
        return false;
      }
    });

    if (l2ForBlock.length > 0) {
      details.push(`L2 code block(s): ${l2ForBlock.join(", ")}`);
    } else if (!opts.dryRun && claudeResult.ok) {
      details.push("No L2 code block found (Claude may have created source files directly)");
    }

    steps.push({
      name: `compile ${blockId}`,
      ok: claudeResult.ok,
      durationMs: stepTimer(),
      claudeResult,
      details,
      errors,
    });
  }

  const ok = steps.every((s) => s.ok);
  return { phase: 6, name: "Compile", ok, durationMs: elapsed(), steps };
}

// ── Main ──

async function main(): Promise<void> {
  const opts = parseArgs();

  console.log("=== SVP E2E Workflow Test ===");
  console.log(`Mode: ${opts.dryRun ? "DRY RUN" : "FULL RUN"}`);
  if (opts.allSonnet) console.log("Model override: all-sonnet");
  console.log(`Budget: $${opts.budgetUsd.toFixed(2)} total, $${opts.stepBudgetUsd.toFixed(2)}/step`);
  console.log();

  const phases: PhaseResult[] = [];
  let projectDir = "";
  let totalCost = 0;

  // Phase 1: Setup
  console.log("Phase 1: Setup...");
  const p1 = phase1_setup(opts);
  projectDir = (p1 as any)._projectDir;
  phases.push(p1);
  console.log(`  ${p1.ok ? "PASS" : "FAIL"} (${fmtMs(p1.durationMs)})`);

  if (!p1.ok) {
    console.error("Phase 1 failed — cannot continue.");
    process.exitCode = 1;
    return;
  }

  console.log(`  Project: ${projectDir}`);

  // Phase 2: Design L5
  console.log("Phase 2: Design L5...");
  const p2 = phase2_designL5(projectDir, opts);
  phases.push(p2);
  totalCost += p2.steps.reduce((s, st) => s + (st.claudeResult?.costUsd ?? 0), 0);
  console.log(`  ${p2.ok ? "PASS" : "FAIL"} (${fmtMs(p2.durationMs)})`);

  if (!p2.ok && !opts.dryRun) {
    console.error("Phase 2 failed — L5 design required for subsequent phases.");
    phases.push(buildSkippedPhase(3, "Design L4"), buildSkippedPhase(4, "Design L3"), buildSkippedPhase(5, "Check"), buildSkippedPhase(6, "Compile"));
    writeReport(phases, projectDir, opts);
    process.exitCode = 1;
    return;
  }

  // Phase 3: Design L4
  console.log("Phase 3: Design L4...");
  const p3 = phase3_designL4(projectDir, opts);
  phases.push(p3);
  totalCost += p3.steps.reduce((s, st) => s + (st.claudeResult?.costUsd ?? 0), 0);
  console.log(`  ${p3.ok ? "PASS" : "FAIL"} (${fmtMs(p3.durationMs)})`);

  if (!p3.ok && !opts.dryRun) {
    console.error("Phase 3 failed — L4 flows required for L3 design.");
    phases.push(buildSkippedPhase(4, "Design L3"), buildSkippedPhase(5, "Check"), buildSkippedPhase(6, "Compile"));
    writeReport(phases, projectDir, opts);
    process.exitCode = 1;
    return;
  }

  // Budget check
  if (totalCost >= opts.budgetUsd) {
    console.error(`Budget exceeded ($${totalCost.toFixed(2)} >= $${opts.budgetUsd.toFixed(2)}). Stopping.`);
    phases.push(buildSkippedPhase(4, "Design L3"), buildSkippedPhase(5, "Check"), buildSkippedPhase(6, "Compile"));
    writeReport(phases, projectDir, opts);
    process.exitCode = 1;
    return;
  }

  // Phase 4: Design L3
  console.log("Phase 4: Design L3...");
  const p4 = phase4_designL3(projectDir, opts);
  phases.push(p4);
  totalCost += p4.steps.reduce((s, st) => s + (st.claudeResult?.costUsd ?? 0), 0);
  console.log(`  ${p4.ok ? "PASS" : "FAIL"} (${fmtMs(p4.durationMs)})`);

  // Phase 5: Check (run even if previous phases had issues)
  console.log("Phase 5: Check...");
  const p5 = phase5_check(projectDir);
  phases.push(p5);
  console.log(`  ${p5.ok ? "PASS" : "FAIL"} (${fmtMs(p5.durationMs)})`);

  // Budget check before compile
  if (totalCost >= opts.budgetUsd) {
    console.error(`Budget exceeded ($${totalCost.toFixed(2)}). Skipping compile phase.`);
    phases.push(buildSkippedPhase(6, "Compile"));
    writeReport(phases, projectDir, opts);
    process.exitCode = 1;
    return;
  }

  // Phase 6: Compile
  console.log("Phase 6: Compile...");
  const p6 = phase6_compile(projectDir, opts);
  phases.push(p6);
  totalCost += p6.steps.reduce((s, st) => s + (st.claudeResult?.costUsd ?? 0), 0);
  console.log(`  ${p6.ok ? "PASS" : "FAIL"} (${fmtMs(p6.durationMs)})`);

  // Phase 7: Report
  writeReport(phases, projectDir, opts);

  // Final status
  const allPassed = phases.every((p) => p.ok);
  console.log();
  console.log(`=== ${allPassed ? "ALL PASSED" : "SOME FAILURES"} ===`);
  console.log(`Total cost: $${totalCost.toFixed(4)}`);

  if (!allPassed) process.exitCode = 1;
}

function writeReport(phases: PhaseResult[], projectDir: string, opts: CLIOptions): void {
  const report = buildReport(phases, projectDir, opts.dryRun);
  const markdown = renderReport(report);

  // Write to tests/e2e/
  const reportDir = path.resolve(import.meta.dirname);
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = path.join(reportDir, `report-${ts}.md`);
  writeFileSync(reportPath, markdown, "utf8");
  console.log(`\nReport: ${reportPath}`);

  // Also write JSON report
  const jsonPath = path.join(reportDir, `report-${ts}.json`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exitCode = 1;
});
