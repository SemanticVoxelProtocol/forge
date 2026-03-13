// svp init — 初始化 .svp/ 目录结构的 CLI 命令

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { init } from "../../core/init.js";
import { generateClaudeMdSection } from "../../skills/templates/claude-md.js";
import { generateSlashCommands } from "../../skills/templates/slash-commands.js";
import type { Command } from "commander";

/** 注册 svp init 子命令 */
export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Initialize .svp/ directory with a starter L5 blueprint")
    .requiredOption("-n, --name <name>", "Project name")
    .option("-v, --version <version>", "Initial version", "0.1.0")
    .option("-i, --intent <intent>", "Project intent (what it does)")
    .option("--host <host>", "Host CLI integration (claude-code)")
    .option("-r, --root <path>", "Project root directory", ".")
    .action(
      async (options: {
        name: string;
        version: string;
        intent?: string;
        host?: string;
        root: string;
      }) => {
        const result = await init(options.root, {
          name: options.name,
          version: options.version,
          intent: options.intent,
          host: options.host === "claude-code" ? "claude-code" : undefined,
        });

        if (!result.created) {
          console.log(
            ".svp/ directory already exists. Use `svp check` to validate or `svp view` to inspect.",
          );
          // Still generate host files if requested
          if (options.host === "claude-code") {
            await generateClaudeCodeFiles(options.root, options.name);
          }
          return;
        }

        console.log(`Initialized .svp/ in ${options.root}`);
        console.log();
        const l5 = result.l5!;
        console.log(`  L5: ${l5.name} v${l5.version}`);
        if (l5.intent.length > 0) {
          console.log(`  intent: ${l5.intent}`);
        }
        console.log();
        console.log("Directory structure:");
        console.log("  .svp/");
        console.log("  ├── l5.json        (blueprint)");
        console.log("  ├── l4/            (logic chains)");
        console.log("  ├── l3/            (logic blocks)");
        console.log("  └── l2/            (code blocks)");

        // Host-specific integration
        if (options.host === "claude-code") {
          console.log();
          await generateClaudeCodeFiles(options.root, options.name);
        } else {
          console.log();
          console.log("Next: edit .svp/l5.json to add domains, constraints, and integrations.");
        }
      },
    );
}

async function generateClaudeCodeFiles(root: string, projectName: string): Promise<void> {
  // 1. Generate slash commands to .claude/commands/
  const commandsDir = path.join(root, ".claude", "commands");
  await mkdir(commandsDir, { recursive: true });

  const commands = generateSlashCommands();
  for (const cmd of commands) {
    await writeFile(path.join(commandsDir, cmd.filename), cmd.content, "utf8");
  }
  console.log(`Claude Code: ${String(commands.length)} slash commands → .claude/commands/`);

  // 2. Append SVP section to CLAUDE.md
  const claudeMdPath = path.join(root, "CLAUDE.md");
  const svpSection = generateClaudeMdSection(projectName);

  let existing = "";
  try {
    existing = await readFile(claudeMdPath, "utf8");
  } catch {
    // File doesn't exist yet
  }

  if (existing.includes("## SVP")) {
    console.log("Claude Code: CLAUDE.md already contains SVP section (skipped)");
  } else {
    const separator = existing.length > 0 ? "\n\n" : "";
    await writeFile(claudeMdPath, existing + separator + svpSection + "\n", "utf8");
    console.log("Claude Code: SVP section → CLAUDE.md");
  }

  console.log();
  console.log("Next: use /svp-build to design and implement your system.");
}
