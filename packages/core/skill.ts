// AI Skill 系统 — 类型定义
// Skill 是纯函数：(task + context) → artifacts + notes
// 编排层负责 IO（解析上下文、写磁盘、跑收敛循环）

import type { CompileTask, TaskAction } from "./compile-plan.js";
import type { L2CodeBlock } from "./l2.js";
import type { L3Block } from "./l3.js";
import type { L4Artifact } from "./l4.js";
import type { L5Blueprint } from "./l5.js";
import type { RefFile } from "./store.js";
import type { ArtifactVersion } from "./version.js";

// ── Skill 输入 ──

/** 编排层预解析好的实际数据（Skill 不做 IO） */
export interface ResolvedContext {
  readonly l5?: L5Blueprint;
  readonly l3?: L3Block;
  readonly l2?: L2CodeBlock;
  readonly l4?: L4Artifact;
  readonly l1Files?: readonly FileContent[];
  readonly docs?: string;
  readonly refs?: readonly RefFile[];
}

/** L1 源文件内容 */
export interface FileContent {
  readonly path: string;
  readonly content: string;
}

/** Skill 的完整输入 */
export interface SkillInput {
  readonly task: CompileTask;
  readonly resolved: ResolvedContext;
  readonly config: SkillConfig;
}

/** Skill 行为约束 */
export interface SkillConfig {
  readonly maxFilesToCreate: number;
  readonly maxFilesToModify: number;
  readonly dryRun: boolean; // 只输出 artifacts，不实际写
  readonly requireHumanApproval: boolean; // review skill 默认 true
}

// ── Skill 输出 ──

export type SkillStatus = "done" | "needs-review" | "blocked";

/** Skill 执行结果 */
export interface SkillResult {
  readonly action: TaskAction;
  readonly status: SkillStatus;
  readonly artifacts: readonly Artifact[];
  readonly notes: string; // AI 给人类的说明
}

/** 新增或修改的层制品 */
export interface Artifact {
  readonly layer: "l2" | "l3" | "l4";
  readonly id: string;
  readonly data: L2CodeBlock | L3Block | L4Artifact;
  readonly version: ArtifactVersion;
}

/** 新增或修改的 L1 源文件 */
export interface FileArtifact {
  readonly path: string;
  readonly content: string;
  readonly action: "create" | "modify" | "delete";
}

/** 带文件的完整结果（compile / recompile 会生成源文件） */
export interface SkillResultWithFiles extends SkillResult {
  readonly files: readonly FileArtifact[];
}

// ── 默认配置 ──

export const DEFAULT_SKILL_CONFIG: SkillConfig = {
  maxFilesToCreate: 10,
  maxFilesToModify: 20,
  dryRun: false,
  requireHumanApproval: false,
};

export const REVIEW_SKILL_CONFIG: SkillConfig = {
  ...DEFAULT_SKILL_CONFIG,
  requireHumanApproval: true,
};
