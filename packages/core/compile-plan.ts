// forge compile-plan — 变更检测 + 重编译任务生成
// 基于 check 的漂移检测，生成结构化的任务清单给 AI subagent
// 纯函数，不做 IO

import { check } from "./check.js";
import { t } from "./i18n.js";
import { extractBlockRefs } from "./l4.js";
import type { CheckInput, CheckReport } from "./check.js";
import type { FileManifest } from "./file.js";
import type { FunctionManifest } from "./function.js";
import type { L2CodeBlock } from "./l2.js";
import type { L3Block } from "./l3.js";

// ── 任务类型 ──

export type TaskAction = "compile" | "recompile" | "update-ref" | "review";

export type Complexity = "heavy" | "standard" | "light";

export interface CompileTask {
  readonly action: TaskAction;
  readonly targetLayer: "l2" | "l3" | "l4" | "file" | "fn";
  readonly targetId: string;
  readonly reason: string; // 人类可读的原因
  readonly issueCode: string; // 对应 check 的 issue code 或自定义 code
  readonly context: readonly ContextRef[]; // subagent 需要参考的上下文
  readonly complexity: Complexity;
}

export interface ContextRef {
  readonly layer: "l2" | "l3" | "l4" | "l5" | "file" | "function";
  readonly id: string;
  readonly label: string; // 简短描述，如 "L3 contract" / "current L1 files"
}

export interface CompilePlan {
  readonly tasks: readonly CompileTask[];
  readonly summary: {
    readonly total: number;
    readonly compile: number;
    readonly recompile: number;
    readonly updateRef: number;
    readonly review: number;
    readonly complexityCounts: Record<Complexity, number>;
  };
}

/** Default complexity for a given task action */
export function getDefaultComplexity(action: TaskAction): Complexity {
  switch (action) {
    case "update-ref": {
      return "light";
    }
    case "compile":
    case "recompile":
    case "review": {
      return "standard";
    }
  }
}

// ── 主入口 ──

export function compilePlan(input: CheckInput, language = "en"): CompilePlan {
  const lang = language;
  const report = check(input, lang);
  const tasks: CompileTask[] = [
    ...detectMissingCompilations(input, report, lang),
    ...detectRecompilations(input, report, lang),
    ...detectBrokenRefs(input, report, lang),
  ];

  // 去重（同一个 target 可能被多个检测器命中）
  const seen = new Set<string>();
  const unique = tasks.filter((task) => {
    const key = `${task.targetLayer}/${task.targetId}/${task.action}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    tasks: unique,
    summary: {
      total: unique.length,
      compile: unique.filter((task) => task.action === "compile").length,
      recompile: unique.filter((task) => task.action === "recompile").length,
      updateRef: unique.filter((task) => task.action === "update-ref").length,
      review: unique.filter((task) => task.action === "review").length,
      complexityCounts: {
        heavy: unique.filter((task) => task.complexity === "heavy").length,
        standard: unique.filter((task) => task.complexity === "standard").length,
        light: unique.filter((task) => task.complexity === "light").length,
      },
    },
  };
}

// ── 1. 缺失编译：有上游产物但没有对应下游治理产物 ──

function detectMissingCompilations(
  input: CheckInput,
  report: CheckReport,
  lang: string,
): CompileTask[] {
  const l2BlockRefs = new Set(input.l2Blocks.map((block) => block.blockRef));
  const tasks: CompileTask[] = input.l3Blocks
    .filter((block) => !l2BlockRefs.has(block.id))
    .map(
      (block): CompileTask => ({
        action: "compile",
        targetLayer: "l2",
        targetId: block.id,
        reason: t(lang, "compilePlan.reason.missingL2", { name: block.name }),
        issueCode: "MISSING_L2",
        context: buildL3Context(block, input, lang),
        complexity: "standard",
      }),
    );

  const missingFileManifests = report.issues.filter(
    (issue) => issue.code === "MISSING_FILE_MANIFEST",
  );
  for (const issue of missingFileManifests) {
    const l2 = input.l2Blocks.find((block) => block.files.includes(issue.entityId));
    if (l2 === undefined) continue;

    tasks.push({
      action: "compile",
      targetLayer: "file",
      targetId: issue.entityId,
      reason: t(lang, "compilePlan.reason.missingFileManifest", { filePath: issue.entityId }),
      issueCode: issue.code,
      context: buildL2Context(l2, input, lang),
      complexity: "standard",
    });
  }

  const missingFunctionManifests = report.issues.filter(
    (issue) => issue.code === "FILE_EXPORT_UNREGISTERED",
  );
  for (const issue of missingFunctionManifests) {
    const file = (input.fileManifests ?? []).find((manifest) => manifest.id === issue.entityId);
    if (file === undefined) continue;

    const missingExportName = file.exports.find((exportName) => {
      const hasManifest = (input.functionManifests ?? []).some(
        (manifest) => manifest.fileRef === file.id && manifest.exportName === exportName,
      );
      return !hasManifest;
    });
    if (missingExportName === undefined) continue;

    tasks.push({
      action: "review",
      targetLayer: "fn",
      targetId: toFnArtifactId(file.id, missingExportName),
      reason: t(lang, "compilePlan.reason.fileExportUnregistered", {
        target: toFnArtifactId(file.id, missingExportName),
      }),
      issueCode: issue.code,
      context: buildFileContext(file, input, lang),
      complexity: "standard",
    });
  }

  return tasks;
}

// ── 2. 重编译：L3 变了，L2 的 sourceHash 过期 ──

function detectRecompilations(input: CheckInput, report: CheckReport, lang: string): CompileTask[] {
  const driftIssues = report.issues.filter((issue) => issue.code === "SOURCE_DRIFT");

  return driftIssues.map((issue): CompileTask => {
    const l2 = input.l2Blocks.find((block) => block.id === issue.entityId);
    const l3 =
      l2 === undefined ? undefined : input.l3Blocks.find((block) => block.id === l2.blockRef);

    const context: ContextRef[] = [];
    if (l3 !== undefined) {
      context.push(...buildL3Context(l3, input, lang));
    }
    if (l2 !== undefined) {
      context.push({
        layer: "l2",
        id: l2.id,
        label: t(lang, "compilePlan.label.currentL2", { files: l2.files.join(", ") }),
      });
    }

    return {
      action: "recompile",
      targetLayer: "l2",
      targetId: issue.entityId,
      reason: t(lang, "compilePlan.reason.sourceDrift"),
      issueCode: "SOURCE_DRIFT",
      context,
      complexity: "standard",
    };
  });
}

// ── 3. 断裂引用：引用失效，需要修复或审查 ──

function detectBrokenRefs(input: CheckInput, report: CheckReport, lang: string): CompileTask[] {
  const tasks: CompileTask[] = [];

  const missingL4BlockRefs = report.issues.filter(
    (issue) => issue.code === "MISSING_BLOCK_REF" && issue.layer === "l4",
  );
  for (const issue of missingL4BlockRefs) {
    const flow = input.l4Flows.find((entry) => entry.id === issue.entityId);
    if (flow === undefined) continue;

    const context: ContextRef[] = [
      { layer: "l4", id: flow.id, label: t(lang, "compilePlan.label.l4Flow", { name: flow.name }) },
    ];
    if (input.l5 !== undefined) {
      context.push({
        layer: "l5",
        id: input.l5.id,
        label: t(lang, "compilePlan.label.l5Blueprint"),
      });
    }

    tasks.push({
      action: "update-ref",
      targetLayer: "l4",
      targetId: flow.id,
      reason: t(lang, "compilePlan.reason.missingBlockRef"),
      issueCode: issue.code,
      context,
      complexity: "light",
    });
  }

  const missingL2Refs = report.issues.filter(
    (issue) => issue.code === "MISSING_BLOCK_REF" && issue.layer === "l2",
  );
  for (const issue of missingL2Refs) {
    tasks.push({
      action: "review",
      targetLayer: "l2",
      targetId: issue.entityId,
      reason: t(lang, "compilePlan.reason.missingL2BlockRef"),
      issueCode: issue.code,
      context: [
        { layer: "l2", id: issue.entityId, label: t(lang, "compilePlan.label.orphanedL2") },
      ],
      complexity: "standard",
    });
  }

  const missingFileBlockRefs = report.issues.filter(
    (issue) => issue.code === "MISSING_BLOCK_REF" && issue.layer === "file",
  );
  for (const issue of missingFileBlockRefs) {
    const file = (input.fileManifests ?? []).find((manifest) => manifest.id === issue.entityId);
    if (file === undefined) continue;

    tasks.push({
      action: "update-ref",
      targetLayer: "file",
      targetId: file.id,
      reason: t(lang, "compilePlan.reason.missingFileBlockRef"),
      issueCode: issue.code,
      context: buildFileContext(file, input, lang),
      complexity: "light",
    });
  }

  const missingFileL2Refs = report.issues.filter(
    (issue) => issue.code === "MISSING_L2_REF" && issue.layer === "file",
  );
  for (const issue of missingFileL2Refs) {
    const file = (input.fileManifests ?? []).find((manifest) => manifest.id === issue.entityId);
    if (file === undefined) continue;

    tasks.push({
      action: "review",
      targetLayer: "file",
      targetId: file.id,
      reason: t(lang, "compilePlan.reason.missingFileL2Ref"),
      issueCode: issue.code,
      context: buildFileContext(file, input, lang),
      complexity: "standard",
    });
  }

  const brokenFunctionRefs = report.issues.filter(
    (issue) =>
      issue.layer === "function" && ["MISSING_FILE_REF", "MISSING_EXPORT_REF"].includes(issue.code),
  );
  for (const issue of brokenFunctionRefs) {
    const fn = (input.functionManifests ?? []).find((manifest) => manifest.id === issue.entityId);
    if (fn === undefined) continue;

    tasks.push({
      action: "update-ref",
      targetLayer: "fn",
      targetId: fn.id,
      reason: t(lang, "compilePlan.reason.missingFunctionRef"),
      issueCode: issue.code,
      context: buildFunctionContext(fn, input, lang),
      complexity: "light",
    });
  }

  return tasks;
}

// ── 辅助：构建上下文引用 ──

function buildL3Context(block: L3Block, input: CheckInput, lang: string): ContextRef[] {
  const context: ContextRef[] = [
    {
      layer: "l3",
      id: block.id,
      label: t(lang, "compilePlan.label.l3Contract", { name: block.name }),
    },
  ];

  const referencingFlows = input.l4Flows.filter((flow) =>
    extractBlockRefs(flow).includes(block.id),
  );
  for (const flow of referencingFlows) {
    context.push({
      layer: "l4",
      id: flow.id,
      label: t(lang, "compilePlan.label.l4FlowRef", { name: flow.name }),
    });
  }

  return context;
}

function buildL2Context(block: L2CodeBlock, input: CheckInput, lang: string): ContextRef[] {
  const context: ContextRef[] = [
    {
      layer: "l2",
      id: block.id,
      label: t(lang, "compilePlan.label.currentL2", { files: block.files.join(", ") }),
    },
  ];

  const l3 = input.l3Blocks.find((entry) => entry.id === block.blockRef);
  if (l3 !== undefined) {
    context.unshift(...buildL3Context(l3, input, lang));
  }

  return dedupeContext(context);
}

function buildFileContext(file: FileManifest, input: CheckInput, lang: string): ContextRef[] {
  const context: ContextRef[] = [
    {
      layer: "file",
      id: file.id,
      label: t(lang, "compilePlan.label.fileManifest", { path: file.path }),
    },
  ];

  const l2 = input.l2Blocks.find((entry) => entry.id === file.l2BlockRef);
  if (l2 !== undefined) {
    context.push(...buildL2Context(l2, input, lang));
  }

  return dedupeContext(context);
}

function buildFunctionContext(fn: FunctionManifest, input: CheckInput, lang: string): ContextRef[] {
  const context: ContextRef[] = [
    {
      layer: "function",
      id: fn.id,
      label: t(lang, "compilePlan.label.functionManifest", { exportName: fn.exportName }),
    },
  ];

  const file = (input.fileManifests ?? []).find((manifest) => manifest.id === fn.fileRef);
  if (file !== undefined) {
    context.push(...buildFileContext(file, input, lang));
  }

  return dedupeContext(context);
}

function dedupeContext(context: readonly ContextRef[]): ContextRef[] {
  const seen = new Set<string>();
  return context.filter((entry) => {
    const key = `${entry.layer}:${entry.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toFnArtifactId(fileId: string, exportName: string): string {
  const normalizedExportName = exportName
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replaceAll(/[^A-Za-z0-9]+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .toLowerCase();
  return `${fileId}.${normalizedExportName}`;
}
