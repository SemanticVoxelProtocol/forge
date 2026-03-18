// forge init — 初始化 .svp/ 目录结构的 CLI 命令

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { t } from "../../core/i18n.js";
import { init } from "../../core/init.js";
import { getAdapter, getAllAdapterIds, detectHosts } from "../../skills/adapters/index.js";
import type { HostId, HostAdapter } from "../../skills/adapters/index.js";
import type { Command } from "commander";

const VALID_HOSTS = getAllAdapterIds();

function isValidHost(host: string): host is HostId {
  return (VALID_HOSTS as readonly string[]).includes(host);
}

/** 注册 forge init 子命令 */
export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Initialize .svp/ directory with a starter L5 blueprint")
    .requiredOption("-n, --name <name>", "Project name")
    .option("-v, --version <version>", "Initial version", "0.1.0")
    .option("-i, --intent <intent>", "Project intent (what it does)")
    .option(`--host <host>`, `Host CLI integration (${VALID_HOSTS.join(" | ")})`)
    .option("-r, --root <path>", "Project root directory", ".")
    .option("-l, --language <lang>", "Language preference (ISO 639-1, e.g., en, zh)")
    .action(
      async (options: {
        name: string;
        version: string;
        intent?: string;
        host?: string;
        root: string;
        language?: string;
      }) => {
        const lang = options.language ?? "en";

        // Resolve host: explicit flag > auto-detect
        let hostId: HostId | undefined;
        if (options.host === undefined) {
          // Auto-detect from project directory markers
          const detected = await detectHosts(options.root);
          if (detected.length === 1) {
            hostId = detected[0];
          } else if (detected.length > 1) {
            console.log(
              `Multiple hosts detected: ${detected.join(", ")}. Use --host to specify one.`,
            );
          }
        } else {
          if (!isValidHost(options.host)) {
            console.error(`Unknown host: ${options.host}. Valid hosts: ${VALID_HOSTS.join(", ")}`);
            process.exitCode = 1;
            return;
          }
          hostId = options.host;
        }

        const result = await init(options.root, {
          name: options.name,
          version: options.version,
          intent: options.intent,
          host: hostId,
          language: options.language,
        });

        if (!result.created) {
          console.log(t(lang, "cli.init.alreadyExists"));
          // Still generate host files if resolved
          if (hostId !== undefined) {
            await generateHostFiles(options.root, getAdapter(hostId), options.name, lang);
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
        if (hostId === undefined) {
          console.log();
          console.log(t(lang, "cli.init.nextEdit"));
        } else {
          console.log();
          await generateHostFiles(options.root, getAdapter(hostId), options.name, lang);
        }
      },
    );
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

  // 1. Generate skill/command files
  const skillBaseDir = path.join(root, adapter.skillDir());
  const files = adapter.generateSkillFiles(lang);

  for (const file of files) {
    const filePath = path.join(skillBaseDir, file.relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, file.content, "utf8");
  }
  console.log(t(lang, "cli.init.slashCommands", { count: String(files.length), ...i18nParams }));

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

  console.log();
  console.log(t(lang, "cli.init.nextSvp"));
}
