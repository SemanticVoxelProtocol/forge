// link — 创建 L2CodeBlock（L3 和 L1 之间的桥接层）
// AI 生成 L1 代码后，运行 forge link 创建 L2 与治理 manifest 映射
// 纯函数，不做 IO

import { computeHash, hashL2 } from "../core/hash.js";
import type { FileManifest } from "../core/file.js";
import type { FunctionManifest } from "../core/function.js";
import type { L2CodeBlock } from "../core/l2.js";
import type { L3Block } from "../core/l3.js";
import type { ArtifactVersion } from "../core/version.js";

export interface LinkOptions {
  readonly l3Block: L3Block;
  readonly files: readonly string[];
  readonly language?: string; // 默认 "typescript"
}

export interface GovernedExportSelection {
  readonly file: string;
  readonly exportName: string;
}

export interface GovernedFileManifestOptions {
  readonly l2Block: L2CodeBlock;
  readonly governedExports?: readonly GovernedExportSelection[];
  readonly existingFileManifests?: readonly FileManifest[];
}

export interface GovernedFunctionManifestOptions {
  readonly fileManifests: readonly FileManifest[];
  readonly existingFunctionManifests?: readonly FunctionManifest[];
}

export interface CreateGovernedLinkOptions extends LinkOptions {
  readonly exportsByFile?: Readonly<Record<string, readonly string[]>>;
  readonly existingL2?: L2CodeBlock;
  readonly existingFileManifests?: readonly FileManifest[];
  readonly existingFunctionManifests?: readonly FunctionManifest[];
}

export interface GovernedLinkResult {
  readonly action: "linked" | "relinked";
  readonly l2: L2CodeBlock;
  readonly governedFiles: readonly FileManifest[];
  readonly governedFunctions: readonly FunctionManifest[];
}

/** 从 L3 block + L1 文件路径创建 L2CodeBlock */
export function createL2Link(options: LinkOptions): L2CodeBlock {
  const base = {
    id: options.l3Block.id, // L2 id = L3 id（1:1 配对）
    blockRef: options.l3Block.id,
    language: options.language ?? "typescript",
    files: options.files,
  };

  const contentHash = hashL2(base);

  return {
    ...base,
    sourceHash: options.l3Block.contentHash, // 生成时 L3 的 hash
    contentHash,
    revision: {
      rev: 1,
      parentRev: null,
      source: { type: "ai", action: "compile" },
      timestamp: new Date().toISOString(),
    },
  };
}

/** 更新已有 L2 的文件列表（重新 link） */
export function relinkL2(
  existing: L2CodeBlock,
  l3Block: L3Block,
  files: readonly string[],
): L2CodeBlock {
  const base = {
    id: existing.id,
    blockRef: existing.blockRef,
    language: existing.language,
    files,
  };

  const contentHash = hashL2(base);

  return {
    ...base,
    sourceHash: l3Block.contentHash,
    contentHash,
    revision: {
      rev: existing.revision.rev + 1,
      parentRev: existing.revision.rev,
      source: { type: "ai", action: "recompile" },
      timestamp: new Date().toISOString(),
    },
  };
}

export function governedFileManifestId(filePath: string): string {
  const slug = filePath
    .trim()
    .replaceAll(/[^a-zA-Z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .toLowerCase();
  return `file-${slug}`;
}

export function buildGovernedFileManifests(
  options: GovernedFileManifestOptions,
): readonly FileManifest[] {
  const selectedExports = groupGovernedExports(options.governedExports ?? []);
  const existingById = new Map(
    (options.existingFileManifests ?? []).map((manifest) => [manifest.id, manifest]),
  );
  const revisionAction = aiActionForLink(options.l2Block.revision.source);

  return options.l2Block.files.map((filePath) => {
    const id = governedFileManifestId(filePath);
    const existing = existingById.get(id);
    const ownership = existing?.ownership ?? defaultOwnership(filePath);
    const explicitExports = selectedExports.get(filePath);
    const base = {
      id,
      path: filePath,
      purpose: existing?.purpose ?? `Govern ${filePath} for L2 ${options.l2Block.id}`,
      l2BlockRef: options.l2Block.id,
      blockRefs: uniqueValues([...(existing?.blockRefs ?? []), options.l2Block.blockRef]),
      exports: uniqueValues(explicitExports ?? existing?.exports ?? []),
      ownership,
      dependencyBoundary: existing?.dependencyBoundary ?? defaultDependencyBoundary(ownership),
      pluginGroups: existing?.pluginGroups ?? ["governance"],
    } satisfies Omit<FileManifest, "revision" | "contentHash">;

    const contentHash = computeHash(base as Record<string, unknown>);
    const changed = existing?.contentHash !== contentHash;

    return {
      ...base,
      revision: nextRevision(existing?.revision, revisionAction, changed),
      contentHash,
    } satisfies FileManifest;
  });
}

export function buildGovernedFunctionManifests(
  options: GovernedFunctionManifestOptions,
): readonly FunctionManifest[] {
  const existingById = new Map(
    (options.existingFunctionManifests ?? []).map((manifest) => [manifest.id, manifest]),
  );

  return options.fileManifests.flatMap((fileManifest) =>
    fileManifest.exports.map((exportName) => {
      const id = governedFunctionManifestId(fileManifest.id, exportName);
      const existing = existingById.get(id);
      const revisionAction = aiActionForLink(
        existing?.revision.source ?? fileManifest.revision.source,
      );
      const base = {
        id,
        fileRef: fileManifest.id,
        exportName,
        signature: existing?.signature ?? `${exportName}(…): unknown`,
        preconditions: existing?.preconditions ?? [],
        postconditions: existing?.postconditions ?? [],
        pluginPolicy: existing?.pluginPolicy ?? ["governance"],
      } satisfies Omit<FunctionManifest, "revision" | "contentHash">;

      const contentHash = computeHash(base as Record<string, unknown>);
      const changed = existing?.contentHash !== contentHash;

      return {
        ...base,
        revision: nextRevision(existing?.revision, revisionAction, changed),
        contentHash,
      } satisfies FunctionManifest;
    }),
  );
}

export function createGovernedLink(options: CreateGovernedLinkOptions): GovernedLinkResult {
  const l2 =
    options.existingL2 === undefined
      ? createL2Link(options)
      : relinkL2(options.existingL2, options.l3Block, options.files);

  const governedExports = flattenExportsByFile(options.exportsByFile ?? {});

  const governedFiles = buildGovernedFileManifests({
    l2Block: l2,
    governedExports,
    existingFileManifests: options.existingFileManifests,
  });

  const governedFunctions = buildGovernedFunctionManifests({
    fileManifests: governedFiles,
    existingFunctionManifests: options.existingFunctionManifests,
  });

  return {
    action: options.existingL2 === undefined ? "linked" : "relinked",
    l2,
    governedFiles,
    governedFunctions,
  };
}

export function governedFunctionManifestId(fileId: string, exportName: string): string {
  const normalizedExport = exportName
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replaceAll(/[^a-zA-Z0-9]+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .toLowerCase();
  return `${fileId}.${normalizedExport}`;
}

function aiActionForLink(source: ArtifactVersion["source"]): string {
  return source.type === "ai" ? source.action : "compile";
}

function nextRevision(
  existing: ArtifactVersion | undefined,
  action: string,
  changed: boolean,
): ArtifactVersion {
  if (existing !== undefined && !changed) {
    return existing;
  }

  return existing === undefined
    ? {
        rev: 1,
        parentRev: null,
        source: { type: "ai", action },
        timestamp: new Date().toISOString(),
      }
    : {
        rev: existing.rev + 1,
        parentRev: existing.rev,
        source: { type: "ai", action },
        timestamp: new Date().toISOString(),
      };
}

function groupGovernedExports(
  governedExports: readonly GovernedExportSelection[],
): ReadonlyMap<string, readonly string[]> {
  const grouped = new Map<string, string[]>();

  for (const selection of governedExports) {
    const exports = grouped.get(selection.file) ?? [];
    if (!exports.includes(selection.exportName)) {
      exports.push(selection.exportName);
    }
    grouped.set(selection.file, exports);
  }

  return grouped;
}

function uniqueValues(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function defaultOwnership(filePath: string): readonly string[] {
  const boundary = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/")) : ".";
  return [boundary];
}

function defaultDependencyBoundary(ownership: readonly string[]): readonly string[] {
  return ownership.map((owner) => (owner === "." ? "*" : `${owner}/*`));
}

function flattenExportsByFile(
  exportsByFile: Readonly<Record<string, readonly string[]>>,
): GovernedExportSelection[] {
  return Object.entries(exportsByFile).flatMap(([file, exportNames]) =>
    exportNames.map((exportName) => ({ file, exportName })),
  );
}
