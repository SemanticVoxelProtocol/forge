// forge compile-plan — 变更检测 + 重编译任务生成
// 基于 check 的漂移检测，生成结构化的任务清单给 AI subagent
// 纯函数，不做 IO

import { check } from "./check.js";
import { t } from "./i18n.js";
import { extractBlockRefs } from "./l4.js";
import type { CheckInput } from "./check.js";
import type { L3Block } from "./l3.js";

// ── 任务类型 ──

export type TaskAction = "compile" | "recompile" | "update-ref" | "review";

export type Complexity = "heavy" | "standard" | "light";

export interface CompileTask {
  readonly action: TaskAction;
  readonly targetLayer: "l2" | "l3" | "l4";
  readonly targetId: string;
  readonly reason: string; // 人类可读的原因
  readonly issueCode: string; // 对应 check 的 issue code 或自定义 code
  readonly context: readonly ContextRef[]; // subagent 需要参考的上下文
  readonly complexity: Complexity;
}

export interface ContextRef {
  readonly layer: "l2" | "l3" | "l4" | "l5";
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
  const tasks: CompileTask[] = [
    ...detectMissingCompilations(input, lang),
    ...detectRecompilations(input, lang),
    ...detectContentDrift(input, lang),
    ...detectBrokenRefs(input, lang),
  ];

  // 去重（同一个 target 可能被多个检测器命中）
  const seen = new Set<string>();
  const unique = tasks.filter((t) => {
    const key = `${t.targetLayer}/${t.targetId}/${t.action}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    tasks: unique,
    summary: {
      total: unique.length,
      compile: unique.filter((t) => t.action === "compile").length,
      recompile: unique.filter((t) => t.action === "recompile").length,
      updateRef: unique.filter((t) => t.action === "update-ref").length,
      review: unique.filter((t) => t.action === "review").length,
      complexityCounts: {
        heavy: unique.filter((t) => t.complexity === "heavy").length,
        standard: unique.filter((t) => t.complexity === "standard").length,
        light: unique.filter((t) => t.complexity === "light").length,
      },
    },
  };
}

// ── 1. 缺失编译：有 L3 但没有对应 L2 ──

function detectMissingCompilations(input: CheckInput, lang: string): CompileTask[] {
  const l2BlockRefs = new Set(input.l2Blocks.map((cb) => cb.blockRef));

  return input.l3Blocks
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
}

// ── 2. 重编译：L3 变了，L2 的 sourceHash 过期 ──

function detectRecompilations(input: CheckInput, lang: string): CompileTask[] {
  const report = check(input, lang);
  const driftIssues = report.issues.filter((i) => i.code === "SOURCE_DRIFT");

  return driftIssues.map((issue): CompileTask => {
    const cb = input.l2Blocks.find((b) => b.id === issue.entityId);
    const l3 = cb === undefined ? undefined : input.l3Blocks.find((b) => b.id === cb.blockRef);

    const context: ContextRef[] = [];
    if (l3 !== undefined) {
      context.push(...buildL3Context(l3, input, lang));
    }
    if (cb !== undefined) {
      context.push({
        layer: "l2",
        id: cb.id,
        label: t(lang, "compilePlan.label.currentL2", { files: cb.files.join(", ") }),
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

// ── 3. 内容漂移：L1 导出签名变了，需要向上对账 ──

function detectContentDrift(input: CheckInput, lang: string): CompileTask[] {
  const report = check(input, lang);
  const driftIssues = report.issues.filter((i) => i.code === "CONTENT_DRIFT");

  return driftIssues.map((issue): CompileTask => {
    const cb = input.l2Blocks.find((b) => b.id === issue.entityId);
    const l3 = cb === undefined ? undefined : input.l3Blocks.find((b) => b.id === cb.blockRef);

    const context: ContextRef[] = [];
    if (cb !== undefined) {
      context.push({
        layer: "l2",
        id: cb.id,
        label: t(lang, "compilePlan.label.l2CodeBlock", { files: cb.files.join(", ") }),
      });
    }
    if (l3 !== undefined) {
      context.push({
        layer: "l3",
        id: l3.id,
        label: t(lang, "compilePlan.label.l3Verify", { name: l3.name }),
      });
    }

    return {
      action: "review",
      targetLayer: "l3",
      targetId: l3?.id ?? issue.entityId,
      reason: t(lang, "compilePlan.reason.contentDrift"),
      issueCode: "CONTENT_DRIFT",
      context,
      complexity: "standard",
    };
  });
}

// ── 4. 断裂引用：L4 引用了不存在的 L3 ──

function detectBrokenRefs(input: CheckInput, lang: string): CompileTask[] {
  const report = check(input, lang);
  const tasks: CompileTask[] = [];

  // L4 → L3 断裂引用
  const missingBlockRefs = report.issues.filter(
    (i) => i.code === "MISSING_BLOCK_REF" && i.layer === "l4",
  );

  for (const issue of missingBlockRefs) {
    const flow = input.l4Flows.find((f) => f.id === issue.entityId);
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
      issueCode: "MISSING_BLOCK_REF",
      context,
      complexity: "light",
    });
  }

  // L2 → L3 断裂引用
  const missingL2Refs = report.issues.filter(
    (i) => i.code === "MISSING_BLOCK_REF" && i.layer === "l2",
  );

  for (const issue of missingL2Refs) {
    tasks.push({
      action: "review",
      targetLayer: "l2",
      targetId: issue.entityId,
      reason: t(lang, "compilePlan.reason.missingL2BlockRef"),
      issueCode: "MISSING_BLOCK_REF",
      context: [
        { layer: "l2", id: issue.entityId, label: t(lang, "compilePlan.label.orphanedL2") },
      ],
      complexity: "standard",
    });
  }

  return tasks;
}

// ── 辅助：构建 L3 上下文引用 ──

function buildL3Context(block: L3Block, input: CheckInput, lang: string): ContextRef[] {
  const context: ContextRef[] = [
    {
      layer: "l3",
      id: block.id,
      label: t(lang, "compilePlan.label.l3Contract", { name: block.name }),
    },
  ];

  // 找到引用此 block 的 L4 artifact
  const referencingFlows = input.l4Flows.filter((f) => extractBlockRefs(f).includes(block.id));
  for (const flow of referencingFlows) {
    context.push({
      layer: "l4",
      id: flow.id,
      label: t(lang, "compilePlan.label.l4FlowRef", { name: flow.name }),
    });
  }

  return context;
}
