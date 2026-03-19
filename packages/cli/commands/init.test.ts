// forge init CLI 命令的集成测试

import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
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

describe("forge init", () => {
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
    const svpCmd = path.join(commandsDir, "svp.md");
    expect(await fileExists(svpCmd)).toBe(true);
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
    expect(stdout).toContain("skill files");

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

  // ── Multi-host adapter tests ──

  it("--host kimi-code generates skill file in .agents/skills/", async () => {
    const { exitCode } = await runInit(testRoot, ["--name", "My App", "--host", "kimi-code"]);

    expect(exitCode).toBe(0);

    const skillFile = path.join(testRoot, ".agents", "skills", "svp", "SKILL.md");
    expect(await fileExists(skillFile)).toBe(true);

    const content = await readFile(skillFile, "utf8");
    // Kimi skills have YAML frontmatter
    expect(content).toMatch(/^---\nname: svp/);
    expect(content).toContain("type: flow");
    // Should have the workflow content
    expect(content).toContain("Step 0: Diagnostic Router");
  });

  it("--host kimi-code creates AGENTS.md with SVP section", async () => {
    const { exitCode } = await runInit(testRoot, ["--name", "My App", "--host", "kimi-code"]);

    expect(exitCode).toBe(0);

    const agentsMdPath = path.join(testRoot, "AGENTS.md");
    expect(await fileExists(agentsMdPath)).toBe(true);

    const content = await readFile(agentsMdPath, "utf8");
    expect(content).toContain("## SVP");
    // Kimi uses generic model names
    expect(content).toContain("strongest model");
    // Slash command should use /skill:svp
    expect(content).toContain("/skill:svp");
  });

  it("--host codex generates skill file in .codex/skills/", async () => {
    const { exitCode } = await runInit(testRoot, ["--name", "My App", "--host", "codex"]);

    expect(exitCode).toBe(0);

    const skillFile = path.join(testRoot, ".codex", "skills", "svp", "SKILL.md");
    expect(await fileExists(skillFile)).toBe(true);

    const content = await readFile(skillFile, "utf8");
    // Codex has no YAML frontmatter
    expect(content).not.toMatch(/^---\n/);
    // Should have Codex model tiers
    expect(content).toContain("o3");
    expect(content).toContain("o4-mini");
    // Should have the workflow content
    expect(content).toContain("Step 0: Diagnostic Router");
  });

  it("--host codex creates AGENTS.md with SVP section", async () => {
    const { exitCode } = await runInit(testRoot, ["--name", "My App", "--host", "codex"]);

    expect(exitCode).toBe(0);

    const agentsMdPath = path.join(testRoot, "AGENTS.md");
    expect(await fileExists(agentsMdPath)).toBe(true);

    const content = await readFile(agentsMdPath, "utf8");
    expect(content).toContain("## SVP");
    expect(content).toContain("o3");
    expect(content).toContain("o4-mini");
  });

  it("AGENTS.md already has SVP section: does NOT duplicate (kimi-code)", async () => {
    const agentsMdPath = path.join(testRoot, "AGENTS.md");
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(agentsMdPath, "# Agents\n\n## SVP\n\nExisting.\n", "utf8"),
    );

    const { stdout, exitCode } = await runInit(testRoot, [
      "--name",
      "My App",
      "--host",
      "kimi-code",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("already contains SVP section");

    const content = await readFile(agentsMdPath, "utf8");
    const matches = content.match(/## SVP/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("unknown --host value is rejected", async () => {
    const { stderr, exitCode } = await runInit(testRoot, [
      "--name",
      "My App",
      "--host",
      "unknown-host",
    ]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Unknown host");
  });

  // ── Cursor adapter tests ──

  it("--host cursor generates skill file in .cursor/commands/", async () => {
    const { exitCode } = await runInit(testRoot, ["--name", "My App", "--host", "cursor"]);

    expect(exitCode).toBe(0);

    const skillFile = path.join(testRoot, ".cursor", "commands", "svp.md");
    expect(await fileExists(skillFile)).toBe(true);

    const content = await readFile(skillFile, "utf8");
    expect(content).toContain("Step 0: Diagnostic Router");
  });

  it("--host cursor creates .cursor/rules/svp.mdc with frontmatter", async () => {
    const { exitCode } = await runInit(testRoot, ["--name", "My App", "--host", "cursor"]);

    expect(exitCode).toBe(0);

    const mdcPath = path.join(testRoot, ".cursor", "rules", "svp.mdc");
    expect(await fileExists(mdcPath)).toBe(true);

    const content = await readFile(mdcPath, "utf8");
    expect(content).toMatch(/^---\n/);
    expect(content).toContain("alwaysApply: true");
    expect(content).toContain("globs: .svp/**");
    expect(content).toContain("## SVP");
  });

  // ── Windsurf adapter tests ──

  it("--host windsurf generates skill file in .windsurf/commands/", async () => {
    const { exitCode } = await runInit(testRoot, ["--name", "My App", "--host", "windsurf"]);

    expect(exitCode).toBe(0);

    const skillFile = path.join(testRoot, ".windsurf", "commands", "svp.md");
    expect(await fileExists(skillFile)).toBe(true);

    const content = await readFile(skillFile, "utf8");
    expect(content).toContain("Step 0: Diagnostic Router");
  });

  it("--host windsurf creates .windsurf/rules/svp.md with SVP section", async () => {
    const { exitCode } = await runInit(testRoot, ["--name", "My App", "--host", "windsurf"]);

    expect(exitCode).toBe(0);

    const rulesPath = path.join(testRoot, ".windsurf", "rules", "svp.md");
    expect(await fileExists(rulesPath)).toBe(true);

    const content = await readFile(rulesPath, "utf8");
    expect(content).toContain("## SVP");
    // Windsurf uses generic model names
    expect(content).toContain("strongest model");
  });

  // ── GitHub Copilot adapter tests ──

  it("--host github-copilot generates skill file in .github/prompts/", async () => {
    const { exitCode } = await runInit(testRoot, ["--name", "My App", "--host", "github-copilot"]);

    expect(exitCode).toBe(0);

    const skillFile = path.join(testRoot, ".github", "prompts", "svp.prompt.md");
    expect(await fileExists(skillFile)).toBe(true);

    const content = await readFile(skillFile, "utf8");
    expect(content).toContain("Step 0: Diagnostic Router");
  });

  it("--host github-copilot creates .github/copilot-instructions.md with SVP section", async () => {
    const { exitCode } = await runInit(testRoot, ["--name", "My App", "--host", "github-copilot"]);

    expect(exitCode).toBe(0);

    const instrPath = path.join(testRoot, ".github", "copilot-instructions.md");
    expect(await fileExists(instrPath)).toBe(true);

    const content = await readFile(instrPath, "utf8");
    expect(content).toContain("## SVP");
    // Uses generic model names like Windsurf
    expect(content).toContain("strongest model");
  });

  it("i18n shows correct host name for github-copilot", async () => {
    const { stdout, exitCode } = await runInit(testRoot, [
      "--name",
      "My App",
      "--host",
      "github-copilot",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("GitHub Copilot");
    expect(stdout).not.toContain("Claude Code");
  });

  // ── Auto-detection tests ──

  it("auto-detects host from .cursor/ directory when --host not provided", async () => {
    // Create .cursor marker directory
    await mkdir(path.join(testRoot, ".cursor"), { recursive: true });

    const { stdout, exitCode } = await runInit(testRoot, ["--name", "My App"]);

    expect(exitCode).toBe(0);
    // Should auto-detect and generate cursor files
    expect(stdout).toContain("Cursor");
    expect(stdout).toContain("skill files");
  });

  it("auto-detects host from .windsurf/ directory when --host not provided", async () => {
    await mkdir(path.join(testRoot, ".windsurf"), { recursive: true });

    const { stdout, exitCode } = await runInit(testRoot, ["--name", "My App"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Windsurf");
  });

  it("uses first detected host when multiple hosts found in non-interactive mode", async () => {
    await mkdir(path.join(testRoot, ".claude"), { recursive: true });
    await mkdir(path.join(testRoot, ".cursor"), { recursive: true });

    const { stdout, exitCode } = await runInit(testRoot, ["--name", "My App"]);

    expect(exitCode).toBe(0);
    // Non-interactive: uses the first detected host (claude-code)
    expect(stdout).toContain("Claude Code");
  });

  // ── Parameterized i18n tests ──

  it("i18n shows correct host name for kimi-code", async () => {
    const { stdout, exitCode } = await runInit(testRoot, [
      "--name",
      "My App",
      "--host",
      "kimi-code",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Kimi Code");
    expect(stdout).not.toContain("Claude Code");
  });

  it("i18n shows correct host name for cursor", async () => {
    const { stdout, exitCode } = await runInit(testRoot, ["--name", "My App", "--host", "cursor"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Cursor");
  });

  it("i18n shows correct context file path for each host", async () => {
    // Cursor should show .cursor/rules/svp.mdc
    const cursorResult = await runInit(testRoot, ["--name", "My App", "--host", "cursor"]);
    expect(cursorResult.stdout).toContain(".cursor/rules/svp.mdc");

    // Clean and test windsurf
    await rm(testRoot, { recursive: true, force: true });
    await mkdir(testRoot, { recursive: true });

    const windsurfResult = await runInit(testRoot, ["--name", "My App", "--host", "windsurf"]);
    expect(windsurfResult.stdout).toContain(".windsurf/rules/svp.md");
  });

  // ── Positional name argument tests ──

  it("positional name: 'forge init my-app' sets project name", async () => {
    const { exitCode } = await runInit(testRoot, ["my-app"]);

    expect(exitCode).toBe(0);

    const l5 = await readL5(testRoot);
    expect(l5?.name).toBe("my-app");
  });

  it("positional name takes precedence over --name flag", async () => {
    const { exitCode } = await runInit(testRoot, ["positional-name", "--name", "flag-name"]);

    expect(exitCode).toBe(0);

    const l5 = await readL5(testRoot);
    expect(l5?.name).toBe("positional-name");
  });

  it("falls back to directory basename when no name provided", async () => {
    const { exitCode } = await runInit(testRoot, []);

    expect(exitCode).toBe(0);

    const l5 = await readL5(testRoot);
    // Should use the basename of the temp directory
    expect(l5?.name).toBeTruthy();
    expect(l5?.name).toBe(path.basename(testRoot));
  });

  // ── --host all tests ──

  it("--host all generates files for all detected hosts", async () => {
    await mkdir(path.join(testRoot, ".claude"), { recursive: true });
    await mkdir(path.join(testRoot, ".cursor"), { recursive: true });

    const { stdout, exitCode } = await runInit(testRoot, ["my-app", "--host", "all"]);

    expect(exitCode).toBe(0);
    // Should generate for both detected hosts
    expect(stdout).toContain("Claude Code");
    expect(stdout).toContain("Cursor");
  });

  it("--host all with no detection generates for all registered adapters", async () => {
    const { stdout, exitCode } = await runInit(testRoot, ["my-app", "--host", "all"]);

    expect(exitCode).toBe(0);
    // Should generate for every adapter
    expect(stdout).toContain("Claude Code");
    expect(stdout).toContain("Cursor");
    expect(stdout).toContain("Windsurf");
    expect(stdout).toContain("Kimi Code");
  });

  // ── Post-init guidance tests ──

  it("post-init guidance is shown after successful init", async () => {
    const { stdout, exitCode } = await runInit(testRoot, ["my-app"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("What to do next:");
    expect(stdout).toContain("Edit .svp/l5.json");
    expect(stdout).toContain("/forge");
    expect(stdout).toContain("Build / Add / Change / Fix / View");
  });

  it("post-init guidance uses host-specific command for kimi-code", async () => {
    const { stdout, exitCode } = await runInit(testRoot, ["my-app", "--host", "kimi-code"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("/skill:svp");
  });

  // ── Cline adapter tests ──

  it("--host cline generates skill file in .cline/skills/", async () => {
    const { exitCode } = await runInit(testRoot, ["--name", "My App", "--host", "cline"]);

    expect(exitCode).toBe(0);

    const skillFile = path.join(testRoot, ".cline", "skills", "svp", "SKILL.md");
    expect(await fileExists(skillFile)).toBe(true);

    const content = await readFile(skillFile, "utf8");
    // Cline has no YAML frontmatter
    expect(content).not.toMatch(/^---\n/);
    expect(content).toContain("Step 0: Diagnostic Router");
    // Should have version stamp
    expect(content).toContain("<!-- svp-skill-version:");
  });

  it("--host cline creates AGENTS.md with SVP section", async () => {
    const { exitCode } = await runInit(testRoot, ["--name", "My App", "--host", "cline"]);

    expect(exitCode).toBe(0);

    const agentsMdPath = path.join(testRoot, "AGENTS.md");
    expect(await fileExists(agentsMdPath)).toBe(true);

    const content = await readFile(agentsMdPath, "utf8");
    expect(content).toContain("## SVP");
    expect(content).toContain("strongest model");
  });

  // ── Gemini CLI adapter tests ──

  it("--host gemini-cli generates skill file in .gemini/skills/", async () => {
    const { exitCode } = await runInit(testRoot, ["--name", "My App", "--host", "gemini-cli"]);

    expect(exitCode).toBe(0);

    const skillFile = path.join(testRoot, ".gemini", "skills", "svp", "SKILL.md");
    expect(await fileExists(skillFile)).toBe(true);

    const content = await readFile(skillFile, "utf8");
    // Gemini has YAML frontmatter
    expect(content).toMatch(/^---\nname: svp/);
    expect(content).toContain("Step 0: Diagnostic Router");
  });

  it("--host gemini-cli creates GEMINI.md with SVP section", async () => {
    const { exitCode } = await runInit(testRoot, ["--name", "My App", "--host", "gemini-cli"]);

    expect(exitCode).toBe(0);

    const geminiMdPath = path.join(testRoot, "GEMINI.md");
    expect(await fileExists(geminiMdPath)).toBe(true);

    const content = await readFile(geminiMdPath, "utf8");
    expect(content).toContain("## SVP");
    expect(content).toContain("strongest model");
  });

  // ── RooCode adapter tests ──

  it("--host roo-code generates skill file in .roo/skills/", async () => {
    const { exitCode } = await runInit(testRoot, ["--name", "My App", "--host", "roo-code"]);

    expect(exitCode).toBe(0);

    const skillFile = path.join(testRoot, ".roo", "skills", "svp", "SKILL.md");
    expect(await fileExists(skillFile)).toBe(true);

    const content = await readFile(skillFile, "utf8");
    // RooCode has YAML frontmatter
    expect(content).toMatch(/^---\nname: svp/);
    expect(content).toContain("Step 0: Diagnostic Router");
  });

  it("--host roo-code creates AGENTS.md with SVP section", async () => {
    const { exitCode } = await runInit(testRoot, ["--name", "My App", "--host", "roo-code"]);

    expect(exitCode).toBe(0);

    const agentsMdPath = path.join(testRoot, "AGENTS.md");
    expect(await fileExists(agentsMdPath)).toBe(true);

    const content = await readFile(agentsMdPath, "utf8");
    expect(content).toContain("## SVP");
    expect(content).toContain("strongest model");
  });

  // ── Auto-detection tests for new hosts ──

  it("auto-detects host from .cline/ directory", async () => {
    await mkdir(path.join(testRoot, ".cline"), { recursive: true });

    const { stdout, exitCode } = await runInit(testRoot, ["--name", "My App"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Cline");
    expect(stdout).toContain("skill files");
  });

  it("auto-detects host from .gemini/ directory", async () => {
    await mkdir(path.join(testRoot, ".gemini"), { recursive: true });

    const { stdout, exitCode } = await runInit(testRoot, ["--name", "My App"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Gemini CLI");
  });

  it("auto-detects host from .roo/ directory", async () => {
    await mkdir(path.join(testRoot, ".roo"), { recursive: true });

    const { stdout, exitCode } = await runInit(testRoot, ["--name", "My App"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("RooCode");
  });

  // ── --yes flag tests ──

  it("--yes skips all prompts and works like non-TTY mode", async () => {
    const { stdout, exitCode } = await runInit(testRoot, ["my-app", "--yes"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Initialized");
    // No prompts should have been fired — just basic init
  });

  it("--yes with --host works normally", async () => {
    const { stdout, exitCode } = await runInit(testRoot, [
      "my-app",
      "--host",
      "claude-code",
      "--yes",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Claude Code");
    expect(stdout).toContain("skill files");
  });

  it("-y is accepted as short form of --yes", async () => {
    const { exitCode } = await runInit(testRoot, ["my-app", "-y"]);

    expect(exitCode).toBe(0);
  });

  // ── Extend mode tests ──

  it("extend mode: re-init with same version shows 'up to date'", async () => {
    // First init
    await runInit(testRoot, ["my-app", "--host", "claude-code"]);

    // Second init — same version should show "up to date"
    const { stdout, exitCode } = await runInit(testRoot, ["my-app", "--host", "claude-code"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("up to date");
  });

  it("extend mode: legacy file without version tag gets updated", async () => {
    // First init to create directories
    await runInit(testRoot, ["my-app", "--host", "claude-code"]);

    // Overwrite the skill file with legacy content (no version tag)
    const skillFile = path.join(testRoot, ".claude", "commands", "svp.md");
    await writeFile(skillFile, "# Legacy content without version tag\n", "utf8");

    // Re-init should detect legacy and update
    const { stdout, exitCode } = await runInit(testRoot, ["my-app", "--host", "claude-code"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("updated");

    // Verify the file now has the version tag
    const content = await readFile(skillFile, "utf8");
    expect(content).toContain("<!-- svp-skill-version:");
    expect(content).toContain("Step 0: Diagnostic Router");
  });

  it("extend mode: older version gets updated with version transition message", async () => {
    // First init to create directories
    await runInit(testRoot, ["my-app", "--host", "claude-code"]);

    // Overwrite with an older version tag
    const skillFile = path.join(testRoot, ".claude", "commands", "svp.md");
    await writeFile(skillFile, "# Old content\n\n<!-- svp-skill-version: 0.0.1 -->\n", "utf8");

    // Re-init should detect older version and update
    const { stdout, exitCode } = await runInit(testRoot, ["my-app", "--host", "claude-code"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("updated");
    expect(stdout).toContain("0.0.1");

    // Verify the file has been updated
    const content = await readFile(skillFile, "utf8");
    expect(content).toContain("Step 0: Diagnostic Router");
  });
});
