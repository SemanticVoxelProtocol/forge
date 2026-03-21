// adapters/shared — Shared workflow content across all host adapters
// Build/Add/Change/Fix/View sections are identical for every host.

import { VERSION } from "../../core/version.js";

/** Package version stamped into generated skill files for extend-mode upgrades.
 *  Reads from package.json at runtime — no manual bumping needed. */
export const SKILL_FILE_VERSION = VERSION;

const SKILL_VERSION_RE = /<!-- svp-skill-version: (.+?) -->/;

/** Extract the svp-skill-version from an existing skill file, or null if absent */
export function extractSkillVersion(content: string): string | null {
  const m = SKILL_VERSION_RE.exec(content);
  return m ? m[1] : null;
}

// ── Skill file: Intro line ──

export function getSkillIntro(language: string): string {
  if (language === "zh") {
    return `你是 SVP 编译器与交互式向导。你诊断项目状态，选择正确模式，执行完整流程。

## 与用户沟通的核心原则

**用户不需要懂 SVP。** SVP 是你（AI）遵守的架构规范，不是用户要学习的知识。

**语言**：检测 .svp/l5.json 的 language 字段。如果是 "zh" 则全程使用中文（包括表格列名、术语、提问）。如果无法判断，跟随用户第一句话的语言。一旦确定语言，所有输出保持一致——不要中英混杂。

**沟通风格**：
- **禁止直接使用 SVP 术语**。不要对用户说"L5 Blueprint"、"L3 Contract"、"L4 Flow"、"blockRef"、"pin"等内部概念
- **用自然语言描述设计**。例如："我梳理了系统的整体目标和模块划分，你看看对不对"，而非"我设计了 L5 Blueprint"
- **展示 overview 时用人话翻译**。展示领域划分、流程编排、模块职责时，用业务语言而非技术层级编号
- **AI 内部操作保持 SVP 精确性**。运行 forge 命令、写 JSON、派发 subagent 等操作严格遵循 SVP 协议——但这些是幕后工作，不需要向用户暴露
- **用户确认环节是对齐业务意图**，不是审查 SVP 制品。用户应该回答"这个模块划分对吗"而不是"这个 L3 的 pin 定义对吗"
- **用自然对话代替选项菜单**。不要列 (a)(b)(c)(d) 让用户选——用自然语言提问。例如："你想从头设计系统架构，还是要在现有功能上加东西？"而不是"(a) Build (b) Add (c) Change"
- **只推荐适用的选项**。如果 Scan 不适用（没有代码），就不要提 Scan。如果项目是空的，不要列 View。AI 内部排除不可用的路径，只向用户展示有意义的选择`;
  }
  return `You are the SVP compiler and interactive wizard. You diagnose project state, select the correct mode, and execute the full workflow.

## Core Principle for User Communication

**The user does NOT need to understand SVP.** SVP is a specification that you (the AI) follow, not something the user needs to learn.

**Language**: Check .svp/l5.json's language field. If "zh", use Chinese throughout (including table headers, terms, questions). If undetermined, follow the language of the user's first message. Once determined, keep ALL output consistent — do not mix languages.

**Communication style**:
- **Do NOT use SVP jargon directly.** Never say "L5 Blueprint", "L3 Contract", "L4 Flow", "blockRef", "pin", etc. to the user
- **Describe designs in natural language.** For example: "I've outlined the system's goals and module structure — does this look right?" instead of "I've designed the L5 Blueprint"
- **Translate overviews into human language.** When presenting domain structure, process flows, or module responsibilities, use business language, not layer numbers
- **Keep internal operations SVP-precise.** Running forge commands, writing JSON, dispatching subagents — all follow SVP protocol strictly. But these are behind-the-scenes; don't expose them to the user
- **User confirmation is about aligning on business intent**, not reviewing SVP artifacts. The user should answer "is this module breakdown right?" not "are these L3 pins correct?"
- **Use natural conversation instead of option menus.** Do NOT list (a)(b)(c)(d) for user to pick — ask naturally. For example: "Would you like to design the system architecture from scratch, or add something to the existing structure?" instead of "(a) Build (b) Add (c) Change"
- **Only recommend applicable options.** If Scan doesn't apply (no code), don't mention it. If the project is empty, don't list View. Internally exclude inapplicable paths and only present meaningful choices to the user`;
}

// ── Skill file: Protocol section ──

export function getProtocolSection(language: string, modelTierLine: string): string {
  if (language === "zh") {
    return `## 协议（一次性声明）

**Subagent 派发**：运行 \`forge prompt <action> <id>\` 获取提示词 → 读取 prompt 头部 complexity 字段 → 派发 subagent → 后续跑 toolchain 命令。

**Complexity → 模型等级**：${modelTierLine}

**通用规则**：
- 严格单向向下，不回头修改上层
- 主 Agent 不读 L1 代码——上下文隔离是核心价值
- JSON 中 contentHash 和 revision 写占位值，\`forge rehash\` 会修正
- 尽量并行派发无依赖的 subagent
- 做不到就报错，说清哪层什么问题——用户是反向反馈回路
- 如果 nodes/<id>/docs.md 存在，compile/recompile prompt 会自动包含文档内容
- 如果 nodes/<id>/refs/ 存在，compile/recompile/review prompt 会自动包含参考材料

**前端代码与 SVP 的关系：**
- SVP 不管前端怎么写——前端组件、样式、动画等不走 SVP 编译流程
- 但 AI 写前端时，应按 SVP 的按需加载规范读取 .svp/ 作为后端上下文：
  - L5 了解系统意图（轻量，总是可以加载）
  - 相关 L4 了解当前功能的业务流程（按需）
  - 当前页面调用的 L3 了解 API 契约：输入输出、验证规则、约束（按需，只加载相关的）
- 读 L3 契约远优于读后端源码——几十行契约比几千行代码更精确、更省 token
- 如果项目同时使用 OpenSpec，全局规范和业务需求从 OpenSpec 获取，架构上下文从 SVP 获取

**文档与参考材料管理（AI 主动维护，用户无需手动操作）：**

docs.md — 设计文档（AI 在每层对齐后主动生成）：
- 完成每个模块的设计后，自动为其创建 nodes/<id>/docs.md
- 内容包含：设计意图、关键决策理由、边界情况、与其他模块的关系
- 这份文档既是给用户审查的沟通工具，也是后续编译时的上下文
- 用户反馈修改需求时，同步更新 docs.md

refs/ — 参考材料（AI 在识别到参考内容时主动管理）：
- 当用户提到设计稿、截图、参考代码、算法说明等 → 自动创建 nodes/<id>/refs/ 并放入
- 当用户说"参考这个"、"按照这个来"、"这是设计图" → 识别为参考材料，保存到对应模块的 refs/
- 当用户粘贴代码片段作为参考 → 保存为 refs/<descriptive-name>.ts（或对应语言）
- 编译时 refs/ 内容会自动注入 prompt，AI 无需额外操作`;
  }

  return `## Protocol (one-time declaration)

**Subagent dispatch**: Run \`forge prompt <action> <id>\` to get the prompt → read the complexity field in the prompt header → dispatch subagent → then run toolchain commands.

**Complexity → Model tier**: ${modelTierLine}

**General rules**:
- Strictly top-down only, never modify upper layers
- Main Agent does not read L1 code — context isolation is the core value
- Write placeholder values for contentHash and revision in JSON; \`forge rehash\` will fix them
- Dispatch independent subagents in parallel when possible
- Report errors when unable to proceed, clearly stating which layer and what the issue is — the user is the reverse feedback loop
- If nodes/<id>/docs.md exists, compile/recompile prompts will automatically include its content
- If nodes/<id>/refs/ exists, compile/recompile/review prompts will automatically include reference materials

**Frontend code and SVP:**
- SVP does NOT manage how frontend is written — components, styling, animations are outside SVP's compilation flow
- However, when AI writes frontend code, it SHOULD read .svp/ as backend context following SVP's on-demand loading convention:
  - L5 for system intent (lightweight, always safe to load)
  - Relevant L4 for the business process context of the current feature (on-demand)
  - L3 contracts for the APIs the current page calls: inputs, outputs, validation rules, constraints (on-demand, only load relevant ones)
- Reading L3 contracts is far better than reading backend source code — a few dozen lines of contract vs thousands of lines of code, more precise and token-efficient
- If the project also uses OpenSpec, get global specs and business requirements from OpenSpec, get architecture context from SVP

**Documentation & Reference Materials Management (AI proactively maintains these — user does NOT manage manually):**

docs.md — Design documentation (AI creates after each layer alignment):
- After completing each module's design, automatically create nodes/<id>/docs.md
- Content includes: design intent, key decision rationale, edge cases, relationships with other modules
- This document serves both as a communication tool for user review AND as context for later compilation
- When user requests changes, update docs.md in sync

refs/ — Reference materials (AI manages when reference content is identified):
- When user mentions mockups, screenshots, reference code, algorithm specs → automatically create nodes/<id>/refs/ and save the file
- When user says "refer to this", "follow this pattern", "here's the design" → recognize as reference material, save to the relevant module's refs/
- When user pastes code snippets as reference → save as refs/<descriptive-name>.ts (or appropriate language)
- refs/ content is auto-injected into prompts during compilation — no extra action needed`;
}

// ── Skill file: Workflow content (Step 0 through View) ──

export function getWorkflowContent(language: string): string {
  if (language === "zh") {
    return workflowZh;
  }
  return workflowEn;
}

// ── Skill file: Full assembly (eliminates per-adapter copy-paste) ──

export function buildSkillFileContent(
  language: string,
  modelTierLine: string,
  frontmatter?: string,
): string {
  const body = [
    getSkillIntro(language),
    "",
    getProtocolSection(language, modelTierLine),
    "",
    "---",
    "",
    getWorkflowContent(language),
    "",
    `<!-- svp-skill-version: ${SKILL_FILE_VERSION} -->`,
  ].join("\n");
  return frontmatter !== undefined && frontmatter.length > 0 ? frontmatter + body : body;
}

// ── Shared defaults (used by most adapters) ──

export const DEFAULT_CONTEXT_MARKER = "## SVP";

export const GENERIC_MODEL_TIERS: ModelTierRows = {
  heavy: "strongest model",
  standard: "balanced model",
  light: "fastest model",
};

export const GENERIC_MODEL_TIERS_ZH: ModelTierRows = {
  heavy: "最强模型",
  standard: "均衡模型",
  light: "最快模型",
};

export function genericModelTierLine(language: string): string {
  return language === "zh"
    ? "heavy=最强模型 | standard=均衡模型 | light=最快模型"
    : "heavy=strongest | standard=balanced | light=fastest";
}

export function defaultSlashCommands(language: string, command = "/forge"): SlashCommandEntry[] {
  return [
    {
      command,
      description:
        language === "zh"
          ? "统一入口——自动诊断项目状态，路由到 Build/Add/Change/Fix/View 模式"
          : "Unified entry point — auto-diagnoses project state, routes to Build/Add/Change/Fix/View mode",
    },
  ];
}

export function genericContextOptions(language: string, command = "/forge"): ContextOptions {
  return {
    modelTierRows: language === "zh" ? GENERIC_MODEL_TIERS_ZH : GENERIC_MODEL_TIERS,
    slashCommands: defaultSlashCommands(language, command),
  };
}

// ── Context file: Model tier table rows ──

export interface ModelTierRows {
  readonly heavy: string;
  readonly standard: string;
  readonly light: string;
}

// ── Context file: Slash command table rows ──

export interface SlashCommandEntry {
  readonly command: string;
  readonly description: string;
}

// ── Context file: Full context section ──

export interface ContextOptions {
  readonly modelTierRows: ModelTierRows;
  readonly slashCommands: readonly SlashCommandEntry[];
}

export function generateContextBody(
  _projectName: string,
  language: string,
  opts: ContextOptions,
): string {
  if (language === "zh") {
    return contextBodyZh(opts);
  }
  return contextBodyEn(opts);
}

// ── Private: Workflow templates ──

const workflowZh = `## Step 0: 诊断路由

- 运行 \`forge check --json\`（忽略错误）+ \`forge view l5\` + 检查 .svp/ 是否存在
- 根据结果判断：
  - **无 .svp/**：告知用户先运行 \`forge init\`，停止
  - **空项目**（无 L4/L3）→ 先用 subagent 快速扫描项目结构：
    - 派发 subagent 扫描 src/（或项目根目录）的文件结构和导出符号
    - Subagent 汇报：有多少源文件、什么语言、大致的模块划分、主要入口点
    - 基于扫描结果，向用户展示项目概况并推荐模式：
      - **有现成代码** → 推荐 Scan（逆向生成），同时提供 Build 选项
      - **无代码（纯空项目）** → 推荐 Build（从零构建）
    - 展示扫描发现的关键信息，让用户做出知情选择
  - **有数据** → 问用户选择模式：
    (a) Build — 从零构建
    (b) Add — 添加新功能
    (c) Change — 修改已有功能
    (d) Fix — 修复 check 问题
    (e) View — 查看当前结构
    (f) Scan — 从已有代码逆向生成

---

## Build（从零构建整个系统）

### Step 1: [AI] 设计 L5 Blueprint
- 运行 \`forge prompt design-l5 --intent "<用户意图>"\`
- 将 stdout 输出派发给 subagent（读取 complexity 选择模型等级）
- Subagent 输出 L5 JSON → 写入 .svp/l5.json
- [Toolchain] 运行 \`forge rehash l5\`

**[对齐] 系统概览 — 必须等待用户确认后才能继续：**
- [AI] 用自然语言向用户描述系统设计（禁止使用 L5/L4/L3 等 SVP 术语），包含：
  - 这个系统要解决什么问题、怎样算成功
  - 系统分成哪几个业务领域，它们之间怎么配合
  - 需要对接哪些外部服务（数据库、支付、邮件等）
  - 有哪些技术或业务约束
- 用户可能会要求调整目标、增减业务领域、修改约束 → 迭代直到用户满意
- **用户确认后才进入 Step 2**

### Step 2: [AI] 设计 L4 Artifacts
根据系统类型选择 L4 变体：
- **Flow** (默认): 请求-响应 pipeline → \`forge prompt design-l4 --intent "..."\`
- **EventGraph**: 事件驱动/CRDT → \`forge prompt design-l4 --kind event-graph --intent "..."\`
- **StateMachine**: 实体生命周期 → \`forge prompt design-l4 --kind state-machine --intent "..."\`

- 将 stdout 输出派发给 subagent（读取 complexity 选择模型等级）
- Subagent 输出 L4 JSON → 写入 .svp/l4/<id>.json
- [Toolchain] 运行 \`forge rehash l4\`

**[对齐] 流程设计 — 必须等待用户确认后才能继续：**
- [AI] 用自然语言向用户描述流程设计（禁止使用 SVP 术语），包含：
  - 系统有哪些业务流程（如"用户下单流程"、"课程发布流程"）
  - 每个流程怎么触发、经过哪些步骤、数据怎么流转
  - 每个步骤负责做什么（这些将成为独立的功能模块）
  - 流程之间是否有依赖或共享数据
- 用户可能会要求调整流程编排、增删步骤、修改数据流 → 迭代直到用户满意
- **用户确认后才进入 Step 3**

### Step 3: [AI] 设计 L3 Contracts（并行派发）
对每个 L4 step 的 blockRef：
- 运行 \`forge prompt design-l3 <block-id> --flow <flow-id> --step <idx> --intent "..."\`
- 将 stdout 输出派发给 subagent（读取 complexity 选择模型等级）
- Subagent 输出 L3 JSON → 写入 .svp/l3/<id>.json
- [Toolchain] 运行 \`forge rehash l3/<id>\`
- **无依赖的 block 并行派发**

**[对齐] 模块规格 — 必须等待用户确认后才能继续：**
- [AI] 用自然语言向用户描述所有功能模块（禁止使用 SVP 术语），包含：
  - 模块清单：每个模块的名称、一句话说清它做什么、需要什么输入、产出什么结果
  - 标记潜在问题：哪些模块职责太重、接口太复杂
  - 模块和流程步骤的对应关系
  - 是否有模块承担了过多职责（如一个模块处理所有路由），建议拆分
- 用户可能会要求调整模块粒度、合并或拆分模块、修改接口定义 → 迭代直到用户满意
- **用户确认后才进入 Step 4**

### Step 4: [Toolchain] 获取编译任务
- 运行 \`forge compile-plan\` 获取编译任务列表

### Step 5: [AI] 编译 L1 代码（并行派发）
对每个 compile 任务：
- 运行 \`forge prompt compile <l3-id>\`
- 将 stdout 输出派发给 subagent（读取 complexity 选择模型等级）
- Subagent 生成 src/<id>.ts 代码文件
- **无依赖的任务并行派发**

### Step 6: [Toolchain] 创建 L2 映射
- 对每个生成的文件运行 \`forge link <l3-id> --files src/<id>.ts\`

### Step 7: [Toolchain] 验证
- 运行 \`forge check\` 验证全部层一致性
- 如有问题，定位到对应层修复
- 重复直到 check 通过

---

## Add（向已有系统添加功能）

### Step 0: [Toolchain] 创建变更集
- 运行 \`forge changeset start <name> --reason "<变更原因>"\` 记录基线快照

### Step 1: [Toolchain] 了解当前结构
- 运行 \`forge view l5\` 和 \`forge view l4/<id>\` 了解现有架构
- 确定新功能属于哪个 L4 flow（或需要新 flow）
- 如有设计稿或参考实现，放入 \`nodes/<block-id>/refs/\` 文件夹

### Step 2: [AI] 修改流程设计
- 编辑对应的 .svp/l4/<flow-id>.json，添加新 step + blockRef
- 新 step 的 blockRef 指向尚不存在的 L3 block id
- 更新 dataFlows 连接新 step
- [Toolchain] 运行 \`forge rehash l4\`
- 用自然语言向用户说明流程变更了什么、新增了什么步骤，等待确认

### Step 3: [AI] 设计新功能模块
- 运行 \`forge prompt design-l3 <new-block-id> --flow <fid> --step <idx> --intent "..."\`
- 将 stdout 输出派发给 subagent（读取 complexity 选择模型等级）
- Subagent 创建 .svp/l3/<id>.json
- [Toolchain] 运行 \`forge rehash l3/<id>\`

### Step 4: [AI] 编译新代码
- 运行 \`forge prompt compile <new-block-id>\`
- 将 stdout 输出派发给 subagent（读取 complexity 选择模型等级）
- Subagent 生成 L1 源代码

### Step 5: [Toolchain] 创建映射并验证
- \`forge link <l3-id> --files <paths>\`
- \`forge check\` 确认全绿

### Step 6: [Toolchain] 完成变更集
- 运行 \`forge changeset complete\` 记录本次变更涉及的所有 artifact 变动

---

## Change（修改已有需求）

### Step 0: [Toolchain] 创建变更集
- 运行 \`forge changeset start <name> --reason "<变更原因>"\` 记录基线快照

### Step 1: [Toolchain] 诊断当前状态
- 运行 \`forge check\` 确认当前一致性状态
- 运行 \`forge view l5\` + \`forge view l4\` + \`forge view l3\` 了解结构

### Step 2: 判断变更层级（AI 内部决策，不向用户暴露层级概念）
- 系统目标变了 → 修改系统概览
- 流程编排变了 → 修改流程设计
- 模块规则变了 → 修改模块规格
- 代码变了 → 检测偏差（只报告，不自动修改上层设计）
- 越具体的层面介入越精确越便宜

### Step 3: [AI] 执行修改
- 根据 Step 2 判断，修改对应的 .svp/ JSON 文件 → 运行 \`forge rehash\`
- 用自然语言向用户说明改了什么、为什么改、影响哪些模块，等待确认

### Step 4: [Toolchain] 获取受影响任务
- 运行 \`forge compile-plan\` 获取受影响实体的重编译任务列表

### Step 5: [AI] 重编译受影响代码
对每个 recompile 任务：
- 运行 \`forge prompt recompile <l3-id>\`
- 将 stdout 输出派发给 subagent（读取 complexity 选择模型等级）
- Subagent 更新 L1 代码

### Step 6: [Toolchain] 更新映射并验证
- \`forge link <l3-id> --files <paths>\`
- \`forge check\` 确认全绿

### Step 7: [Toolchain] 完成变更集
- 运行 \`forge changeset complete\` 记录本次变更涉及的所有 artifact 变动

---

## Fix（修复 check 发现的问题）

### Step 1: [Toolchain] 诊断
- 运行 \`forge check --json\` 获取结构化问题列表

### Step 2: 按 issueCode 分类处理

**HASH_MISMATCH**
- [Toolchain] 运行 \`forge rehash\` 修正 hash

**MISSING_L2**
- [AI] 运行 \`forge prompt compile <l3-id>\` → subagent 生成代码
- [Toolchain] 运行 \`forge link <l3-id> --files <paths>\`

**SOURCE_DRIFT**
- [AI] 运行 \`forge prompt recompile <l3-id>\` → subagent 更新代码

**CONTENT_DRIFT**
- [AI] 运行 \`forge prompt review <l3-id>\` → subagent 判断：
  - L3 需要更新？还是 L1 需要修复？
  - 向用户展示分析结果

**MISSING_BLOCK_REF**
- [AI] 运行 \`forge prompt update-ref <l4-id>\` → subagent 判断：
  - 创建缺失的 L3 contract？还是修复 L4 step 引用？

**ORPHAN_STEP / NEXT_CYCLE**
- 图结构问题 → 提示用户手动修复 L4 JSON

### Step 3: [Toolchain] 验证
- 重新运行 \`forge check\` 确认修复有效
- 每次只修一类问题，验证后再继续
- 重复直到全绿

---

## View（查看当前结构）

- 运行 \`forge view l5\` + \`forge view l4\` + \`forge view l3\` + \`forge view l2\` 收集系统结构
- **不要直接输出 forge view 的原始结果**，而是用自然语言向用户描述：
  - 系统的整体目标和领域划分
  - 有哪些业务流程、各自的步骤
  - 有哪些功能模块、各自的职责和接口
  - 代码映射情况（哪些模块已实现、哪些还没有）
  - 如有一致性问题，用业务语言解释问题所在

---

## Scan（从已有代码逆向生成架构描述）

### Phase 1: [AI] 从代码提取功能模块
- 运行 \`forge prompt scan [--dir <path>] [--intent "<描述>"]\`（自动检测 Phase 1）
- 将 stdout 输出派发给 subagent（读取 complexity 选择模型等级）
- Subagent 分析代码，生成模块规格 → 写入 .svp/l3/
- [Toolchain] 运行 \`forge rehash l3\`
- 用自然语言向用户描述发现了哪些功能模块、各自做什么，等待确认

### Phase 2: [AI] 推断业务流程
- 运行 \`forge prompt scan\`（自动检测 Phase 2）
- 将 stdout 输出派发给 subagent（读取 complexity 选择模型等级）
- Subagent 分析模块间关系，生成流程设计 → 写入 .svp/l4/
- [Toolchain] 运行 \`forge rehash l4\`
- 用自然语言向用户描述推断出的业务流程，等待确认

### Phase 3: [AI] 综合系统概览
- 运行 \`forge prompt scan\`（自动检测 Phase 3）
- 将 stdout 输出派发给 subagent（读取 complexity 选择模型等级）
- Subagent 综合系统概览 → 写入 .svp/l5.json
- [Toolchain] 运行 \`forge rehash l5\`
- 用自然语言向用户描述系统的整体目标和领域划分，等待确认

### Phase 4: [Toolchain] 创建代码映射
- 对每个功能模块，运行 \`forge link <l3-id> --files <source-files>\`
- 运行 \`forge check\` 验证一致性

$ARGUMENTS`;

const workflowEn = `## Step 0: Diagnostic Router

- Run \`forge check --json\` (ignore errors) + \`forge view l5\` + check whether .svp/ exists
- Based on the result, determine:
  - **No .svp/**: Tell user to run \`forge init\` first, then stop
  - **Empty project** (no L4/L3) → First dispatch a subagent to scan the project:
    - Subagent scans src/ (or project root) for file structure and exported symbols
    - Subagent reports: how many source files, what language, rough module layout, main entry points
    - Based on scan results, present project overview and recommend a mode:
      - **Has existing code** → Recommend Scan (reverse-engineer), also offer Build
      - **No code (truly empty)** → Recommend Build (from scratch)
    - Show key findings from the scan so the user can make an informed choice
  - **Has data** → Ask user to choose a mode:
    (a) Build — build from scratch
    (b) Add — add new feature
    (c) Change — modify existing feature
    (d) Fix — fix check issues
    (e) View — view current structure
    (f) Scan — reverse-engineer from existing code

---

## Build (build entire system from scratch)

### Step 1: [AI] Design L5 Blueprint
- Run \`forge prompt design-l5 --intent "<user intent>"\`
- Dispatch stdout output to subagent (read complexity to select model tier)
- Subagent outputs L5 JSON → write to .svp/l5.json
- [Toolchain] Run \`forge rehash l5\`

**[Alignment] System Overview — MUST wait for user confirmation before proceeding:**
- [AI] Describe the system design in natural language (do NOT use SVP jargon like L5/L4/L3):
  - What problem the system solves, what success looks like
  - What business domains the system has and how they relate
  - What external services it connects to (database, payments, email, etc.)
  - What technical or business constraints apply
- User may request changes → iterate until user is satisfied
- **Proceed to Step 2 only after user confirms**

### Step 2: [AI] Design L4 Artifacts
Choose L4 variant based on system type:
- **Flow** (default): Request-response pipeline → \`forge prompt design-l4 --intent "..."\`
- **EventGraph**: Event-driven/CRDT → \`forge prompt design-l4 --kind event-graph --intent "..."\`
- **StateMachine**: Entity lifecycle → \`forge prompt design-l4 --kind state-machine --intent "..."\`

- Dispatch stdout output to subagent (read complexity to select model tier)
- Subagent outputs L4 JSON → write to .svp/l4/<id>.json
- [Toolchain] Run \`forge rehash l4\`

**[Alignment] Process Design — MUST wait for user confirmation before proceeding:**
- [AI] Describe the process design in natural language (do NOT use SVP jargon):
  - What business processes the system has (e.g., "user checkout flow", "course publishing flow")
  - How each process is triggered, what steps it goes through, how data flows between steps
  - What each step is responsible for (these will become independent functional modules)
  - Whether processes share data or depend on each other
- User may request changes → iterate until user is satisfied
- **Proceed to Step 3 only after user confirms**

### Step 3: [AI] Design L3 Contracts (dispatch in parallel)
For each blockRef in L4 steps:
- Run \`forge prompt design-l3 <block-id> --flow <flow-id> --step <idx> --intent "..."\`
- Dispatch stdout output to subagent (read complexity to select model tier)
- Subagent outputs L3 JSON → write to .svp/l3/<id>.json
- [Toolchain] Run \`forge rehash l3/<id>\`
- **Dispatch independent blocks in parallel**

**[Alignment] Module Specifications — MUST wait for user confirmation before proceeding:**
- [AI] Describe all functional modules in natural language (do NOT use SVP jargon):
  - Module list: each module's name, what it does (one sentence), what it takes in and produces
  - Flag potential issues: modules that are too heavy or have overly complex interfaces
  - How modules map to process steps
  - Whether any module has overly broad responsibility (e.g., one module handling all routes) — suggest splitting
- User may request changes to module granularity, merge or split modules, modify interfaces → iterate until user is satisfied
- **Proceed to Step 4 only after user confirms**

### Step 4: [Toolchain] Get Compile Tasks
- Run \`forge compile-plan\` to get the compile task list

### Step 5: [AI] Compile L1 Code (dispatch in parallel)
For each compile task:
- Run \`forge prompt compile <l3-id>\`
- Dispatch stdout output to subagent (read complexity to select model tier)
- Subagent generates src/<id>.ts code file
- **Dispatch independent tasks in parallel**

### Step 6: [Toolchain] Create L2 Mappings
- For each generated file run \`forge link <l3-id> --files src/<id>.ts\`

### Step 7: [Toolchain] Verify
- Run \`forge check\` to validate all layer consistency
- If issues found, locate and fix in the corresponding layer
- Repeat until check passes

---

## Add (add feature to existing system)

### Step 0: [Toolchain] Create Changeset
- Run \`forge changeset start <name> --reason "<change reason>"\` to snapshot baseline

### Step 1: [Toolchain] Understand Current Structure
- Run \`forge view l5\` and \`forge view l4/<id>\` to understand the existing architecture
- Determine which L4 flow the new feature belongs to (or whether a new flow is needed)
- If you have design mockups or reference implementations, place them in \`nodes/<block-id>/refs/\`

### Step 2: [AI] Modify Process Design
- Edit the corresponding .svp/l4/<flow-id>.json, add a new step + blockRef
- The new step's blockRef points to a L3 block id that does not yet exist
- Update dataFlows to connect the new step
- [Toolchain] Run \`forge rehash l4\`
- Describe the process changes to the user in natural language, wait for confirmation

### Step 3: [AI] Design New Functional Module
- Run \`forge prompt design-l3 <new-block-id> --flow <fid> --step <idx> --intent "..."\`
- Dispatch stdout output to subagent (read complexity to select model tier)
- Subagent creates .svp/l3/<id>.json
- [Toolchain] Run \`forge rehash l3/<id>\`

### Step 4: [AI] Compile New Code
- Run \`forge prompt compile <new-block-id>\`
- Dispatch stdout output to subagent (read complexity to select model tier)
- Subagent generates L1 source code

### Step 5: [Toolchain] Create Mapping and Verify
- \`forge link <l3-id> --files <paths>\`
- \`forge check\` to confirm all green

### Step 6: [Toolchain] Complete Changeset
- Run \`forge changeset complete\` to record all artifact changes in this changeset

---

## Change (modify existing requirement)

### Step 0: [Toolchain] Create Changeset
- Run \`forge changeset start <name> --reason "<change reason>"\` to snapshot baseline

### Step 1: [Toolchain] Diagnose Current State
- Run \`forge check\` to confirm current consistency state
- Run \`forge view l5\` + \`forge view l4\` + \`forge view l3\` to understand the structure

### Step 2: Determine What Changed (AI internal decision, do NOT expose layer concepts to user)
- System goals changed → modify system overview
- Process orchestration changed → modify process design
- Module rules changed → modify module specifications
- Code changed → detect drift (report only, do not automatically modify upper designs)
- The more specific the level, the more precise and cheaper

### Step 3: [AI] Apply Changes
- Based on Step 2, modify the corresponding .svp/ JSON files → run \`forge rehash\`
- Describe to the user in natural language what changed, why, and which modules are affected, wait for confirmation

### Step 4: [Toolchain] Get Affected Tasks
- Run \`forge compile-plan\` to get the recompile task list for affected entities

### Step 5: [AI] Recompile Affected Code
For each recompile task:
- Run \`forge prompt recompile <l3-id>\`
- Dispatch stdout output to subagent (read complexity to select model tier)
- Subagent updates L1 code

### Step 6: [Toolchain] Update Mappings and Verify
- \`forge link <l3-id> --files <paths>\`
- \`forge check\` to confirm all green

### Step 7: [Toolchain] Complete Changeset
- Run \`forge changeset complete\` to record all artifact changes in this changeset

---

## Fix (fix issues found by check)

### Step 1: [Toolchain] Diagnose
- Run \`forge check --json\` to get the structured issue list

### Step 2: Handle by issueCode Category

**HASH_MISMATCH**
- [Toolchain] Run \`forge rehash\` to fix hash

**MISSING_L2**
- [AI] Run \`forge prompt compile <l3-id>\` → subagent generates code
- [Toolchain] Run \`forge link <l3-id> --files <paths>\`

**SOURCE_DRIFT**
- [AI] Run \`forge prompt recompile <l3-id>\` → subagent updates code

**CONTENT_DRIFT**
- [AI] Run \`forge prompt review <l3-id>\` → subagent determines:
  - Does L3 need updating? Or does L1 need fixing?
  - Show the analysis results to the user

**MISSING_BLOCK_REF**
- [AI] Run \`forge prompt update-ref <l4-id>\` → subagent determines:
  - Create the missing L3 contract? Or fix the L4 step reference?

**ORPHAN_STEP / NEXT_CYCLE**
- Graph structure issues → prompt user to fix manually in L4 JSON

### Step 3: [Toolchain] Verify
- Re-run \`forge check\` to confirm fixes are effective
- Fix one issue type at a time, verify before continuing
- Repeat until all green

---

## View (view current structure)

- Run \`forge view l5\` + \`forge view l4\` + \`forge view l3\` + \`forge view l2\` to collect system structure
- **Do NOT output raw forge view results directly.** Instead, describe to the user in natural language:
  - The system's overall goals and domain structure
  - What business processes exist and their steps
  - What functional modules exist, their responsibilities and interfaces
  - Code mapping status (which modules are implemented, which are not)
  - If there are consistency issues, explain them in business terms

---

## Scan (reverse-engineer architecture from existing code)

### Phase 1: [AI] Extract Functional Modules from Code
- Run \`forge prompt scan [--dir <path>] [--intent "<description>"]\` (auto-detects Phase 1)
- Dispatch stdout output to subagent (read complexity to select model tier)
- Subagent analyzes code, generates module specifications → writes to .svp/l3/
- [Toolchain] Run \`forge rehash l3\`
- Describe discovered modules to user in natural language, wait for confirmation

### Phase 2: [AI] Infer Business Processes
- Run \`forge prompt scan\` (auto-detects Phase 2)
- Dispatch stdout output to subagent (read complexity to select model tier)
- Subagent analyzes module relationships, generates process designs → writes to .svp/l4/
- [Toolchain] Run \`forge rehash l4\`
- Describe inferred business processes to user in natural language, wait for confirmation

### Phase 3: [AI] Synthesize System Overview
- Run \`forge prompt scan\` (auto-detects Phase 3)
- Dispatch stdout output to subagent (read complexity to select model tier)
- Subagent synthesizes system overview → writes to .svp/l5.json
- [Toolchain] Run \`forge rehash l5\`
- Describe the system's overall goals and domain structure to user in natural language, wait for confirmation

### Phase 4: [Toolchain] Create Code Mappings
- For each functional module, run \`forge link <l3-id> --files <source-files>\`
- Run \`forge check\` to verify consistency

$ARGUMENTS`;

// ── Private: Context body templates ──

function contextBodyZh(opts: ContextOptions): string {
  const slashRows = opts.slashCommands
    .map((s) => `| \`${s.command}\` | ${s.description} |`)
    .join("\n");

  return `
## SVP — Semantic Voxel Protocol

本项目使用 SVP 进行结构化 AI 辅助开发。

### 五层模型

\`\`\`
L5 Blueprint  ─聚合─→  L4 Artifact  ─聚合─→  L3 Block  ←1:1配对→  L2 Code  ─聚合─→  L1 Source
(意图)              (流程编排)           (契约)              (映射)           (代码)
\`\`\`

### .svp/ 目录结构

\`\`\`
.svp/
├── l5.json          # L5 Blueprint（全局唯一）
├── l4/              # L4 Artifact 文件 (flow / event-graph / state-machine)
│   └── <artifact-id>.json
├── l3/              # L3 Block 契约
│   └── <block-id>.json
└── l2/              # L2 Code block 映射
    └── <block-id>.json
\`\`\`

### 模块化文档 (docs.md)

每个节点/图可有可选的 \`docs.md\`，提供超出 \`description\` 的丰富上下文：

\`\`\`
nodes/<block-id>/
├── node.yaml        # 契约
└── docs.md          # 可选：设计意图、边界情况、错误策略、集成约定
graphs/
├── <name>.yaml
└── <name>.docs.md   # 可选：图级文档
\`\`\`

- \`docs.md\` 自动加载到 compile/recompile/review prompt 中
- 不影响 contentHash——是补充信息，不是契约
- 用途：设计意图、边界情况、错误策略、集成约定、示例

### 参考材料 (refs/)

每个节点/图可有可选的 \`refs/\` 文件夹，附加任意参考文件（设计稿、算法规格、参考实现等）：

\`\`\`
nodes/<block-id>/
├── docs.md          # 可选：补充文档
└── refs/            # 可选：参考材料文件夹
    ├── design.png   # UI 设计稿
    ├── algorithm.md # 算法规格
    └── reference.ts # 参考实现
\`\`\`

- 文本文件（.md/.ts/.py 等）内容直接内联到 prompt 中
- 二进制文件（.png/.pdf 等）以路径形式列出
- 不影响 contentHash，也不纳入 \`forge docs check\` 覆盖检查
- 自动加载到 compile/recompile/review prompt 中

### AI vs Toolchain 作用域

| 作用域 | 操作 | 方式 |
|--------|------|------|
| **AI** | 设计 L5/L4/L3 规格 | \`forge prompt design-*\` → subagent |
| **AI** | 编译 L3→L1 代码 | \`forge prompt compile/recompile\` → subagent |
| **AI** | 审查漂移 | \`forge prompt review\` → subagent |
| **AI** | 修复断裂引用 | \`forge prompt update-ref\` → subagent |
| **AI** | 从已有代码逆向生成 | \`forge prompt scan\` → subagent |
| **Toolchain** | 校验一致性 | \`forge check\` |
| **Toolchain** | 渲染层视图 | \`forge view\` |
| **Toolchain** | 生成编译任务列表 | \`forge compile-plan\` |
| **Toolchain** | 创建/更新 L2 映射 | \`forge link\` |
| **Toolchain** | 重算 hash | \`forge rehash\` |

核心原则：AI 只做需要创造力/判断力的事。机械操作全部交给 toolchain CLI。

### Subagent 复杂度等级

SVP prompt 包含 \`complexity\` front-matter 字段，指示任务难度：

| 等级 | 含义 | 模型 |
|------|------|------|
| \`heavy\` | 高创造力，架构决策 | ${opts.modelTierRows.heavy} |
| \`standard\` | 常规实现与审查 | ${opts.modelTierRows.standard} |
| \`light\` | 机械修复、文档、引用更新 | ${opts.modelTierRows.light} |

派发 subagent 时，读取 prompt 输出中的 \`complexity\` 字段并传入对应的模型参数。

### Subagent 派发模式

\`\`\`
1. 运行 forge prompt <action> <id> [options]  获取提示词
2. 读取 prompt 头部 complexity 字段选择模型等级
3. 将 stdout 输出派发给 subagent 执行
4. Subagent 完成后运行 forge link / forge rehash / forge check
\`\`\`

### 可用 CLI 命令

| 命令 | 说明 |
|---|---|
| \`forge view l5/l4/l3/l2\` | 以 AI 友好格式查看层数据 |
| \`forge check\` | 校验跨层一致性 |
| \`forge compile-plan\` | 检测变更并生成重编译任务 |
| \`forge rehash [target]\` | 重算 contentHash + 递增 revision |
| \`forge link <l3-id> --files <paths>\` | 创建/更新 L2 code block 映射 |
| \`forge prompt <action> <id>\` | 生成上下文感知的 AI 提示词到 stdout |
| \`forge changeset start <name> --reason "..."\` | 创建变更集，快照基线 |
| \`forge changeset complete\` | 完成活跃变更集，计算差异 |
| \`forge changeset list\` | 列出所有变更集 |
| \`forge changeset view [id]\` | 查看变更集差异（默认活跃） |
| \`forge changeset abandon [id]\` | 放弃活跃变更集 |

### Prompt 命令

| 命令 | 说明 |
|---|---|
| \`forge prompt compile <l3-id>\` | 生成 L3→L1 编译提示词 |
| \`forge prompt recompile <l3-id>\` | 生成重编译提示词（L3 已变更） |
| \`forge prompt review <l3-id>\` | 生成审查提示词（L1 漂移） |
| \`forge prompt update-ref <l4-id>\` | 生成修复断裂 L4→L3 引用的提示词 |
| \`forge prompt design-l5 --intent "..."\` | 生成 L5 设计提示词 |
| \`forge prompt design-l4 --intent "..." [--kind flow|event-graph|state-machine]\` | 生成 L4 设计提示词 |
| \`forge prompt design-l3 <id> --flow <fid> --step <n> --intent "..."\` | 生成 L3 设计提示词 |
| \`forge prompt scan [--dir <path>] [--intent "..."]\` | 从已有代码逆向生成 SVP（自动检测阶段） |

### Slash 命令

| 命令 | 使用场景 |
|---|---|
${slashRows}

Toolchain 操作直接运行 CLI：\`forge check\`、\`forge view l3\` 等。

### 核心规则

1. **分层穿透**：仅向下工作。永远不修改上层来修复下层。
2. **上下文隔离**：主 Agent 停留在 L5+L4（~30 行）。L3 设计和 L2+L1 编译派发给 subagent。
3. **Hash 管理**：在 JSON 中写 \`"placeholder"\` 作为 contentHash。运行 \`forge rehash\` 修正。
4. **L2 创建**：生成 L1 代码后，运行 \`forge link <l3-id> --files <paths>\` 创建 L2 映射。
5. **验证**：每层完成后运行 \`forge check\` 确保一致性。

### L3 Contract Box 模型

\`\`\`
validate   → 约束输入（每个字段路径的自然语言规则）
constraints → 约束输出（自然语言断言）
description → 描述中间（转换逻辑）
\`\`\`

### JSON Schema 快速参考

**L5Blueprint**: \`{ id, name, version, intent, constraints[], domains[], integrations[], contentHash, revision }\`
**L4Flow**: \`{ kind?: "flow", id, name, trigger?, steps[], dataFlows[], contentHash, revision }\`
**L4EventGraph**: \`{ kind: "event-graph", id, name, state: {key: {type, description}}, handlers: [{id, event, steps[], dataFlows[]}], contentHash, revision }\`
**L4StateMachine**: \`{ kind: "state-machine", id, name, entity, initialState, states: {name: {onEntry?, onExit?}}, transitions: [{from, to, event, guard?}], contentHash, revision }\`
**L3Block**: \`{ id, name, input: Pin[], output: Pin[], validate: {}, constraints[], description, contentHash, revision }\`
**L2CodeBlock**: \`{ id, blockRef, language, files[], sourceHash, contentHash, revision }\`

### L4 变体选择指南

| 变体 | \`kind\` | 使用场景 |
|---|---|---|
| **Flow** | \`"flow"\`（默认） | 请求-响应 pipeline：触发 → 步骤链 → 结果 |
| **EventGraph** | \`"event-graph"\` | 事件驱动/响应式：共享状态 + 多事件处理器 |
| **StateMachine** | \`"state-machine"\` | 实体生命周期：状态 + 转换 + 守卫 |`.trim();
}

function contextBodyEn(opts: ContextOptions): string {
  const slashRows = opts.slashCommands
    .map((s) => `| \`${s.command}\` | ${s.description} |`)
    .join("\n");

  return `
## SVP — Semantic Voxel Protocol

This project uses SVP for structured AI-assisted development.

### Five-Layer Model

\`\`\`
L5 Blueprint  ──aggregates──→  L4 Artifact  ──aggregates──→  L3 Block  ←1:1 pair→  L2 Code  ──aggregates──→  L1 Source
(Intent)                    (Logic chains)               (Contract)              (Mapping)               (Code)
\`\`\`

### .svp/ Directory Structure

\`\`\`
.svp/
├── l5.json          # L5 Blueprint (globally unique)
├── l4/              # L4 Artifact files (flow / event-graph / state-machine)
│   └── <artifact-id>.json
├── l3/              # L3 Block contracts
│   └── <block-id>.json
└── l2/              # L2 Code block mappings
    └── <block-id>.json
\`\`\`

### Modular Documentation (docs.md)

Each node/graph can have an optional \`docs.md\` for rich context beyond \`description\`:

\`\`\`
nodes/<block-id>/
├── node.yaml        # Contract
└── docs.md          # Optional: design intent, edge cases, error strategy, integration notes
graphs/
├── <name>.yaml
└── <name>.docs.md   # Optional: graph-level documentation
\`\`\`

- \`docs.md\` is auto-loaded into compile/recompile/review prompts
- Does NOT affect contentHash — it's supplementary, not contractual
- Use it for: design intent, edge cases, error strategy, integration notes, examples

### Reference Materials (refs/)

Each node/graph can have an optional \`refs/\` folder for arbitrary reference files (mockups, algorithm specs, reference implementations, etc.):

\`\`\`
nodes/<block-id>/
├── docs.md          # Optional: supplementary documentation
└── refs/            # Optional: reference materials folder
    ├── design.png   # UI mockup
    ├── algorithm.md # Algorithm spec
    └── reference.ts # Reference implementation
\`\`\`

- Text files (.md/.ts/.py etc.) are inlined into the prompt
- Binary files (.png/.pdf etc.) are listed by path
- Does NOT affect contentHash, and is NOT checked by \`forge docs check\`
- Auto-loaded into compile/recompile/review prompts

### AI vs Toolchain Scope

| Scope | Operation | Method |
|-------|-----------|--------|
| **AI** | Design L5/L4/L3 specs | \`forge prompt design-*\` → subagent |
| **AI** | Compile L3→L1 code | \`forge prompt compile/recompile\` → subagent |
| **AI** | Review drift | \`forge prompt review\` → subagent |
| **AI** | Fix broken references | \`forge prompt update-ref\` → subagent |
| **AI** | Reverse-engineer from code | \`forge prompt scan\` → subagent |
| **Toolchain** | Validate consistency | \`forge check\` |
| **Toolchain** | Render layer views | \`forge view\` |
| **Toolchain** | Generate compile task list | \`forge compile-plan\` |
| **Toolchain** | Create/update L2 mapping | \`forge link\` |
| **Toolchain** | Recompute hash | \`forge rehash\` |

Core Principle: AI only does what requires creativity or judgment. All mechanical operations go to the toolchain CLI.

### Subagent Complexity Tiers

SVP prompts include a \`complexity\` front-matter field indicating task difficulty:

| Tier | Meaning | Model |
|------|---------|-------|
| \`heavy\` | High creativity, architecture decisions | ${opts.modelTierRows.heavy} |
| \`standard\` | Normal implementation and review | ${opts.modelTierRows.standard} |
| \`light\` | Mechanical fixes, docs, reference updates | ${opts.modelTierRows.light} |

When dispatching a subagent, read the \`complexity\` field from the prompt output
and pass the corresponding model parameter.

### Subagent Dispatch Pattern

\`\`\`
1. Run forge prompt <action> <id> [options]  to get the prompt
2. Read the complexity field in the prompt header to select model tier
3. Dispatch stdout output to subagent for execution
4. After subagent completes, run forge link / forge rehash / forge check
\`\`\`

### Available CLI Commands

| Command | Description |
|---|---|
| \`forge view l5/l4/l3/l2\` | View layer data in AI-friendly format |
| \`forge check\` | Validate cross-layer consistency |
| \`forge compile-plan\` | Detect changes and generate recompile tasks |
| \`forge rehash [target]\` | Recompute contentHash + bump revision |
| \`forge link <l3-id> --files <paths>\` | Create/update L2 code block mapping |
| \`forge prompt <action> <id>\` | Generate context-aware AI prompt to stdout |
| \`forge changeset start <name> --reason "..."\` | Start changeset, snapshot baseline |
| \`forge changeset complete\` | Complete active changeset, compute diff |
| \`forge changeset list\` | List all changesets |
| \`forge changeset view [id]\` | View changeset diff (defaults to active) |
| \`forge changeset abandon [id]\` | Abandon active changeset |

### Prompt Commands

| Command | Description |
|---|---|
| \`forge prompt compile <l3-id>\` | Generate compile prompt for L3→L1 |
| \`forge prompt recompile <l3-id>\` | Generate recompile prompt (L3 changed) |
| \`forge prompt review <l3-id>\` | Generate review prompt (L1 drift) |
| \`forge prompt update-ref <l4-id>\` | Generate fix prompt for broken L4→L3 refs |
| \`forge prompt design-l5 --intent "..."\` | Generate L5 design prompt |
| \`forge prompt design-l4 --intent "..." [--kind flow|event-graph|state-machine]\` | Generate L4 design prompt |
| \`forge prompt design-l3 <id> --flow <fid> --step <n> --intent "..."\` | Generate L3 design prompt |
| \`forge prompt scan [--dir <path>] [--intent "..."]\` | Reverse-engineer SVP from existing code (auto-detects phase) |

### Slash Commands

| Command | When to use |
|---|---|
${slashRows}

Toolchain operations run CLI directly: \`forge check\`, \`forge view l3\`, etc.

### Core Rules

1. **Layered penetration**: Work top-down only. Never modify upper layers to fix lower layers.
2. **Context isolation**: Main agent stays at L5+L4 (~30 lines). L3 design and L2+L1 compile dispatched to subagents.
3. **Hash management**: Write \`"placeholder"\` for contentHash in JSON. Run \`forge rehash\` to fix.
4. **L2 creation**: After generating L1 code, run \`forge link <l3-id> --files <paths>\` to create L2 mapping.
5. **Verification**: Run \`forge check\` after each layer to ensure consistency.

### L3 Contract Box Model

\`\`\`
validate   → constrains INPUT (natural language rules per field path)
constraints → constrains OUTPUT (natural language assertions)
description → describes the MIDDLE (transformation logic)
\`\`\`

### JSON Schema Quick Reference

**L5Blueprint**: \`{ id, name, version, intent, constraints[], domains[], integrations[], contentHash, revision }\`
**L4Flow**: \`{ kind?: "flow", id, name, trigger?, steps[], dataFlows[], contentHash, revision }\`
**L4EventGraph**: \`{ kind: "event-graph", id, name, state: {key: {type, description}}, handlers: [{id, event, steps[], dataFlows[]}], contentHash, revision }\`
**L4StateMachine**: \`{ kind: "state-machine", id, name, entity, initialState, states: {name: {onEntry?, onExit?}}, transitions: [{from, to, event, guard?}], contentHash, revision }\`
**L3Block**: \`{ id, name, input: Pin[], output: Pin[], validate: {}, constraints[], description, contentHash, revision }\`
**L2CodeBlock**: \`{ id, blockRef, language, files[], sourceHash, contentHash, revision }\`

### L4 Variant Selection Guide

| Variant | \`kind\` | Use when |
|---|---|---|
| **Flow** | \`"flow"\` (default) | Request-response pipeline: trigger → step chain → result |
| **EventGraph** | \`"event-graph"\` | Event-driven / reactive: shared state + multiple event handlers |
| **StateMachine** | \`"state-machine"\` | Entity lifecycle: states + transitions + guards |`.trim();
}
