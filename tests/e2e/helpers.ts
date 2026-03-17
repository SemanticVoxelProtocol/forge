// helpers.ts — Shared utilities for E2E tests
//
// Provides: CLI arg parsing, SVP/Claude runners, timer, formatters, JSON/dir helpers.

import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// ── Types ──

export interface ClaudeResult {
  ok: boolean;
  output: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  model: string;
  error?: string;
}

export interface StepResult {
  name: string;
  ok: boolean;
  durationMs: number;
  claudeResult?: ClaudeResult;
  details: string[];
  errors: string[];
}

export interface PhaseResult {
  phase: number;
  name: string;
  ok: boolean;
  durationMs: number;
  steps: StepResult[];
}

export interface TestReport {
  timestamp: string;
  projectDir: string;
  dryRun: boolean;
  phases: PhaseResult[];
  totals: {
    phases: number;
    passed: number;
    failed: number;
    durationMs: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
}

// ── Constants ──

export const SVP_CLI = path.resolve(import.meta.dirname, "../../packages/cli/index.ts");

// ── Timer / Formatters ──

export function timer(): () => number {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
}

export function fmtMs(ms: number): string {
  if (ms < 1000) return `${String(ms)}ms`;
  const s = (ms / 1000).toFixed(1);
  return `${s}s`;
}

// ── CLI arg parsing helpers ──

export function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

export function getFlagVal(flag: string, fallback: string): string {
  const args = process.argv.slice(2);
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : fallback;
}

// ── SVP CLI runner ──

export function runSvp(args: string, cwd: string): { ok: boolean; stdout: string; stderr: string } {
  const cmd = `npx tsx ${SVP_CLI} ${args}`;
  try {
    const stdout = execSync(cmd, {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { ok: true, stdout, stderr: "" };
  } catch (e: any) {
    return {
      ok: e.status === 0,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? e.message ?? "unknown error",
    };
  }
}

// ── Claude runner ──

export function runClaude(
  prompt: string,
  model: string,
  cwd: string,
  budgetUsd: number,
  opts: { dryRun: boolean },
): ClaudeResult {
  if (opts.dryRun) {
    return {
      ok: true,
      output: "[dry-run] Claude call skipped",
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: 0,
      model,
    };
  }

  const elapsed = timer();

  const promptFile = path.join(cwd, ".svp-e2e-prompt.tmp");
  writeFileSync(promptFile, prompt, "utf8");

  const parts = [
    `cat "${promptFile}" |`,
    "claude -p",
    `--model ${model}`,
    "--permission-mode bypassPermissions",
    "--output-format json",
  ];
  if (budgetUsd > 0) {
    parts.push(`--max-budget-usd ${String(budgetUsd)}`);
  }
  const cmd = parts.join(" ");

  try {
    const raw = execSync(cmd, {
      cwd,
      encoding: "utf8",
      timeout: 600_000,
      shell: "/bin/bash",
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 10 * 1024 * 1024,
    });

    const ms = elapsed();

    let parsed: any = {};
    for (const line of raw.split("\n").reverse()) {
      const trimmed = line.trim();
      if (trimmed.startsWith("{")) {
        try {
          parsed = JSON.parse(trimmed);
          break;
        } catch { /* continue */ }
      }
    }

    const usage = parsed.usage ?? {};
    const isError = parsed.is_error === true;

    return {
      ok: !isError,
      output: parsed.result ?? raw.slice(0, 2000),
      costUsd: parsed.total_cost_usd ?? 0,
      inputTokens: (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
      outputTokens: usage.output_tokens ?? 0,
      durationMs: ms,
      model,
      error: isError ? (parsed.result ?? "Claude returned is_error=true") : undefined,
    };
  } catch (e: any) {
    return {
      ok: false,
      output: "",
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: elapsed(),
      model,
      error: (e.stderr ?? e.message ?? "unknown").slice(0, 1000),
    };
  }
}

// ── Prompt helpers ──

/** Extract complexity from YAML front-matter: ---\ncomplexity: <tier>\n--- */
export function parseComplexity(prompt: string): string {
  const match = prompt.match(/^---\s*\ncomplexity:\s*(\w+)\s*\n---/);
  return match?.[1] ?? "standard";
}

export function mapModel(complexity: string, allSonnet: boolean): string {
  if (allSonnet) return "sonnet";
  switch (complexity) {
    case "heavy":
      return "opus";
    case "standard":
      return "sonnet";
    case "light":
      return "haiku";
    default:
      return "sonnet";
  }
}

// ── File/JSON helpers ──

export function readJson(filePath: string): any {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function listJsonFiles(dirPath: string): string[] {
  if (!existsSync(dirPath)) return [];
  return readdirSync(dirPath).filter((f) => f.endsWith(".json"));
}

/** Recursively copy a directory tree */
export function copyDir(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, dstPath);
    } else {
      copyFileSync(srcPath, dstPath);
    }
  }
}

// ── Report helpers ──

export function buildReport(phases: PhaseResult[], projectDir: string, dryRun: boolean): TestReport {
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let totalMs = 0;

  for (const phase of phases) {
    totalMs += phase.durationMs;
    for (const step of phase.steps) {
      if (step.claudeResult) {
        inputTokens += step.claudeResult.inputTokens;
        outputTokens += step.claudeResult.outputTokens;
        costUsd += step.claudeResult.costUsd;
      }
    }
  }

  return {
    timestamp: new Date().toISOString(),
    projectDir,
    dryRun,
    phases,
    totals: {
      phases: phases.length,
      passed: phases.filter((p) => p.ok).length,
      failed: phases.filter((p) => !p.ok).length,
      durationMs: totalMs,
      inputTokens,
      outputTokens,
      costUsd,
    },
  };
}

export function renderReport(report: TestReport): string {
  const lines: string[] = [];
  const w = (s: string) => lines.push(s);

  w("# SVP E2E Test Report");
  w(`Generated: ${report.timestamp}`);
  if (report.dryRun) w("\n> **DRY RUN** — Claude Code calls were skipped");
  w("");

  w("## Summary");
  w("");
  w("| Metric | Value |");
  w("|--------|-------|");
  w(`| Total phases | ${String(report.totals.phases)} |`);
  w(`| Passed | ${String(report.totals.passed)} |`);
  w(`| Failed | ${String(report.totals.failed)} |`);
  w(`| Total time | ${fmtMs(report.totals.durationMs)} |`);
  w(`| Input tokens | ${String(report.totals.inputTokens).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} |`);
  w(`| Output tokens | ${String(report.totals.outputTokens).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} |`);
  w(`| Total cost | $${report.totals.costUsd.toFixed(4)} |`);
  w(`| Project dir | \`${report.projectDir}\` |`);
  w("");

  w("## Phase Results");
  w("");

  for (const phase of report.phases) {
    const icon = phase.ok ? "\u2705" : "\u274C";
    w(`### Phase ${String(phase.phase)}: ${phase.name} ${icon} (${fmtMs(phase.durationMs)})`);
    w("");

    for (const step of phase.steps) {
      const stepIcon = step.ok ? "\u2705" : "\u274C";
      w(`**${step.name}** ${stepIcon} (${fmtMs(step.durationMs)})`);

      if (step.claudeResult) {
        w(`- Model: ${step.claudeResult.model}`);
        if (step.claudeResult.costUsd > 0) {
          w(`- Cost: $${step.claudeResult.costUsd.toFixed(4)}`);
        }
      }

      for (const d of step.details) {
        w(`- ${d}`);
      }
      for (const e of step.errors) {
        w(`- \u26A0\uFE0F ${e}`);
      }
      w("");
    }
  }

  return lines.join("\n");
}

export function buildSkippedPhase(phase: number, name: string): PhaseResult {
  return {
    phase,
    name,
    ok: false,
    durationMs: 0,
    steps: [{ name: "skipped", ok: false, durationMs: 0, details: ["Skipped due to earlier failure or budget"], errors: [] }],
  };
}
