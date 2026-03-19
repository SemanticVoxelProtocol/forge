// prompt-builder — SkillInput → StructuredPrompt
// 将编译任务组装为结构化 prompt，复用 core/view.ts 渲染
// 纯函数，不做 IO

import { getLanguage, languageDirective } from "../core/i18n.js";
import { viewL2Detail, viewL3Detail, viewL4Detail, viewL5Overview } from "../core/view.js";
import type { Complexity, TaskAction } from "../core/compile-plan.js";
import type { SkillInput } from "../core/skill.js";
import type { RefFile } from "../core/store.js";

export interface StructuredPrompt {
  readonly role: string;
  readonly context: string;
  readonly task: string;
  readonly input: string;
  readonly outputSpec: string;
  readonly rules: string;
  readonly complexity: Complexity;
}

// ── 角色定义 ──

const ROLES: Record<TaskAction, string> = {
  compile:
    "You are an SVP compiler subagent. Your job is to implement L1 source code from an L3 contract specification.",
  recompile:
    "You are an SVP recompiler subagent. An L3 contract has changed — update the L1 source code to match while preserving unchanged logic.",
  review:
    "You are an SVP review subagent. L1 code has drifted from its L3 contract. Analyze the difference and recommend whether to update L3, fix L1, or accept the drift.",
  "update-ref":
    "You are an SVP reference repair subagent. An L4 flow references an L3 block that doesn't exist. Create the missing L3 contract or fix the reference.",
};

// ── 输出规格 ──

const OUTPUT_SPECS: Record<TaskAction, string> = {
  compile: [
    "Generate L1 source files that implement the L3 contract:",
    "- Function signatures must match L3 input/output pins exactly",
    "- Implementation must satisfy all validate rules and constraints",
    "- Internal logic should follow the description",
    "- If Documentation is provided, use it for design intent, edge cases, and error strategy",
    "- After writing files, run: forge link <l3-id> --files <paths>",
    "- File naming: src/<block-id>.ts (or appropriate for language)",
  ].join("\n"),
  recompile: [
    "Update L1 source files to match the changed L3 contract:",
    "- Compare old vs new L3 to identify what changed",
    "- Modify only the affected parts of the implementation",
    "- Preserve unchanged logic and tests",
    "- After updating files, run: forge link <l3-id> --files <paths>",
  ].join("\n"),
  review: [
    "Analyze the drift between L3 contract and L1 implementation:",
    "- Report which L3 pins/constraints are violated",
    "- Classify as: L3 needs update | L1 is wrong | cosmetic only",
    "- If L3 needs update, suggest specific changes",
    "- If L1 is wrong, explain what to fix",
    "- Do NOT make changes — only report findings",
  ].join("\n"),
  "update-ref": [
    "Fix the broken L4 reference:",
    "- Option A: Create the missing L3 block with appropriate contract",
    "- Option B: Fix the L4 step to reference an existing L3 block",
    "- If creating L3, infer pins from the L4 flow context (upstream/downstream steps)",
    "- After creating L3, run: forge rehash l3/<id>",
  ].join("\n"),
};

// ── 规则 ──

const COMMON_RULES = [
  "- Do NOT modify layers above your target — strict downward only",
  "- Use forge rehash to fix contentHash after editing JSON files",
  "- Use forge link to create/update L2 after generating L1 code",
  "- Write placeholder for contentHash in JSON — rehash will fix it",
  "- Keep implementation minimal — satisfy the contract, nothing more",
  "",
  "**Implementation quality guidelines:**",
  "- One L3 block CAN produce multiple L1 files — split when a single file would exceed ~200 lines or mix unrelated concerns",
  "- If the L3 contract covers multiple domains (e.g., routes for all entities), split into one file per domain and list all in forge link --files",
  "- Each file should be independently understandable — avoid files that only make sense when read alongside another",
  "- Prefer explicit over clever — straightforward code is easier to verify against the L3 contract",
].join("\n");

// ── 主入口 ──

/** 从 SkillInput 构建结构化 Prompt */
export function buildPrompt(input: SkillInput): StructuredPrompt {
  const { task } = input;
  const lang = getLanguage(input.resolved.l5);
  const langDirective = languageDirective(lang);

  return {
    role: ROLES[task.action],
    context: buildContext(input),
    task: `[${task.action}] ${task.reason}`,
    input: buildInput(input),
    outputSpec: OUTPUT_SPECS[task.action],
    rules: COMMON_RULES + langDirective,
    complexity: task.complexity,
  };
}

/** 渲染 StructuredPrompt 为 markdown 文本（喂给 AI） */
export function renderPrompt(prompt: StructuredPrompt): string {
  return [
    `---`,
    `complexity: ${prompt.complexity}`,
    `---`,
    "",
    `# ${prompt.role}`,
    "",
    "## Context",
    prompt.context,
    "",
    "## Task",
    prompt.task,
    "",
    "## Input",
    prompt.input,
    "",
    "## Output Spec",
    prompt.outputSpec,
    "",
    "## Rules",
    prompt.rules,
  ].join("\n");
}

// ── 内部构建函数 ──

function buildContext(input: SkillInput): string {
  const { resolved } = input;
  const parts: string[] = [];

  // L5 概览（如果有）
  if (resolved.l5 !== undefined) {
    parts.push("### Project Blueprint (L5)", "", viewL5Overview(resolved.l5));
  }

  if (parts.length === 0) {
    parts.push("No project-level context available.");
  }

  return parts.join("\n");
}

function buildInput(input: SkillInput): string {
  const { task } = input;
  const parts: string[] = [];

  switch (task.action) {
    case "compile": {
      parts.push(...buildCompileInput(input));
      break;
    }
    case "recompile": {
      parts.push(...buildRecompileInput(input));
      break;
    }
    case "review": {
      parts.push(...buildReviewInput(input));
      break;
    }
    case "update-ref": {
      parts.push(...buildUpdateRefInput(input));
      break;
    }
  }

  return parts.join("\n");
}

function buildCompileInput(input: SkillInput): string[] {
  const { resolved } = input;
  const parts: string[] = [];

  // L3 contract — primary input
  if (resolved.l3 !== undefined) {
    const flows = resolved.l4 === undefined ? [] : [resolved.l4];
    parts.push("### L3 Contract", "", viewL3Detail(resolved.l3, flows, []));
  }

  // 模块化文档
  if (resolved.docs !== undefined) {
    parts.push("", "### Documentation", "", resolved.docs);
  }

  // 参考材料
  if (resolved.refs !== undefined && resolved.refs.length > 0) {
    parts.push("", "### Reference Materials", "", formatRefs(resolved.refs));
  }

  return parts;
}

function buildRecompileInput(input: SkillInput): string[] {
  const { resolved } = input;
  const parts: string[] = [];

  // L3 contract
  if (resolved.l3 !== undefined) {
    const flows = resolved.l4 === undefined ? [] : [resolved.l4];
    const l2s = resolved.l2 === undefined ? [] : [resolved.l2];
    parts.push("### L3 Contract (updated)", "", viewL3Detail(resolved.l3, flows, l2s));
  }

  // L2 mapping
  if (resolved.l2 !== undefined) {
    const l3s = resolved.l3 === undefined ? [] : [resolved.l3];
    parts.push("", "### Current L2 Mapping", "", viewL2Detail(resolved.l2, l3s));
  }

  // Existing L1 files
  if (resolved.l1Files !== undefined && resolved.l1Files.length > 0) {
    parts.push("", "### Current L1 Source Files");
    for (const file of resolved.l1Files) {
      parts.push("", `#### ${file.path}`, "```", file.content, "```");
    }
  }

  // 模块化文档
  if (resolved.docs !== undefined) {
    parts.push("", "### Documentation", "", resolved.docs);
  }

  // 参考材料
  if (resolved.refs !== undefined && resolved.refs.length > 0) {
    parts.push("", "### Reference Materials", "", formatRefs(resolved.refs));
  }

  return parts;
}

function buildReviewInput(input: SkillInput): string[] {
  const { resolved } = input;
  const parts: string[] = [];

  // L3 contract
  if (resolved.l3 !== undefined) {
    const flows = resolved.l4 === undefined ? [] : [resolved.l4];
    const l2s = resolved.l2 === undefined ? [] : [resolved.l2];
    parts.push("### L3 Contract", "", viewL3Detail(resolved.l3, flows, l2s));
  }

  // L2 mapping
  if (resolved.l2 !== undefined) {
    const l3s = resolved.l3 === undefined ? [] : [resolved.l3];
    parts.push("", "### L2 Mapping", "", viewL2Detail(resolved.l2, l3s));
  }

  // L1 actual code
  if (resolved.l1Files !== undefined && resolved.l1Files.length > 0) {
    parts.push("", "### L1 Actual Source Files");
    for (const file of resolved.l1Files) {
      parts.push("", `#### ${file.path}`, "```", file.content, "```");
    }
  }

  // 模块化文档
  if (resolved.docs !== undefined) {
    parts.push("", "### Documentation", "", resolved.docs);
  }

  // 参考材料
  if (resolved.refs !== undefined && resolved.refs.length > 0) {
    parts.push("", "### Reference Materials", "", formatRefs(resolved.refs));
  }

  return parts;
}

function buildUpdateRefInput(input: SkillInput): string[] {
  const { resolved } = input;
  const parts: string[] = [];

  // L4 flow context
  if (resolved.l4 !== undefined) {
    const l3s = resolved.l3 === undefined ? [] : [resolved.l3];
    parts.push(
      "### L4 Flow (with broken reference)",
      "",
      viewL4Detail(resolved.l4, l3s, resolved.l5),
    );
  }

  return parts;
}

/** Format reference files for prompt injection */
function formatRefs(refs: readonly RefFile[]): string {
  const parts: string[] = [
    "The following reference files are available for this block.",
    "Use them to guide your implementation.",
  ];

  for (const ref of refs) {
    if (ref.isText && ref.content !== undefined) {
      const ext = ref.name.split(".").pop() ?? "";
      parts.push("", `#### ${ref.name}`, "", "```" + ext, ref.content, "```");
    } else {
      parts.push(
        "",
        `#### ${ref.name} (binary)`,
        "",
        `File path: ${ref.path}`,
        "(Read this file for the visual/binary reference)",
      );
    }
  }

  return parts.join("\n");
}
