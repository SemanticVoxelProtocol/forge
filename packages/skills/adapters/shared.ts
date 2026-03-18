// adapters/shared — Shared workflow content across all host adapters
// Build/Add/Change/Fix/View sections are identical for every host.

/** Package version stamped into generated skill files for extend-mode upgrades */
export const SKILL_FILE_VERSION = "0.1.3";

const SKILL_VERSION_RE = /<!-- svp-skill-version: (.+?) -->/;

/** Extract the svp-skill-version from an existing skill file, or null if absent */
export function extractSkillVersion(content: string): string | null {
  const m = SKILL_VERSION_RE.exec(content);
  return m ? m[1] : null;
}

// ── Skill file: Intro line ──

export function getSkillIntro(language: string): string {
  if (language === "zh") {
    return "你是 SVP 编译器与交互式向导。你诊断项目状态，选择正确模式，执行完整流程。";
  }
  return "You are the SVP compiler and interactive wizard. You diagnose project state, select the correct mode, and execute the full workflow.";
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
- 如果 nodes/<id>/docs.md 存在，compile/recompile prompt 会自动包含文档内容`;
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
- If nodes/<id>/docs.md exists, compile/recompile prompts will automatically include its content`;
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
  - **空项目**（无 L4/L3）→ 进入 **Build**
  - **有数据** → 问用户选择模式：
    (a) Build — 从零构建
    (b) Add — 添加新功能
    (c) Change — 修改已有功能
    (d) Fix — 修复 check 问题
    (e) View — 查看当前结构

---

## Build（从零构建整个系统）

### Step 1: [AI] 设计 L5 Blueprint
- 运行 \`forge prompt design-l5 --intent "<用户意图>"\`
- 将 stdout 输出派发给 subagent（读取 complexity 选择模型等级）
- Subagent 输出 L5 JSON → 写入 .svp/l5.json
- [Toolchain] 运行 \`forge rehash l5\`
- 展示 \`forge view l5\` 给用户确认

### Step 2: [AI] 设计 L4 Artifacts
根据系统类型选择 L4 变体：
- **Flow** (默认): 请求-响应 pipeline → \`forge prompt design-l4 --intent "..."\`
- **EventGraph**: 事件驱动/CRDT → \`forge prompt design-l4 --kind event-graph --intent "..."\`
- **StateMachine**: 实体生命周期 → \`forge prompt design-l4 --kind state-machine --intent "..."\`

- 将 stdout 输出派发给 subagent（读取 complexity 选择模型等级）
- Subagent 输出 L4 JSON → 写入 .svp/l4/<id>.json
- [Toolchain] 运行 \`forge rehash l4\`
- 展示 \`forge view l4\` 给用户确认

### Step 3: [AI] 设计 L3 Contracts（并行派发）
对每个 L4 step 的 blockRef：
- 运行 \`forge prompt design-l3 <block-id> --flow <flow-id> --step <idx> --intent "..."\`
- 将 stdout 输出派发给 subagent（读取 complexity 选择模型等级）
- Subagent 输出 L3 JSON → 写入 .svp/l3/<id>.json
- [Toolchain] 运行 \`forge rehash l3/<id>\`
- **无依赖的 block 并行派发**

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

### Step 1: [Toolchain] 了解当前结构
- 运行 \`forge view l5\` 和 \`forge view l4/<id>\` 了解现有架构
- 确定新功能属于哪个 L4 flow（或需要新 flow）

### Step 2: [AI] 修改 L4 Flow
- 编辑对应的 .svp/l4/<flow-id>.json，添加新 step + blockRef
- 新 step 的 blockRef 指向尚不存在的 L3 block id
- 更新 dataFlows 连接新 step
- [Toolchain] 运行 \`forge rehash l4\`
- 展示 \`forge view l4/<flow-id>\` 给用户确认

### Step 3: [AI] 设计新 L3 Contract
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

---

## Change（修改已有需求）

### Step 1: [Toolchain] 诊断当前状态
- 运行 \`forge check\` 确认当前一致性状态
- 运行 \`forge view l5\` + \`forge view l4\` + \`forge view l3\` 了解结构

### Step 2: 判断变更层级
- 系统意图变了 → L5
- 流程编排变了 → L4
- 契约规则变了 → L3
- 代码变了 → L1（只报 drift，不自动修改上层）
- 越低层介入越精确越便宜

### Step 3: [AI] 执行修改
- L5 变更：编辑 .svp/l5.json → \`forge rehash l5\`
- L4 变更：编辑 .svp/l4/<id>.json → \`forge rehash l4\`
- L3 变更：编辑 .svp/l3/<id>.json → \`forge rehash l3/<id>\`
- 展示给用户确认

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

- 运行 \`forge view l5\` + \`forge view l4\` + \`forge view l3\` 展示完整系统结构
- 如有 L2 映射，也展示 \`forge view l2\`

$ARGUMENTS`;

const workflowEn = `## Step 0: Diagnostic Router

- Run \`forge check --json\` (ignore errors) + \`forge view l5\` + check whether .svp/ exists
- Based on the result, determine:
  - **No .svp/**: Tell user to run \`forge init\` first, then stop
  - **Empty project** (no L4/L3) → Enter **Build**
  - **Has data** → Ask user to choose a mode:
    (a) Build — build from scratch
    (b) Add — add new feature
    (c) Change — modify existing feature
    (d) Fix — fix check issues
    (e) View — view current structure

---

## Build (build entire system from scratch)

### Step 1: [AI] Design L5 Blueprint
- Run \`forge prompt design-l5 --intent "<user intent>"\`
- Dispatch stdout output to subagent (read complexity to select model tier)
- Subagent outputs L5 JSON → write to .svp/l5.json
- [Toolchain] Run \`forge rehash l5\`
- Show \`forge view l5\` to user for confirmation

### Step 2: [AI] Design L4 Artifacts
Choose L4 variant based on system type:
- **Flow** (default): Request-response pipeline → \`forge prompt design-l4 --intent "..."\`
- **EventGraph**: Event-driven/CRDT → \`forge prompt design-l4 --kind event-graph --intent "..."\`
- **StateMachine**: Entity lifecycle → \`forge prompt design-l4 --kind state-machine --intent "..."\`

- Dispatch stdout output to subagent (read complexity to select model tier)
- Subagent outputs L4 JSON → write to .svp/l4/<id>.json
- [Toolchain] Run \`forge rehash l4\`
- Show \`forge view l4\` to user for confirmation

### Step 3: [AI] Design L3 Contracts (dispatch in parallel)
For each blockRef in L4 steps:
- Run \`forge prompt design-l3 <block-id> --flow <flow-id> --step <idx> --intent "..."\`
- Dispatch stdout output to subagent (read complexity to select model tier)
- Subagent outputs L3 JSON → write to .svp/l3/<id>.json
- [Toolchain] Run \`forge rehash l3/<id>\`
- **Dispatch independent blocks in parallel**

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

### Step 1: [Toolchain] Understand Current Structure
- Run \`forge view l5\` and \`forge view l4/<id>\` to understand the existing architecture
- Determine which L4 flow the new feature belongs to (or whether a new flow is needed)

### Step 2: [AI] Modify L4 Flow
- Edit the corresponding .svp/l4/<flow-id>.json, add a new step + blockRef
- The new step's blockRef points to a L3 block id that does not yet exist
- Update dataFlows to connect the new step
- [Toolchain] Run \`forge rehash l4\`
- Show \`forge view l4/<flow-id>\` to user for confirmation

### Step 3: [AI] Design New L3 Contract
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

---

## Change (modify existing requirement)

### Step 1: [Toolchain] Diagnose Current State
- Run \`forge check\` to confirm current consistency state
- Run \`forge view l5\` + \`forge view l4\` + \`forge view l3\` to understand the structure

### Step 2: Determine the Change Layer
- System intent changed → L5
- Logic chains changed → L4
- Contract rules changed → L3
- Code changed → L1 (report drift only, do not automatically modify upper layers)
- The lower the intervention layer, the more precise and cheaper

### Step 3: [AI] Apply Changes
- L5 change: edit .svp/l5.json → \`forge rehash l5\`
- L4 change: edit .svp/l4/<id>.json → \`forge rehash l4\`
- L3 change: edit .svp/l3/<id>.json → \`forge rehash l3/<id>\`
- Show to user for confirmation

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

- Run \`forge view l5\` + \`forge view l4\` + \`forge view l3\` to show full system structure
- If L2 mappings exist, also show \`forge view l2\`

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

### AI vs Toolchain 作用域

| 作用域 | 操作 | 方式 |
|--------|------|------|
| **AI** | 设计 L5/L4/L3 规格 | \`forge prompt design-*\` → subagent |
| **AI** | 编译 L3→L1 代码 | \`forge prompt compile/recompile\` → subagent |
| **AI** | 审查漂移 | \`forge prompt review\` → subagent |
| **AI** | 修复断裂引用 | \`forge prompt update-ref\` → subagent |
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
**L2CodeBlock**: \`{ id, blockRef, language, files[], sourceHash, contentHash, signatureHash?, revision }\`

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

### AI vs Toolchain Scope

| Scope | Operation | Method |
|-------|-----------|--------|
| **AI** | Design L5/L4/L3 specs | \`forge prompt design-*\` → subagent |
| **AI** | Compile L3→L1 code | \`forge prompt compile/recompile\` → subagent |
| **AI** | Review drift | \`forge prompt review\` → subagent |
| **AI** | Fix broken references | \`forge prompt update-ref\` → subagent |
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
**L2CodeBlock**: \`{ id, blockRef, language, files[], sourceHash, contentHash, signatureHash?, revision }\`

### L4 Variant Selection Guide

| Variant | \`kind\` | Use when |
|---|---|---|
| **Flow** | \`"flow"\` (default) | Request-response pipeline: trigger → step chain → result |
| **EventGraph** | \`"event-graph"\` | Event-driven / reactive: shared state + multiple event handlers |
| **StateMachine** | \`"state-machine"\` | Entity lifecycle: states + transitions + guards |`.trim();
}
