// prompt-builder — SkillInput → StructuredPrompt
// 将编译任务组装为结构化 prompt，复用 core/view.ts 渲染
// 纯函数，不做 IO

import { getLanguage, languageDirective } from "../core/i18n.js";
import { viewL2Detail, viewL3Detail, viewL4Detail, viewL5Overview } from "../core/view.js";
import type { Complexity, TaskAction } from "../core/compile-plan.js";
import type { FileManifest } from "../core/file.js";
import type { FunctionManifest } from "../core/function.js";
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

const DEFAULT_ROLES: Record<TaskAction, string> = {
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

const DEFAULT_OUTPUT_SPECS: Record<TaskAction, string> = {
  compile: [
    "Generate L1 source files that implement the L3 contract:",
    "- Function signatures must match L3 input/output pins exactly",
    "- Implementation must satisfy all validate rules and constraints",
    "- Internal logic should follow the description",
    "- If Documentation is provided, use it for design intent, edge cases, and error strategy",
    "- If governed file/function manifests are provided, keep generated files, exports, and governed function behavior aligned with them",
    "- After writing files, run: forge link <l3-id> --files <paths>",
    "- File naming: src/<block-id>.ts (or appropriate for language)",
  ].join("\n"),
  recompile: [
    "Update L1 source files to match the changed L3 contract:",
    "- Compare old vs new L3 to identify what changed",
    "- Modify only the affected parts of the implementation",
    "- Preserve unchanged logic and tests",
    "- If governed file/function manifests are provided, preserve their file ownership, export coverage, signatures, and plugin policy unless the task explicitly changes them",
    "- After updating files, run: forge link <l3-id> --files <paths>",
  ].join("\n"),
  review: [
    "Analyze the drift between L3 contract and L1 implementation:",
    "- Report which L3 pins/constraints are violated",
    "- Classify as: L3 needs update | L1 is wrong | cosmetic only",
    "- If L3 needs update, suggest specific changes",
    "- If L1 is wrong, explain what to fix",
    "- If governed file/function manifests are provided, report any drift against their file paths, export coverage, signatures, or plugin policy",
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
  "- When file/function manifests are present, treat them as governance boundaries for file paths, exported functions, signatures, and plugin policy",
].join("\n");

// ── 主入口 ──

/** 从 SkillInput 构建结构化 Prompt */
export function buildPrompt(input: SkillInput): StructuredPrompt {
  const { task } = input;
  const lang = getLanguage(input.resolved.l5);
  const langDirective = languageDirective(lang);

  return {
    role: buildRole(input),
    context: buildContext(input),
    task: `[${task.action}] ${task.reason}`,
    input: buildInput(input),
    outputSpec: buildOutputSpec(input),
    rules: COMMON_RULES + langDirective,
    complexity: task.complexity,
  };
}

function buildRole(input: SkillInput): string {
  const { task } = input;

  if (task.action === "review" && task.targetLayer === "file") {
    return "You are an SVP governed file review subagent. A governed file manifest or its implementation linkage may have drifted. Decide whether the file manifest should be updated, the linkage should be repaired, or the governed file should change.";
  }

  if (task.action === "review" && task.targetLayer === "fn") {
    return "You are an SVP governed function review subagent. A governed function manifest or its backing implementation may have drifted. Determine whether governance metadata should change or the implementation should be corrected.";
  }

  if (task.action === "update-ref" && task.targetLayer === "file") {
    return "You are an SVP governed file reference repair subagent. A governed file manifest has a broken reference to its owning artifacts. Repair the file-level linkage without reframing the task as an L4 flow problem.";
  }

  if (task.action === "update-ref" && task.targetLayer === "fn") {
    return "You are an SVP governed function reference repair subagent. A governed function manifest has a broken file/export linkage. Repair the governed function linkage without reframing the task as an L4 flow problem.";
  }

  return DEFAULT_ROLES[task.action];
}

function buildOutputSpec(input: SkillInput): string {
  const { task } = input;

  if (task.action === "review" && task.targetLayer === "file") {
    return [
      "Review the governed file manifest and its current implementation:",
      "- assess whether the file manifest should be updated, the L2/L3 linkage should be repaired, or the governed file implementation should change",
      "- report any drift in file path, exports, ownership, dependency boundary, or plugin groups",
      "- use the current L1 source to explain whether the implementation still matches the governed intent",
      "- Do NOT make changes — only report findings",
    ].join("\n");
  }

  if (task.action === "review" && task.targetLayer === "fn") {
    return [
      "Review the governed function manifest and its backing implementation:",
      "- assess whether the function manifest should be updated, the backing file/export linkage should be repaired, or the implementation should change",
      "- report any drift in export name, signature, preconditions, postconditions, or plugin policy",
      "- Do NOT make changes — only report findings",
    ].join("\n");
  }

  if (task.action === "update-ref" && task.targetLayer === "file") {
    return [
      "Repair the broken governed file linkage:",
      "- identify which file-level reference is broken (L2 block ref, L3 block refs, or path linkage)",
      "- update the file manifest so it points at the correct owning artifacts",
      "- if the governed file should no longer exist, say so explicitly instead of inventing new L3/L4 work",
      "- After editing the manifest, run: forge rehash file/<id>",
    ].join("\n");
  }

  if (task.action === "update-ref" && task.targetLayer === "fn") {
    return [
      "Repair the broken governed function linkage:",
      "- identify whether the broken link is the fileRef, exportName coverage, or backing governed file relationship",
      "- update the function manifest so it references the correct governed file/export",
      "- if the export no longer belongs under governance, say so explicitly instead of inventing new L3/L4 work",
      "- After editing the manifest, run: forge rehash fn/<id>",
    ].join("\n");
  }

  return DEFAULT_OUTPUT_SPECS[task.action];
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

  if ((resolved.fileManifests ?? []).length > 0) {
    parts.push(
      "",
      "### Governed File Manifests",
      "",
      formatFileManifests(resolved.fileManifests ?? []),
    );
  }

  if ((resolved.functionManifests ?? []).length > 0) {
    parts.push(
      "",
      "### Governed Function Manifests",
      "",
      formatFunctionManifests(resolved.functionManifests ?? []),
    );
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

  appendGovernedManifestSections(parts, resolved.fileManifests, resolved.functionManifests);

  // 模块化文档
  if (resolved.docs !== undefined) {
    parts.push("", "### Documentation", "", resolved.docs);
  }

  // 参考材料
  if (resolved.refs !== undefined && resolved.refs.length > 0) {
    parts.push("", "### Reference Materials", "", formatRefs(resolved.refs));
  }

  // OpenSpec 行为需求
  if (resolved.openspec !== undefined) {
    parts.push("", "### Behavioral Requirements (OpenSpec)", "", resolved.openspec);
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

  appendGovernedManifestSections(parts, resolved.fileManifests, resolved.functionManifests);

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

  // OpenSpec 行为需求
  if (resolved.openspec !== undefined) {
    parts.push("", "### Behavioral Requirements (OpenSpec)", "", resolved.openspec);
  }

  return parts;
}

function buildReviewInput(input: SkillInput): string[] {
  const { resolved } = input;
  const parts: string[] = [];

  if (input.task.targetLayer === "file") {
    return buildFileReviewInput(input);
  }

  if (input.task.targetLayer === "fn") {
    return buildFunctionReviewInput(input);
  }

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

  appendGovernedManifestSections(parts, resolved.fileManifests, resolved.functionManifests);

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

  // OpenSpec 行为需求
  if (resolved.openspec !== undefined) {
    parts.push("", "### Behavioral Requirements (OpenSpec)", "", resolved.openspec);
  }

  return parts;
}

function buildUpdateRefInput(input: SkillInput): string[] {
  const { resolved } = input;
  const parts: string[] = [];

  if (input.task.targetLayer === "file") {
    return buildFileUpdateRefInput(input);
  }

  if (input.task.targetLayer === "fn") {
    return buildFunctionUpdateRefInput(input);
  }

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

function buildFileReviewInput(input: SkillInput): string[] {
  const { resolved } = input;
  const parts: string[] = [];
  const fileManifest = resolved.fileManifests?.[0];

  if (fileManifest !== undefined) {
    parts.push("### Governed File Manifest Under Review", "", formatFileManifest(fileManifest));
  }

  appendSharedGovernanceRepairContext(parts, resolved, fileManifest?.id);
  appendL1Files(parts, resolved.l1Files, "### L1 Actual Source Files");
  appendKnowledgeSections(parts, resolved);

  return parts;
}

function buildFunctionReviewInput(input: SkillInput): string[] {
  const { resolved } = input;
  const parts: string[] = [];
  const functionManifest = resolved.functionManifests?.[0];

  if (functionManifest !== undefined) {
    parts.push(
      "### Governed Function Manifest Under Review",
      "",
      formatFunctionManifest(functionManifest),
    );
  }

  const backingFileManifest = resolved.fileManifests?.find(
    (fileManifest) => fileManifest.id === functionManifest?.fileRef,
  );
  if (backingFileManifest !== undefined) {
    parts.push(
      "",
      "### Backing Governed File Manifest",
      "",
      formatFileManifest(backingFileManifest),
    );
  }

  appendSharedGovernanceRepairContext(parts, resolved, backingFileManifest?.id);
  appendL1Files(parts, resolved.l1Files, "### L1 Actual Source Files");
  appendKnowledgeSections(parts, resolved);

  return parts;
}

function buildFileUpdateRefInput(input: SkillInput): string[] {
  const { resolved } = input;
  const parts: string[] = [];
  const fileManifest = resolved.fileManifests?.[0];

  if (fileManifest !== undefined) {
    parts.push("### Governed File Manifest Under Repair", "", formatFileManifest(fileManifest));
  }

  appendSharedGovernanceRepairContext(parts, resolved, fileManifest?.id);
  appendKnowledgeSections(parts, resolved);

  return parts;
}

function buildFunctionUpdateRefInput(input: SkillInput): string[] {
  const { resolved } = input;
  const parts: string[] = [];
  const functionManifest = resolved.functionManifests?.[0];

  if (functionManifest !== undefined) {
    parts.push(
      "### Governed Function Manifest Under Repair",
      "",
      formatFunctionManifest(functionManifest),
    );
  }

  const backingFileManifest = resolved.fileManifests?.find(
    (fileManifest) => fileManifest.id === functionManifest?.fileRef,
  );
  if (backingFileManifest !== undefined) {
    parts.push(
      "",
      "### Backing Governed File Manifest",
      "",
      formatFileManifest(backingFileManifest),
    );
  }

  appendSharedGovernanceRepairContext(parts, resolved, backingFileManifest?.id);
  appendKnowledgeSections(parts, resolved);

  return parts;
}

function appendSharedGovernanceRepairContext(
  parts: string[],
  resolved: SkillInput["resolved"],
  primaryFileManifestId?: string,
): void {
  if (resolved.l3 !== undefined) {
    const flows = resolved.l4 === undefined ? [] : [resolved.l4];
    const l2s = resolved.l2 === undefined ? [] : [resolved.l2];
    parts.push("", "### Related L3 Contract", "", viewL3Detail(resolved.l3, flows, l2s));
  }

  if (resolved.l2 !== undefined) {
    const l3s = resolved.l3 === undefined ? [] : [resolved.l3];
    parts.push("", "### Current L2 Mapping", "", viewL2Detail(resolved.l2, l3s));
  }

  const secondaryFileManifests = (resolved.fileManifests ?? []).filter(
    (fileManifest) => fileManifest.id !== primaryFileManifestId,
  );
  if (secondaryFileManifests.length > 0) {
    parts.push(
      "",
      "### Additional Governed File Manifests",
      "",
      formatFileManifests(secondaryFileManifests),
    );
  }

  if ((resolved.functionManifests ?? []).length > 0) {
    parts.push(
      "",
      "### Related Governed Function Manifests",
      "",
      formatFunctionManifests(resolved.functionManifests ?? []),
    );
  }
}

function appendL1Files(
  parts: string[],
  l1Files: SkillInput["resolved"]["l1Files"],
  heading: string,
): void {
  if (l1Files !== undefined && l1Files.length > 0) {
    parts.push("", heading);
    for (const file of l1Files) {
      parts.push("", `#### ${file.path}`, "```", file.content, "```");
    }
  }
}

function appendKnowledgeSections(parts: string[], resolved: SkillInput["resolved"]): void {
  if (resolved.docs !== undefined) {
    parts.push("", "### Documentation", "", resolved.docs);
  }

  if (resolved.refs !== undefined && resolved.refs.length > 0) {
    parts.push("", "### Reference Materials", "", formatRefs(resolved.refs));
  }

  if (resolved.openspec !== undefined) {
    parts.push("", "### Behavioral Requirements (OpenSpec)", "", resolved.openspec);
  }
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

function appendGovernedManifestSections(
  parts: string[],
  fileManifests: readonly FileManifest[] | undefined,
  functionManifests: readonly FunctionManifest[] | undefined,
): void {
  if ((fileManifests ?? []).length > 0) {
    parts.push("", "### Governed File Manifests", "", formatFileManifests(fileManifests ?? []));
  }

  if ((functionManifests ?? []).length > 0) {
    parts.push(
      "",
      "### Governed Function Manifests",
      "",
      formatFunctionManifests(functionManifests ?? []),
    );
  }
}

function formatFileManifests(fileManifests: readonly FileManifest[]): string {
  return fileManifests.map((fileManifest) => formatFileManifest(fileManifest)).join("\n\n");
}

function formatFunctionManifests(functionManifests: readonly FunctionManifest[]): string {
  return functionManifests
    .map((functionManifest) => formatFunctionManifest(functionManifest))
    .join("\n\n");
}

function formatFileManifest(fileManifest: FileManifest): string {
  return [
    `#### ${fileManifest.id}`,
    `- Path: ${fileManifest.path}`,
    `- Purpose: ${fileManifest.purpose}`,
    `- Exports: ${formatList(fileManifest.exports)}`,
    `- Ownership: ${formatList(fileManifest.ownership)}`,
    `- Dependency Boundary: ${formatList(fileManifest.dependencyBoundary)}`,
    `- Plugin Groups: ${formatList(fileManifest.pluginGroups)}`,
  ].join("\n");
}

function formatFunctionManifest(functionManifest: FunctionManifest): string {
  return [
    `#### ${functionManifest.id}`,
    `- File Ref: ${functionManifest.fileRef}`,
    `- Export Name: ${functionManifest.exportName}`,
    `- Signature: ${functionManifest.signature}`,
    `- Preconditions: ${formatList(functionManifest.preconditions)}`,
    `- Postconditions: ${formatList(functionManifest.postconditions)}`,
    `- Plugin Policy: ${formatList(functionManifest.pluginPolicy)}`,
  ].join("\n");
}

function formatList(values: readonly string[]): string {
  return values.length === 0 ? "(none)" : values.join(", ");
}
