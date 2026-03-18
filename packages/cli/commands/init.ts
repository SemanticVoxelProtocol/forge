// forge init — 初始化 .svp/ 目录结构的 CLI 命令

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { t } from "../../core/i18n.js";
import { init } from "../../core/init.js";
import { getAdapter, getAllAdapterIds, detectHosts } from "../../skills/adapters/index.js";
import { SKILL_FILE_VERSION, extractSkillVersion } from "../../skills/adapters/shared.js";
import type { HostId, HostAdapter } from "../../skills/adapters/index.js";
import type { Command } from "commander";

const VALID_HOSTS = getAllAdapterIds();

function isValidHost(host: string): host is HostId {
  return (VALID_HOSTS as readonly string[]).includes(host);
}

/** Host-specific slash command for post-init guidance */
const HOST_COMMANDS: Partial<Record<HostId, string>> = {
  "kimi-code": "/skill:svp",
};
const DEFAULT_COMMAND = "/forge";

function getHostCommand(hostId?: HostId): string {
  if (hostId !== undefined && hostId in HOST_COMMANDS) {
    return HOST_COMMANDS[hostId]!;
  }
  return DEFAULT_COMMAND;
}

/** 注册 forge init 子命令 */
export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Initialize .svp/ directory with a starter L5 blueprint")
    .argument("[name]", "Project name (defaults to directory name)")
    .option("-n, --name <name>", "Project name (alias for positional argument)")
    .option("-v, --version <version>", "Initial version", "0.1.0")
    .option("-i, --intent <intent>", "Project intent (what it does)")
    .option(`--host <host>`, `Host CLI integration (${VALID_HOSTS.join(" | ")} | all)`)
    .option("-r, --root <path>", "Project root directory", ".")
    .option("-l, --language <lang>", "Language preference (ISO 639-1, e.g., en, zh)")
    .option("-y, --yes", "Accept defaults, skip all prompts")
    .action(
      async (
        positionalName: string | undefined,
        options: {
          name?: string;
          version: string;
          intent?: string;
          host?: string;
          root: string;
          language?: string;
          yes?: boolean;
        },
      ) => {
        const lang = options.language ?? "en";
        const resolvedRoot = path.resolve(options.root);

        // Show welcome banner in interactive mode
        if (process.stdin.isTTY && options.yes !== true) {
          const { printBanner } = await import("../banner.js");
          await printBanner(SKILL_FILE_VERSION);
        }

        // Resolve project name: positional > --name flag > directory basename
        const projectName = positionalName ?? options.name ?? path.basename(resolvedRoot);

        // Resolve intent: flag or TTY prompt
        let intent = options.intent;
        if (intent === undefined && process.stdin.isTTY && options.yes !== true) {
          const { input } = await import("@inquirer/prompts");
          const answer = await input({
            message: t(lang, "cli.init.promptIntent"),
          });
          if (answer.trim().length > 0) {
            intent = answer.trim();
          }
        }

        // Resolve host: explicit flag > interactive > auto-detect
        let hostIds: HostId[] = [];
        const hostAll = options.host?.toLowerCase() === "all";

        if (hostAll) {
          // --host all: use detected hosts, or fall back to all registered adapters
          const detected = await detectHosts(options.root);
          hostIds = detected.length > 0 ? detected : [...VALID_HOSTS];
        } else if (options.host === undefined) {
          // Auto-detect from project directory markers
          const detected = await detectHosts(options.root);
          if (detected.length === 1) {
            hostIds = detected;
          } else if (detected.length > 1) {
            if (process.stdin.isTTY && options.yes !== true) {
              const { select } = await import("@inquirer/prompts");
              const choices: Array<{ name: string; value: string }> = [
                ...detected.map((h) => ({ name: getAdapter(h).displayName, value: h })),
                { name: t(lang, "cli.init.promptHostAll"), value: "__all__" },
                { name: t(lang, "cli.init.promptHostSkip"), value: "__skip__" },
              ];
              const answer = await select({
                message: t(lang, "cli.init.promptHostSelect"),
                choices,
              });
              if (answer === "__all__") {
                hostIds = detected;
              } else if (answer !== "__skip__") {
                hostIds = [answer as HostId];
              }
            } else {
              console.log(
                `Multiple hosts detected: ${detected.join(", ")}. Use --host to specify one.`,
              );
            }
          }
        } else {
          // Explicit single host
          if (isValidHost(options.host)) {
            hostIds = [options.host];
          } else {
            console.error(`Unknown host: ${options.host}. Valid hosts: ${VALID_HOSTS.join(", ")}`);
            process.exitCode = 1;
            return;
          }
        }

        const result = await init(options.root, {
          name: projectName,
          version: options.version,
          intent,
          host: hostIds[0],
          language: options.language,
        });

        if (!result.created) {
          console.log(t(lang, "cli.init.alreadyExists"));
          // Still generate host files if resolved
          for (const hid of hostIds) {
            await generateHostFiles(options.root, getAdapter(hid), projectName, lang);
          }
          return;
        }

        console.log(t(lang, "cli.init.initialized", { root: options.root }));
        console.log();
        const l5 = result.l5!;
        console.log(`  L5: ${l5.name} v${l5.version}`);
        if (l5.intent.length > 0) {
          console.log(`  intent: ${l5.intent}`);
        }
        console.log();
        console.log(t(lang, "cli.init.dirStructure"));
        console.log("  .svp/");
        console.log("  ├── l5.json        (blueprint)");
        console.log("  ├── l4/            (logic chains)");
        console.log("  ├── l3/            (logic blocks)");
        console.log("  └── l2/            (code blocks)");

        // Host-specific integration
        if (hostIds.length === 0) {
          console.log();
          console.log(t(lang, "cli.init.nextEdit"));
        } else {
          console.log();
          for (const hid of hostIds) {
            await generateHostFiles(options.root, getAdapter(hid), projectName, lang);
          }
        }

        // Post-init guidance
        printPostInitGuide(lang, hostIds[0]);
      },
    );
}

function printPostInitGuide(lang: string, hostId?: HostId): void {
  const command = getHostCommand(hostId);
  console.log();
  console.log(t(lang, "cli.init.nextGuideHeader"));
  console.log();
  console.log(t(lang, "cli.init.nextGuideStep1"));
  console.log();
  console.log(t(lang, "cli.init.nextGuideStep2", { command }));
  console.log();
  console.log(t(lang, "cli.init.nextGuideStep3"));
}

async function generateHostFiles(
  root: string,
  adapter: HostAdapter,
  projectName: string,
  lang: string,
): Promise<void> {
  const i18nParams = {
    host: adapter.displayName,
    skillDir: adapter.skillDir(),
    contextFile: adapter.contextFilePath(),
  };

  // 1. Generate skill/command files (with extend-mode version check)
  const skillBaseDir = path.join(root, adapter.skillDir());
  const files = adapter.generateSkillFiles(lang);
  let newFileCount = 0;

  for (const file of files) {
    const filePath = path.join(skillBaseDir, file.relativePath);

    let existingContent: string | undefined;
    try {
      existingContent = await readFile(filePath, "utf8");
    } catch {
      // File doesn't exist yet
    }

    if (existingContent !== undefined) {
      const existingVersion = extractSkillVersion(existingContent);
      if (existingVersion === SKILL_FILE_VERSION) {
        console.log(
          t(lang, "cli.init.skillUpToDate", { ...i18nParams, version: SKILL_FILE_VERSION }),
        );
        continue;
      }
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, file.content, "utf8");
      if (existingVersion === null) {
        console.log(t(lang, "cli.init.skillUpdatedLegacy", i18nParams));
      } else {
        console.log(
          t(lang, "cli.init.skillUpdated", {
            ...i18nParams,
            oldVersion: existingVersion,
            newVersion: SKILL_FILE_VERSION,
          }),
        );
      }
      continue;
    }

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, file.content, "utf8");
    newFileCount++;
  }

  if (newFileCount > 0) {
    console.log(
      t(lang, "cli.init.slashCommands", { count: String(newFileCount), ...i18nParams }),
    );
  }

  // 2. Append SVP section to context file
  const contextPath = path.join(root, adapter.contextFilePath());
  const svpSection = adapter.generateContextSection(projectName, lang);

  let existing = "";
  try {
    existing = await readFile(contextPath, "utf8");
  } catch {
    // File doesn't exist yet — ensure parent directory exists
    await mkdir(path.dirname(contextPath), { recursive: true });
  }

  if (existing.includes(adapter.contextMarker())) {
    console.log(t(lang, "cli.init.claudeMdSkipped", i18nParams));
  } else {
    const separator = existing.length > 0 ? "\n\n" : "";
    await writeFile(contextPath, existing + separator + svpSection + "\n", "utf8");
    console.log(t(lang, "cli.init.claudeMdSection", i18nParams));
  }
}
