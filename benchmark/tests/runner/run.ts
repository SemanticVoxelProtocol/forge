#!/usr/bin/env npx tsx
/**
 * SVP Benchmark Test Runner
 *
 * Data-driven E2E test runner. Reads round-XX.json files and
 * executes HTTP requests against a running server.
 *
 * Usage:
 *   npx tsx run.ts                     # run all rounds
 *   npx tsx run.ts --round 1           # run only round 1
 *   npx tsx run.ts --up-to 5           # run rounds 1-5
 *   npx tsx run.ts --base-url http://localhost:4000  # custom base URL
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { RoundTestData, TestCase, SetupStep } from "./schema.js";

// ── Config ──

const BASE_URL = process.argv.includes("--base-url")
  ? process.argv[process.argv.indexOf("--base-url") + 1]
  : "http://localhost:3000";

const ROUND_ONLY = process.argv.includes("--round")
  ? Number(process.argv[process.argv.indexOf("--round") + 1])
  : undefined;

const UP_TO = process.argv.includes("--up-to")
  ? Number(process.argv[process.argv.indexOf("--up-to") + 1])
  : undefined;

// ── Variable store ──

const vars: Record<string, string> = {};

function substitute(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => vars[name] ?? `$${name}`);
  }
  if (Array.isArray(value)) {
    return value.map(substitute);
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = substitute(v);
    }
    return result;
  }
  return value;
}

function resolveJsonPath(obj: unknown, jsonPath: string): unknown {
  const parts = jsonPath.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function captureVars(responseBody: unknown, captures: Record<string, string>): void {
  for (const [varName, jsonPath] of Object.entries(captures)) {
    const value = resolveJsonPath(responseBody, jsonPath);
    if (value !== undefined && value !== null) {
      vars[varName] = String(value);
    }
  }
}

// ── HTTP client ──

async function httpRequest(
  method: string,
  urlPath: string,
  headers?: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const url = `${BASE_URL}${substitute(urlPath) as string}`;
  const reqHeaders: Record<string, string> = { "Content-Type": "application/json" };

  if (headers) {
    for (const [k, v] of Object.entries(headers)) {
      reqHeaders[k] = substitute(v) as string;
    }
  }

  const resp = await fetch(url, {
    method,
    headers: reqHeaders,
    body: body !== undefined ? JSON.stringify(substitute(body)) : undefined,
  });

  let respBody: unknown;
  const text = await resp.text();
  try {
    respBody = JSON.parse(text);
  } catch {
    respBody = text;
  }

  return { status: resp.status, body: respBody };
}

// ── Assertion ──

function deepMatch(actual: unknown, expected: unknown, path = ""): string[] {
  const errors: string[] = [];

  if (expected === null) {
    if (actual !== null) errors.push(`${path}: expected null, got ${JSON.stringify(actual)}`);
    return errors;
  }

  if (typeof expected !== typeof actual) {
    errors.push(`${path}: type mismatch — expected ${typeof expected}, got ${typeof actual}`);
    return errors;
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      errors.push(`${path}: expected array, got ${typeof actual}`);
      return errors;
    }
    if (expected.length !== actual.length) {
      errors.push(`${path}: array length — expected ${String(expected.length)}, got ${String(actual.length)}`);
    }
    for (let i = 0; i < Math.min(expected.length, actual.length); i++) {
      errors.push(...deepMatch(actual[i], expected[i], `${path}[${String(i)}]`));
    }
    return errors;
  }

  if (typeof expected === "object" && expected !== null) {
    if (typeof actual !== "object" || actual === null) {
      errors.push(`${path}: expected object, got ${JSON.stringify(actual)}`);
      return errors;
    }
    for (const [key, val] of Object.entries(expected)) {
      errors.push(
        ...deepMatch((actual as Record<string, unknown>)[key], val, path ? `${path}.${key}` : key),
      );
    }
    return errors;
  }

  // Primitive comparison — substitute expected strings
  const substituted = substitute(expected);
  if (actual !== substituted) {
    errors.push(`${path}: expected ${JSON.stringify(substituted)}, got ${JSON.stringify(actual)}`);
  }

  return errors;
}

// ── Runner ──

interface RoundResult {
  round: number;
  description: string;
  passed: number;
  failed: number;
  skipped: number;
  errors: Array<{ test: string; errors: string[] }>;
}

async function runSetup(steps: SetupStep[]): Promise<boolean> {
  for (const step of steps) {
    const { status, body } = await httpRequest(step.method, step.path, step.headers, step.body);
    if (status >= 400) {
      console.error(`  [SETUP FAIL] ${step.name} → ${String(status)}`);
      console.error(`    Response: ${JSON.stringify(body)}`);
      return false;
    }
    if (step.capture) {
      captureVars(body, step.capture);
    }
  }
  return true;
}

async function runTest(test: TestCase): Promise<{ pass: boolean; errors: string[] }> {
  if (test.skip) {
    return { pass: true, errors: [] };
  }

  const { status, body } = await httpRequest(test.method, test.path, test.headers, test.body);

  const errors: string[] = [];

  // Check status
  if (status !== test.expected.status) {
    errors.push(`status: expected ${String(test.expected.status)}, got ${String(status)}`);
  }

  // Check body assertions
  if (test.expected.body) {
    errors.push(...deepMatch(body, test.expected.body));
  }

  // Check required fields
  if (test.expected.bodyHasFields) {
    for (const field of test.expected.bodyHasFields) {
      const val = resolveJsonPath(body, field);
      if (val === undefined || val === null) {
        errors.push(`missing field: ${field}`);
      }
    }
  }

  // Check forbidden fields
  if (test.expected.bodyNotHasFields) {
    for (const field of test.expected.bodyNotHasFields) {
      const val = resolveJsonPath(body, field);
      if (val !== undefined && val !== null) {
        errors.push(`unexpected field: ${field} = ${JSON.stringify(val)}`);
      }
    }
  }

  // Capture variables
  if (test.capture && errors.length === 0) {
    captureVars(body, test.capture);
  }

  return { pass: errors.length === 0, errors };
}

async function runRound(data: RoundTestData): Promise<RoundResult> {
  const result: RoundResult = {
    round: data.round,
    description: data.description,
    passed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  console.log(`\n══ Round ${String(data.round)}: ${data.description} ══`);

  // Setup
  if (data.setup.length > 0) {
    const ok = await runSetup(data.setup);
    if (!ok) {
      console.error("  Setup failed, skipping all tests in this round");
      result.skipped = data.tests.length;
      return result;
    }
  }

  // Tests
  for (const test of data.tests) {
    if (test.skip) {
      result.skipped++;
      console.log(`  ⊘ SKIP: ${test.name}`);
      continue;
    }

    const { pass, errors } = await runTest(test);
    if (pass) {
      result.passed++;
      console.log(`  ✓ ${test.name}`);
    } else {
      result.failed++;
      console.log(`  ✗ ${test.name}`);
      for (const err of errors) {
        console.log(`    → ${err}`);
      }
      result.errors.push({ test: test.name, errors });
    }
  }

  return result;
}

// ── Main ──

async function main(): Promise<void> {
  const dataDir = path.resolve(import.meta.dirname, "../data");
  const files = (await readdir(dataDir)).filter((f) => f.startsWith("round-") && f.endsWith(".json"));
  files.sort();

  const rounds: RoundTestData[] = [];
  for (const file of files) {
    const content = await readFile(path.join(dataDir, file), "utf-8");
    const data = JSON.parse(content) as RoundTestData;

    if (ROUND_ONLY !== undefined && data.round !== ROUND_ONLY) continue;
    if (UP_TO !== undefined && data.round > UP_TO) continue;

    rounds.push(data);
  }

  if (rounds.length === 0) {
    console.error("No test rounds found.");
    process.exit(1);
  }

  console.log(`SVP Benchmark — ${String(rounds.length)} round(s) against ${BASE_URL}`);

  const results: RoundResult[] = [];
  for (const round of rounds) {
    results.push(await runRound(round));
  }

  // Summary
  console.log("\n══════════════════════════════════════");
  console.log("SUMMARY");
  console.log("══════════════════════════════════════\n");

  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const r of results) {
    const total = r.passed + r.failed + r.skipped;
    const pct = total > 0 ? Math.round((r.passed / total) * 100) : 0;
    const status = r.failed === 0 ? "PASS" : "FAIL";
    console.log(
      `  R${String(r.round).padStart(2, "0")} ${r.description.padEnd(30)} ${String(r.passed).padStart(3)}/${String(total).padStart(3)} (${String(pct)}%) ${status}`,
    );
    totalPassed += r.passed;
    totalFailed += r.failed;
    totalSkipped += r.skipped;
  }

  const totalTests = totalPassed + totalFailed + totalSkipped;
  const totalPct = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;

  console.log(
    `\n  TOTAL: ${String(totalPassed)}/${String(totalTests)} passed (${String(totalPct)}%), ${String(totalFailed)} failed, ${String(totalSkipped)} skipped`,
  );

  if (totalFailed > 0) {
    console.log("\nFAILED TESTS:");
    for (const r of results) {
      for (const e of r.errors) {
        console.log(`  R${String(r.round)} — ${e.test}`);
        for (const err of e.errors) {
          console.log(`    → ${err}`);
        }
      }
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
