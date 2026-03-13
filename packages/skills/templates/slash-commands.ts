// slash-commands — 4 个 AI 驱动 slash command 模板
// svp init --host claude-code 时生成到 .claude/commands/
// 纯 toolchain 操作（check/view）由用户直接运行 CLI，不需要 slash command

export interface SlashCommandTemplate {
  readonly filename: string;
  readonly content: string;
}

export function generateSlashCommands(): readonly SlashCommandTemplate[] {
  return [svpBuild, svpAdd, svpChange, svpFix];
}

// ── /svp-build — 从零构建整个系统 ──

const svpBuild: SlashCommandTemplate = {
  filename: "svp-build.md",
  content: `你是 SVP 编译器。用户描述了一个系统意图，你从 L5 到 L1 完整设计并实现。

## 核心原则
- **上下文隔离**：主 Agent 只维护 L5+L4（~30 行上下文）。L3/L1 通过 subagent 完成。
- **Subagent 派发模式**：运行 \`svp prompt <action> <id>\` 获取提示词 → 派发 subagent → 后续跑 toolchain 命令。

## Step 1: [AI] 设计 L5 Blueprint
- 运行 \`svp prompt design-l5 --intent "<用户意图>"\`
- 将 stdout 输出派发给 subagent
- Subagent 输出 L5 JSON → 写入 .svp/l5.json
- [Toolchain] 运行 \`svp rehash l5\`
- 展示 \`svp view l5\` 给用户确认

## Step 2: [AI] 设计 L4 Artifacts
根据系统类型选择 L4 变体：
- **Flow** (默认): 请求-响应 pipeline → \`svp prompt design-l4 --intent "..."\`
- **EventGraph**: 事件驱动/CRDT → \`svp prompt design-l4 --kind event-graph --intent "..."\`
- **StateMachine**: 实体生命周期 → \`svp prompt design-l4 --kind state-machine --intent "..."\`

- 将 stdout 输出派发给 subagent
- Subagent 输出 L4 JSON → 写入 .svp/l4/<id>.json
- [Toolchain] 运行 \`svp rehash l4\`
- 展示 \`svp view l4\` 给用户确认

## Step 3: [AI] 设计 L3 Contracts（并行派发）
对每个 L4 step 的 blockRef：
- 运行 \`svp prompt design-l3 <block-id> --flow <flow-id> --step <idx> --intent "..."\`
- 将 stdout 输出派发给 subagent
- Subagent 输出 L3 JSON → 写入 .svp/l3/<id>.json
- [Toolchain] 运行 \`svp rehash l3/<id>\`
- **无依赖的 block 并行派发**

## Step 4: [Toolchain] 获取编译任务
- 运行 \`svp compile-plan\` 获取编译任务列表

## Step 5: [AI] 编译 L1 代码（并行派发）
对每个 compile 任务：
- 运行 \`svp prompt compile <l3-id>\`
- 将 stdout 输出派发给 subagent
- Subagent 生成 src/<id>.ts 代码文件
- **无依赖的任务并行派发**

## Step 6: [Toolchain] 创建 L2 映射
- 对每个生成的文件运行 \`svp link <l3-id> --files src/<id>.ts\`

## Step 7: [Toolchain] 验证
- 运行 \`svp check\` 验证全部层一致性
- 如有问题，定位到对应层修复
- 重复直到 check 通过

## 规则
- 严格单向向下，不回头修改上层
- 主 Agent 不读 L1 代码——上下文隔离是核心价值
- 每层完成后展示给用户确认
- 做不到就报错，说清哪层什么问题——用户是反向反馈回路
- JSON 中 contentHash 和 revision 写占位值，rehash 会修正
- 尽量并行派发无依赖的 subagent

$ARGUMENTS`,
};

// ── /svp-add — 向已有系统添加功能 ──

const svpAdd: SlashCommandTemplate = {
  filename: "svp-add.md",
  content: `你是 SVP 编译器。用户想在现有系统中添加新功能。

## Step 1: [Toolchain] 了解当前结构
- 运行 \`svp view l5\` 和 \`svp view l4/<id>\` 了解现有架构
- 确定新功能属于哪个 L4 flow（或需要新 flow）

## Step 2: [AI] 修改 L4 Flow
- 编辑对应的 .svp/l4/<flow-id>.json，添加新 step + blockRef
- 新 step 的 blockRef 指向尚不存在的 L3 block id
- 更新 dataFlows 连接新 step
- [Toolchain] 运行 \`svp rehash l4\`
- 展示 \`svp view l4/<flow-id>\` 给用户确认

## Step 3: [AI] 设计新 L3 Contract
- 运行 \`svp prompt design-l3 <new-block-id> --flow <fid> --step <idx> --intent "..."\`
- 将 stdout 输出派发给 subagent
- Subagent 创建 .svp/l3/<id>.json
- [Toolchain] 运行 \`svp rehash l3/<id>\`

## Step 4: [AI] 编译新代码
- 运行 \`svp prompt compile <new-block-id>\`
- 将 stdout 输出派发给 subagent
- Subagent 生成 L1 源代码

## Step 5: [Toolchain] 创建映射并验证
- \`svp link <l3-id> --files <paths>\`
- \`svp check\` 确认全绿

## 规则
- 只处理新增的部分，不修改已有 block
- 严格单向向下
- 上下文隔离：主 Agent 不碰 L1

$ARGUMENTS`,
};

// ── /svp-change — 修改已有需求 ──

const svpChange: SlashCommandTemplate = {
  filename: "svp-change.md",
  content: `你是 SVP 编译器。定位受影响层级，从该层向下重编译。

## Step 1: [Toolchain] 诊断当前状态
- 运行 \`svp check\` 确认当前一致性状态
- 运行 \`svp view l5\` + \`svp view l4\` + \`svp view l3\` 了解结构

## Step 2: 判断变更层级
- 系统意图变了 → L5
- 流程编排变了 → L4
- 契约规则变了 → L3
- 代码变了 → L1（只报 drift，不自动修改上层）
- 越低层介入越精确越便宜

## Step 3: [AI] 执行修改
- L5 变更：编辑 .svp/l5.json → \`svp rehash l5\`
- L4 变更：编辑 .svp/l4/<id>.json → \`svp rehash l4\`
- L3 变更：编辑 .svp/l3/<id>.json → \`svp rehash l3/<id>\`
- 展示给用户确认

## Step 4: [Toolchain] 获取受影响任务
- 运行 \`svp compile-plan\` 获取受影响实体的重编译任务列表

## Step 5: [AI] 重编译受影响代码
对每个 recompile 任务：
- 运行 \`svp prompt recompile <l3-id>\`
- 将 stdout 输出派发给 subagent
- Subagent 更新 L1 代码

## Step 6: [Toolchain] 更新映射并验证
- \`svp link <l3-id> --files <paths>\`
- \`svp check\` 确认全绿

## 规则
- 严格单向向下，不回头修改上层
- 定位到最高受影响层，从那里开始
- 做不到就报错——用户是反向反馈回路

$ARGUMENTS`,
};

// ── /svp-fix — 自动修复 check 发现的问题 ──

const svpFix: SlashCommandTemplate = {
  filename: "svp-fix.md",
  content: `你是 SVP 修复工具。运行 check 并按问题类型逐个修复。

## Step 1: [Toolchain] 诊断
- 运行 \`svp check --json\` 获取结构化问题列表

## Step 2: 按 issueCode 分类处理

### HASH_MISMATCH
- [Toolchain] 运行 \`svp rehash\` 修正 hash（通常是 AI 编辑后忘了 rehash）

### MISSING_L2
- [AI] 运行 \`svp prompt compile <l3-id>\`
- 将 stdout 输出派发给 subagent 生成代码
- [Toolchain] 运行 \`svp link <l3-id> --files <paths>\`

### SOURCE_DRIFT
- [AI] 运行 \`svp prompt recompile <l3-id>\`
- 将 stdout 输出派发给 subagent 更新代码

### CONTENT_DRIFT
- [AI] 运行 \`svp prompt review <l3-id>\`
- 将 stdout 输出派发给 subagent 判断：
  - L3 需要更新？还是 L1 需要修复？
  - 向用户展示 subagent 的分析结果

### MISSING_BLOCK_REF
- [AI] 运行 \`svp prompt update-ref <l4-id>\`
- 将 stdout 输出派发给 subagent 判断：
  - 创建缺失的 L3 contract？还是修复 L4 step 引用？

### ORPHAN_STEP / NEXT_CYCLE
- 图结构问题 → 提示用户手动修复 L4 JSON

## Step 3: [Toolchain] 验证
- 重新运行 \`svp check\` 确认修复有效
- 重复直到全绿

## 规则
- 每次只修一类问题，验证后再继续
- CONTENT_DRIFT 和 ORPHAN_STEP 需要用户决策，不自动处理
- 使用 \`svp prompt\` 获取提示词后派发 subagent 执行 AI 操作

$ARGUMENTS`,
};
