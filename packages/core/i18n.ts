// i18n — 轻量消息目录
// 支持项目级语言偏好，英文兜底，{param} 插值

import type { L5Blueprint } from "./l5.js";

type MessageParams = Record<string, string | number>;

// ── 公共 API ──

/** 查找翻译，英文兜底，支持 {param} 插值 */
export function t(lang: string, key: string, params?: MessageParams): string {
  const catalog = messages[lang] ?? messages.en;
  let template = (catalog[key] as string | undefined) ?? (messages.en[key] as string | undefined) ?? key;
  if (params !== undefined) {
    for (const [k, v] of Object.entries(params)) {
      template = template.replaceAll(`{${k}}`, String(v));
    }
  }
  return template;
}

/** 检测系统语言（取 LANG/LC_ALL 前两位，如 "zh_CN.UTF-8" → "zh"） */
export function detectSystemLanguage(): string {
  const raw = typeof process === "undefined" ? "" : (process.env.LC_ALL ?? process.env.LANG ?? "");
  const match = /^([a-z]{2})/i.exec(raw);
  return match ? match[1].toLowerCase() : "en";
}

/** 从 L5 提取语言，缺省检测系统语言 */
export function getLanguage(l5?: Pick<L5Blueprint, "language">  ): string {
  return l5?.language ?? detectSystemLanguage();
}

/** 语言代码 → 人类可读名称 */
export function languageName(code: string): string {
  const names: Record<string, string> = {
    en: "English",
    zh: "Chinese/中文",
    ja: "Japanese/日本語",
    ko: "Korean/한국어",
    es: "Spanish/Español",
    fr: "French/Français",
    de: "German/Deutsch",
    pt: "Portuguese/Português",
    ru: "Russian/Русский",
  };
  return names[code] ?? code;
}

/** AI 提示词中注入的语言输出指令 */
export function languageDirective(lang: string): string {
  if (lang === "en") return "";
  return `\nIMPORTANT: All human-readable text you generate MUST be written in ${languageName(lang)}. Technical terms, code, JSON keys, and CLI commands should remain in English.\n`;
}

// ── 消息目录 ──

const messages: Record<string, Record<string, string>> = {
  en: {
    // ── check.* ──
    "check.hashMismatch.l5":
      "L5 contentHash mismatch: stored={stored}, computed={computed}",
    "check.hashMismatch.l4":
      'L4 "{name}" contentHash mismatch: stored={stored}, computed={computed}',
    "check.hashMismatch.l3":
      'L3 "{name}" contentHash mismatch: stored={stored}, computed={computed}',
    "check.hashMismatch.l2":
      'L2 "{id}" contentHash mismatch: stored={stored}, computed={computed}',
    "check.missingBlockRef.l4FlowStep":
      'L4 "{flowName}" step "{stepId}" references non-existent L3 block "{blockRef}"',
    "check.missingFlowRef":
      'L4 "{flowName}" step "{stepId}" references non-existent L4 flow "{flowRef}"',
    "check.missingBlockRef.l4EventGraphStep":
      'L4 "{egName}" handler "{handlerId}" step "{stepId}" references non-existent L3 block "{blockRef}"',
    "check.missingBlockRef.l4SmOnEntry":
      'L4 "{smName}" state "{stateName}" onEntry references non-existent L3 block "{blockRef}"',
    "check.missingBlockRef.l4SmOnExit":
      'L4 "{smName}" state "{stateName}" onExit references non-existent L3 block "{blockRef}"',
    "check.missingBlockRef.l4SmGuard":
      'L4 "{smName}" transition "{from}" → "{to}" guard references non-existent L3 block "{guard}"',
    "check.missingBlockRef.l2":
      'L2 "{id}" references non-existent L3 block "{blockRef}"',
    "check.missingStepRef.next":
      'L4 "{parentName}" step "{stepId}" next references non-existent step "{next}"',
    "check.missingStepRef.branch":
      'L4 "{parentName}" step "{stepId}" branch references non-existent step "{branchId}"',
    "check.missingStepRef.wait":
      'L4 "{parentName}" step "{stepId}" waitFor references non-existent step "{waitId}"',
    "check.invalidDataFlowFormat":
      'L4 "{flowName}" dataFlow {direction} "{endpoint}" is not in "stepId.pinName" format',
    "check.missingStepRef.dataFlow":
      'L4 "{flowName}" dataFlow {direction} references non-existent step "{stepId}"',
    "check.missingPin":
      'L4 "{flowName}" dataFlow {direction} "{endpoint}": pin "{pinName}" not found on L3 block "{blockRef}"',
    "check.invalidDataFlowFormat.eventGraph":
      'L4 "{egName}" handler "{handlerId}" dataFlow {direction} "{endpoint}" is not in valid format',
    "check.missingStateRef":
      'L4 "{egName}" handler "{handlerId}" dataFlow {direction} references undeclared state key "{field}"',
    "check.sourceDrift":
      'L2 "{id}" sourceHash ({sourceHash}) does not match L3 "{blockRef}" contentHash ({l3Hash}): L3 has changed since last compilation',
    "check.contentDrift":
      'L2 "{id}" signatureHash mismatch: L1 exported signatures have changed since last sync',
    "check.selfReferencingFlow":
      'L4 "{flowName}" step "{stepId}" calls itself (recursive flow reference)',
    "check.duplicateEvent":
      'L4 "{egName}" has duplicate event handler for "{event}"',
    "check.emptyState":
      'L4 "{egName}" event-graph has no state declarations',
    "check.invalidInitialState":
      'L4 "{smName}" initialState "{initialState}" not found in states',
    "check.invalidTransition.from":
      'L4 "{smName}" transition from "{from}" references non-existent state',
    "check.invalidTransition.to":
      'L4 "{smName}" transition to "{to}" references non-existent state',
    "check.unreachableState":
      'L4 "{smName}" state "{stateName}" is not reachable from initialState "{initialState}"',
    "check.nextCycle":
      'L4 "{entityName}" has a cycle in next chain involving step "{current}"',
    "check.orphanStep":
      'L4 "{entityName}" step "{stepId}" is not reachable from the first step',
    "check.missingLanguage":
      "L5 blueprint has no language field — consider adding language preference",

    // ── compilePlan.* ──
    "compilePlan.reason.missingL2":
      'L3 block "{name}" has no corresponding L2 code block — needs initial compilation',
    "compilePlan.reason.sourceDrift":
      "L3 contract changed since last compilation — L2 code is stale",
    "compilePlan.reason.contentDrift":
      "L1 exported signatures changed — review whether L3 contract still matches the code",
    "compilePlan.reason.missingBlockRef":
      "Flow references missing L3 block — step needs updating or L3 needs recreating",
    "compilePlan.reason.missingL2BlockRef":
      "L2 code block references missing L3 block — orphaned code needs review",
    "compilePlan.label.l3Contract": 'L3 contract "{name}"',
    "compilePlan.label.currentL2": "current L2 mapping ({files})",
    "compilePlan.label.l2CodeBlock": "L2 code block ({files})",
    "compilePlan.label.l3Verify": 'L3 contract "{name}" — verify still satisfied',
    "compilePlan.label.l4Flow": 'L4 flow "{name}"',
    "compilePlan.label.l5Blueprint": "L5 blueprint",
    "compilePlan.label.orphanedL2": "orphaned L2 code block",
    "compilePlan.label.l4FlowRef": 'L4 flow "{name}" (references this block)',

    // ── view.* ──
    "view.l5.intent": "intent",
    "view.l5.constraints": "constraints",
    "view.l5.domains": "domains ({count})",
    "view.l5.integrations": "integrations ({count})",
    "view.l4.title": "L4 Logic Chains ({count} artifacts)",
    "view.l4.flow.kind": "kind: flow",
    "view.l4.flow.trigger": "trigger",
    "view.l4.flow.steps": "steps ({count})",
    "view.l4.flow.dataFlows": "dataFlows",
    "view.l4.eventGraph.kind": "kind: event-graph",
    "view.l4.eventGraph.state": "state ({count} keys)",
    "view.l4.eventGraph.handlers": "handlers ({count})",
    "view.l4.stateMachine.kind": "kind: state-machine",
    "view.l4.stateMachine.entity": "entity",
    "view.l4.stateMachine.initialState": "initialState",
    "view.l4.stateMachine.states": "states ({count})",
    "view.l4.stateMachine.transitions": "transitions ({count})",
    "view.l3.title": "L3 Logic Blocks ({count} blocks)",
    "view.l3.pins": "pins",
    "view.l3.validate": "validate",
    "view.l3.constraints": "constraints",
    "view.l3.description": "description",
    "view.l2.title": "L2 Code Blocks ({count} blocks)",
    "view.l2.language": "language",
    "view.l2.blockRef": "blockRef",
    "view.l2.status": "status",
    "view.l2.files": "files",
    "view.common.notFound": "[not found]",
    "view.common.synced": "synced ✓",
    "view.common.drift": "drift ⚠",
    "view.common.syncedShort": "synced",
    "view.common.driftShort": "drift",
    "view.common.l3Blocks": "L3 blocks ({count})",
    "view.common.l5Ref": "L5",

    // ── cli.* ──
    "cli.init.alreadyExists":
      ".svp/ directory already exists. Use `forge check` to validate or `forge view` to inspect.",
    "cli.init.initialized": "Initialized .svp/ in {root}",
    "cli.init.dirStructure": "Directory structure:",
    "cli.init.nextEdit":
      "Next: edit .svp/l5.json to add domains, constraints, and integrations.",
    "cli.init.nextSvp": "Next: use /forge to start the interactive SVP workflow.",
    "cli.init.slashCommands":
      "{host}: {count} skill files → {skillDir}/",
    "cli.init.claudeMdSection": "{host}: SVP section → {contextFile}",
    "cli.init.claudeMdSkipped":
      "{host}: {contextFile} already contains SVP section (skipped)",
    "cli.error.loadFailed":
      'Error: cannot load .svp/ data from "{root}". Run `forge init` first.',
    "cli.error.l3NotFound": 'Error: L3 block "{id}" not found in .svp/l3/',
    "cli.error.l4NotFound": 'Error: L4 flow "{id}" not found in .svp/l4/',
    "cli.error.l5NotFound":
      "Error: L5 blueprint not found. Design L5 first with `forge prompt design-l5`.",
    "cli.error.invalidKind":
      'Error: invalid --kind "{kind}". Must be flow, event-graph, or state-machine.',
    "cli.error.stepOutOfRange":
      "Error: step index {step} is out of range (0-{max})",
    "cli.error.blockNotFound":
      'Error: block "{blockId}" not found in L4 artifact "{flow}" (kind: {kind})',
  },

  zh: {
    // ── check.* ──
    "check.hashMismatch.l5":
      "L5 contentHash 不匹配：存储值={stored}，计算值={computed}",
    "check.hashMismatch.l4":
      'L4 "{name}" contentHash 不匹配：存储值={stored}，计算值={computed}',
    "check.hashMismatch.l3":
      'L3 "{name}" contentHash 不匹配：存储值={stored}，计算值={computed}',
    "check.hashMismatch.l2":
      'L2 "{id}" contentHash 不匹配：存储值={stored}，计算值={computed}',
    "check.missingBlockRef.l4FlowStep":
      'L4 "{flowName}" 步骤 "{stepId}" 引用了不存在的 L3 block "{blockRef}"',
    "check.missingFlowRef":
      'L4 "{flowName}" 步骤 "{stepId}" 引用了不存在的 L4 flow "{flowRef}"',
    "check.missingBlockRef.l4EventGraphStep":
      'L4 "{egName}" 处理器 "{handlerId}" 步骤 "{stepId}" 引用了不存在的 L3 block "{blockRef}"',
    "check.missingBlockRef.l4SmOnEntry":
      'L4 "{smName}" 状态 "{stateName}" 的 onEntry 引用了不存在的 L3 block "{blockRef}"',
    "check.missingBlockRef.l4SmOnExit":
      'L4 "{smName}" 状态 "{stateName}" 的 onExit 引用了不存在的 L3 block "{blockRef}"',
    "check.missingBlockRef.l4SmGuard":
      'L4 "{smName}" 转换 "{from}" → "{to}" 的 guard 引用了不存在的 L3 block "{guard}"',
    "check.missingBlockRef.l2":
      'L2 "{id}" 引用了不存在的 L3 block "{blockRef}"',
    "check.missingStepRef.next":
      'L4 "{parentName}" 步骤 "{stepId}" 的 next 引用了不存在的步骤 "{next}"',
    "check.missingStepRef.branch":
      'L4 "{parentName}" 步骤 "{stepId}" 的 branch 引用了不存在的步骤 "{branchId}"',
    "check.missingStepRef.wait":
      'L4 "{parentName}" 步骤 "{stepId}" 的 waitFor 引用了不存在的步骤 "{waitId}"',
    "check.invalidDataFlowFormat":
      'L4 "{flowName}" dataFlow {direction} "{endpoint}" 格式无效，应为 "stepId.pinName"',
    "check.missingStepRef.dataFlow":
      'L4 "{flowName}" dataFlow {direction} 引用了不存在的步骤 "{stepId}"',
    "check.missingPin":
      'L4 "{flowName}" dataFlow {direction} "{endpoint}"：在 L3 block "{blockRef}" 上未找到 pin "{pinName}"',
    "check.invalidDataFlowFormat.eventGraph":
      'L4 "{egName}" 处理器 "{handlerId}" dataFlow {direction} "{endpoint}" 格式无效',
    "check.missingStateRef":
      'L4 "{egName}" 处理器 "{handlerId}" dataFlow {direction} 引用了未声明的 state key "{field}"',
    "check.sourceDrift":
      'L2 "{id}" 的 sourceHash ({sourceHash}) 与 L3 "{blockRef}" 的 contentHash ({l3Hash}) 不匹配：L3 自上次编译以来已变更',
    "check.contentDrift":
      'L2 "{id}" signatureHash 不匹配：L1 导出签名自上次同步以来已变更',
    "check.selfReferencingFlow":
      'L4 "{flowName}" 步骤 "{stepId}" 调用了自身（递归 flow 引用）',
    "check.duplicateEvent":
      'L4 "{egName}" 存在重复的事件处理器 "{event}"',
    "check.emptyState":
      'L4 "{egName}" event-graph 没有 state 声明',
    "check.invalidInitialState":
      'L4 "{smName}" 的 initialState "{initialState}" 不在 states 中',
    "check.invalidTransition.from":
      'L4 "{smName}" 转换的 from "{from}" 引用了不存在的状态',
    "check.invalidTransition.to":
      'L4 "{smName}" 转换的 to "{to}" 引用了不存在的状态',
    "check.unreachableState":
      'L4 "{smName}" 状态 "{stateName}" 从 initialState "{initialState}" 不可达',
    "check.nextCycle":
      'L4 "{entityName}" 在 next 链中存在环，涉及步骤 "{current}"',
    "check.orphanStep":
      'L4 "{entityName}" 步骤 "{stepId}" 从第一个步骤不可达',
    "check.missingLanguage":
      "L5 blueprint 未设置 language 字段 — 建议添加语言偏好",

    // ── compilePlan.* ──
    "compilePlan.reason.missingL2":
      'L3 block "{name}" 没有对应的 L2 code block — 需要初始编译',
    "compilePlan.reason.sourceDrift":
      "L3 契约自上次编译以来已变更 — L2 代码已过时",
    "compilePlan.reason.contentDrift":
      "L1 导出签名已变更 — 请审查 L3 契约是否仍与代码匹配",
    "compilePlan.reason.missingBlockRef":
      "Flow 引用了缺失的 L3 block — 需要更新步骤或重建 L3",
    "compilePlan.reason.missingL2BlockRef":
      "L2 code block 引用了缺失的 L3 block — 孤立代码需要审查",
    "compilePlan.label.l3Contract": 'L3 契约 "{name}"',
    "compilePlan.label.currentL2": "当前 L2 映射 ({files})",
    "compilePlan.label.l2CodeBlock": "L2 代码块 ({files})",
    "compilePlan.label.l3Verify": 'L3 契约 "{name}" — 验证是否仍满足',
    "compilePlan.label.l4Flow": 'L4 flow "{name}"',
    "compilePlan.label.l5Blueprint": "L5 蓝图",
    "compilePlan.label.orphanedL2": "孤立的 L2 代码块",
    "compilePlan.label.l4FlowRef": 'L4 flow "{name}"（引用此 block）',

    // ── view.* ──
    "view.l5.intent": "意图",
    "view.l5.constraints": "约束",
    "view.l5.domains": "领域 ({count})",
    "view.l5.integrations": "集成 ({count})",
    "view.l4.title": "L4 逻辑链 ({count} 个制品)",
    "view.l4.flow.kind": "类型: flow",
    "view.l4.flow.trigger": "触发器",
    "view.l4.flow.steps": "步骤 ({count})",
    "view.l4.flow.dataFlows": "数据流",
    "view.l4.eventGraph.kind": "类型: event-graph",
    "view.l4.eventGraph.state": "状态 ({count} 个 key)",
    "view.l4.eventGraph.handlers": "处理器 ({count})",
    "view.l4.stateMachine.kind": "类型: state-machine",
    "view.l4.stateMachine.entity": "实体",
    "view.l4.stateMachine.initialState": "初始状态",
    "view.l4.stateMachine.states": "状态 ({count})",
    "view.l4.stateMachine.transitions": "转换 ({count})",
    "view.l3.title": "L3 逻辑块 ({count} 个 block)",
    "view.l3.pins": "接口",
    "view.l3.validate": "校验规则",
    "view.l3.constraints": "约束",
    "view.l3.description": "描述",
    "view.l2.title": "L2 代码块 ({count} 个 block)",
    "view.l2.language": "语言",
    "view.l2.blockRef": "block 引用",
    "view.l2.status": "状态",
    "view.l2.files": "文件",
    "view.common.notFound": "[未找到]",
    "view.common.synced": "已同步 ✓",
    "view.common.drift": "已漂移 ⚠",
    "view.common.syncedShort": "已同步",
    "view.common.driftShort": "已漂移",
    "view.common.l3Blocks": "L3 blocks ({count})",
    "view.common.l5Ref": "L5",

    // ── cli.* ──
    "cli.init.alreadyExists":
      ".svp/ 目录已存在。使用 `forge check` 校验或 `forge view` 查看。",
    "cli.init.initialized": "已在 {root} 初始化 .svp/",
    "cli.init.dirStructure": "目录结构：",
    "cli.init.nextEdit":
      "下一步：编辑 .svp/l5.json 添加领域、约束和集成。",
    "cli.init.nextSvp": "下一步：使用 /forge 启动交互式 SVP 工作流。",
    "cli.init.slashCommands":
      "{host}: {count} 个 skill 文件 → {skillDir}/",
    "cli.init.claudeMdSection": "{host}: SVP 部分 → {contextFile}",
    "cli.init.claudeMdSkipped":
      "{host}: {contextFile} 已包含 SVP 部分（已跳过）",
    "cli.error.loadFailed":
      '错误：无法从 "{root}" 加载 .svp/ 数据。请先运行 `forge init`。',
    "cli.error.l3NotFound": '错误：在 .svp/l3/ 中未找到 L3 block "{id}"',
    "cli.error.l4NotFound": '错误：在 .svp/l4/ 中未找到 L4 flow "{id}"',
    "cli.error.l5NotFound":
      "错误：未找到 L5 blueprint。请先使用 `forge prompt design-l5` 设计 L5。",
    "cli.error.invalidKind":
      '错误：无效的 --kind "{kind}"。必须为 flow、event-graph 或 state-machine。',
    "cli.error.stepOutOfRange":
      "错误：步骤索引 {step} 超出范围 (0-{max})",
    "cli.error.blockNotFound":
      '错误：在 L4 制品 "{flow}" (类型: {kind}) 中未找到 block "{blockId}"',
  },
};
