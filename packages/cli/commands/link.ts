// forge link — 创建 L2CodeBlock（L3 和 L1 之间的桥接层）
// AI 生成 L1 源代码后运行，创建/更新 L2 映射

import {
  checkCompatibility,
  deleteFileManifest,
  deleteFunctionManifest,
  readFileManifest,
  readFunctionManifest,
  readL2,
  readL3,
  writeFileManifest,
  writeFunctionManifest,
  writeL2,
} from "../../core/index.js";
import {
  createGovernedLink,
  governedFileManifestId,
  governedFunctionManifestId,
} from "../../skills/link.js";
import type { GovernedExportSelection } from "../../skills/link.js";
import type { Command } from "commander";

/** 注册 forge link 子命令 */
export function registerLink(program: Command): void {
  program
    .command("link")
    .description("Create or update L2 code block linking L3 contract to L1 source files")
    .argument("<l3-id>", "L3 block ID to link")
    .requiredOption("--files <paths...>", "L1 source file paths")
    .option(
      "--exports <file=export1,export2>",
      "Govern selected exported functions for one linked file (repeatable)",
      collectRepeatedOption,
      [],
    )
    .option("--language <lang>", "Programming language", "typescript")
    .option("-r, --root <path>", "Project root directory", ".")
    .option("--json", "Output as JSON")
    .action(
      async (
        l3Id: string,
        options: {
          files: string[];
          exports: string[];
          language: string;
          root: string;
          json: boolean;
        },
      ) => {
        const root = options.root;
        const governedExports = parseExportsOption(options.exports, options.files);
        if (governedExports === null) {
          process.exitCode = 1;
          return;
        }

        // Ensure schema compatibility
        await checkCompatibility(root);

        // 读取 L3 contract
        const l3 = await readL3(root, l3Id);
        if (l3 === null) {
          console.error(`L3 block "${l3Id}" not found in .svp/l3/`);
          process.exitCode = 1;
          return;
        }

        // 检查是否已有 L2（relink vs create）
        const existingL2 = await readL2(root, l3Id);

        const knownFiles = new Set([...(existingL2?.files ?? []), ...options.files]);

        const existingFileManifests = await Promise.all(
          [...knownFiles].map(async (filePath) =>
            readFileManifest(root, governedFileManifestId(filePath)),
          ),
        );
        const persistedExports = existingFileManifests.flatMap((manifest) =>
          manifest === null
            ? []
            : manifest.exports.map((exportName) => ({ file: manifest.path, exportName })),
        );
        const functionSelections = dedupeSelections([...persistedExports, ...governedExports]);
        const existingFunctionManifests = await Promise.all(
          functionSelections.map(async (selection) =>
            readFunctionManifest(
              root,
              governedFunctionManifestId(
                governedFileManifestId(selection.file),
                selection.exportName,
              ),
            ),
          ),
        );

        const result = createGovernedLink({
          l3Block: l3,
          files: options.files,
          language: options.language,
          exportsByFile: toExportsByFile(governedExports),
          existingL2: existingL2 ?? undefined,
          existingFileManifests: existingFileManifests.filter((manifest) => manifest !== null),
          existingFunctionManifests: existingFunctionManifests.filter(
            (manifest) => manifest !== null,
          ),
        });

        await writeL2(root, result.l2);

        await Promise.all(
          result.governedFiles.map(async (manifest) => writeFileManifest(root, manifest)),
        );
        await Promise.all(
          result.governedFunctions.map(async (manifest) => writeFunctionManifest(root, manifest)),
        );

        const nextFileManifestIds = new Set(result.governedFiles.map((manifest) => manifest.id));
        const staleFileManifestIds = existingFileManifests
          .filter((manifest) => manifest !== null)
          .map((manifest) => manifest.id)
          .filter((id) => !nextFileManifestIds.has(id));

        const nextFunctionManifestIds = new Set(
          result.governedFunctions.map((manifest) => manifest.id),
        );
        const staleFunctionManifestIds = existingFunctionManifests
          .filter((manifest) => manifest !== null)
          .map((manifest) => manifest.id)
          .filter((id) => !nextFunctionManifestIds.has(id));

        await Promise.all(
          staleFunctionManifestIds.map(async (id) => deleteFunctionManifest(root, id)),
        );
        await Promise.all(staleFileManifestIds.map(async (id) => deleteFileManifest(root, id)));

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                action: result.action,
                l2: result.l2,
                fileManifests: result.governedFiles,
                functionManifests: result.governedFunctions,
                deleted: {
                  fileManifests: staleFileManifestIds,
                  functionManifests: staleFunctionManifestIds,
                },
              },
              null,
              2,
            ),
          );
          return;
        }

        const fileCount = String(options.files.length);
        console.log(
          `${result.action === "linked" ? "Linked" : "Relinked"} l3/${l3Id} -> l2/${result.l2.id} (${fileCount} file(s))`,
        );
      },
    );
}

function collectRepeatedOption(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parseExportsOption(
  values: readonly string[],
  files: readonly string[],
): GovernedExportSelection[] | null {
  const allowedFiles = new Set(files);
  const selections: GovernedExportSelection[] = [];

  for (const value of values) {
    const separator = value.indexOf("=");
    if (separator <= 0 || separator === value.length - 1) {
      console.error(`Invalid --exports "${value}". Expected format: <file=export1,export2>.`);
      return null;
    }

    const file = value.slice(0, separator);
    const exportNames = value
      .slice(separator + 1)
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0);

    if (exportNames.length === 0) {
      console.error(`Invalid --exports "${value}". Expected format: <file=export1,export2>.`);
      return null;
    }

    if (!allowedFiles.has(file)) {
      console.error(
        `Export selection "${value}" must reference one of the linked --files entries.`,
      );
      return null;
    }

    for (const exportName of exportNames) {
      if (
        !selections.some(
          (selection) => selection.file === file && selection.exportName === exportName,
        )
      ) {
        selections.push({ file, exportName });
      }
    }
  }

  return selections;
}

function toExportsByFile(
  selections: readonly GovernedExportSelection[],
): Readonly<Record<string, readonly string[]>> {
  const grouped = new Map<string, string[]>();

  for (const selection of selections) {
    const exportNames = grouped.get(selection.file) ?? [];
    if (!exportNames.includes(selection.exportName)) {
      exportNames.push(selection.exportName);
    }
    grouped.set(selection.file, exportNames);
  }

  return Object.fromEntries(grouped.entries());
}

function dedupeSelections(
  selections: readonly GovernedExportSelection[],
): GovernedExportSelection[] {
  const unique: GovernedExportSelection[] = [];

  for (const selection of selections) {
    if (
      !unique.some(
        (entry) => entry.file === selection.file && entry.exportName === selection.exportName,
      )
    ) {
      unique.push(selection);
    }
  }

  return unique;
}
