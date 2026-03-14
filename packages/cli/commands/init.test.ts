// svp init CLI 命令的集成测试

import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Command } from "commander";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readL5 } from "../../core/store.js";
import { registerInit } from "./init.js";

/** 捕获 console.log/error 并运行 init 子命令 */
async function runInit(
  testRoot: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...a: unknown[]) => logs.push(a.map(String).join(" "));
  console.error = (...a: unknown[]) => errors.push(a.map(String).join(" "));

  process.exitCode = undefined;

  const program = new Command();
  program.exitOverride();
  registerInit(program);

  try {
    await program.parseAsync(["init", ...args, "-r", testRoot], { from: "user" });
  } catch {
    // commander may throw on exitOverride
  }

  console.log = originalLog;
  console.error = originalError;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const exitCode = process.exitCode ?? 0;
  process.exitCode = undefined;

  return {
    stdout: logs.join("\n"),
    stderr: errors.join("\n"),
    exitCode,
  };
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

// ── Tests ──

describe("svp init", () => {
  let testRoot: string;

  beforeEach(async () => {
    testRoot = path.join(
      tmpdir(),
      `svp-init-test-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`,
    );
    await mkdir(testRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it("basic init: creates .svp/ directory with L5 blueprint", async () => {
    const { stdout, exitCode } = await runInit(testRoot, ["--name", "My App"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Initialized");

    const svpDir = path.join(testRoot, ".svp");
    expect(await dirExists(svpDir)).toBe(true);
    expect(await dirExists(path.join(svpDir, "l2"))).toBe(true);
    expect(await dirExists(path.join(svpDir, "l3"))).toBe(true);
    expect(await dirExists(path.join(svpDir, "l4"))).toBe(true);

    const l5 = await readL5(testRoot);
    expect(l5).not.toBeNull();
    expect(l5?.name).toBe("My App");
  });

  it("--host claude-code generates slash commands in .claude/commands/", async () => {
    const { exitCode } = await runInit(testRoot, ["--name", "My App", "--host", "claude-code"]);

    expect(exitCode).toBe(0);

    const commandsDir = path.join(testRoot, ".claude", "commands");
    expect(await dirExists(commandsDir)).toBe(true);

    // Should have at least one .md slash command file
    const svpBuild = path.join(commandsDir, "svp-build.md");
    expect(await fileExists(svpBuild)).toBe(true);
  });

  it("--host claude-code appends SVP section to CLAUDE.md", async () => {
    const { exitCode } = await runInit(testRoot, ["--name", "My App", "--host", "claude-code"]);

    expect(exitCode).toBe(0);

    const claudeMdPath = path.join(testRoot, "CLAUDE.md");
    expect(await fileExists(claudeMdPath)).toBe(true);

    const content = await readFile(claudeMdPath, "utf8");
    expect(content).toContain("## SVP");
  });

  it("CLAUDE.md already has SVP section: does NOT duplicate it", async () => {
    // Pre-create CLAUDE.md with SVP section
    const claudeMdPath = path.join(testRoot, "CLAUDE.md");
    await mkdir(path.join(testRoot, ".claude", "commands"), { recursive: true });
    const existing = "# My Project\n\n## SVP\n\nAlready here.\n";
    await rm(claudeMdPath, { force: true });
    await import("node:fs/promises").then((fs) => fs.writeFile(claudeMdPath, existing, "utf8"));

    const { stdout, exitCode } = await runInit(testRoot, [
      "--name",
      "My App",
      "--host",
      "claude-code",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("already contains SVP section");

    const content = await readFile(claudeMdPath, "utf8");
    // Count occurrences of "## SVP" — should still be exactly 1
    const matches = content.match(/## SVP/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("re-init skips creation when .svp/ already exists", async () => {
    // First init
    await runInit(testRoot, ["--name", "My App"]);
    const l5First = await readL5(testRoot);

    // Second init — should not overwrite
    const { stdout, exitCode } = await runInit(testRoot, ["--name", "Different Name"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("already exists");

    // L5 should be unchanged from first init
    const l5Second = await readL5(testRoot);
    expect(l5Second?.name).toBe(l5First?.name);
  });

  it("re-init still generates host files when --host provided", async () => {
    // First init without --host
    await runInit(testRoot, ["--name", "My App"]);

    // Second init with --host claude-code
    const { stdout, exitCode } = await runInit(testRoot, [
      "--name",
      "My App",
      "--host",
      "claude-code",
    ]);

    expect(exitCode).toBe(0);
    // Still generates the claude code files even on re-init
    expect(stdout).toContain("slash commands");

    const commandsDir = path.join(testRoot, ".claude", "commands");
    expect(await dirExists(commandsDir)).toBe(true);
  });

  it("custom version and intent flags are applied to L5", async () => {
    const { exitCode } = await runInit(testRoot, [
      "--name",
      "My App",
      "--version",
      "1.2.3",
      "--intent",
      "A custom intent for testing",
    ]);

    expect(exitCode).toBe(0);

    const l5 = await readL5(testRoot);
    expect(l5?.version).toBe("1.2.3");
    expect(l5?.intent).toBe("A custom intent for testing");
  });

  it("name slugification: 'My Cool App' becomes id 'my-cool-app'", async () => {
    const { exitCode } = await runInit(testRoot, ["--name", "My Cool App"]);

    expect(exitCode).toBe(0);

    const l5 = await readL5(testRoot);
    expect(l5?.id).toBe("my-cool-app");
    expect(l5?.name).toBe("My Cool App");
  });
});
