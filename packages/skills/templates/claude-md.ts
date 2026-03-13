// claude-md — CLAUDE.md SVP section 生成
// svp init --host claude-code 时追加到 CLAUDE.md

export function generateClaudeMdSection(_projectName: string): string {
  return `
## SVP — Semantic Voxel Protocol

This project uses SVP for structured AI-assisted development.

### Five-Layer Model

\`\`\`
L5 Blueprint  ─聚合─→  L4 Artifact  ─聚合─→  L3 Block  ←1:1配对→  L2 Code  ─聚合─→  L1 Source
(意图)              (流程编排)           (契约)              (映射)           (代码)
\`\`\`

### .svp/ Directory Structure

\`\`\`
.svp/
├── l5.json          # L5 Blueprint（全局唯一）
├── l4/              # L4 Artifact files (flow / event-graph / state-machine)
│   └── <artifact-id>.json
├── l3/              # L3 Block contracts
│   └── <block-id>.json
└── l2/              # L2 Code block mappings
    └── <block-id>.json
\`\`\`

### AI vs Toolchain 作用域

| 作用域 | 操作 | 方式 |
|--------|------|------|
| **AI** | 设计 L5/L4/L3 规格 | \`svp prompt design-*\` → subagent |
| **AI** | 编译 L3→L1 代码 | \`svp prompt compile/recompile\` → subagent |
| **AI** | 审查漂移 | \`svp prompt review\` → subagent |
| **AI** | 修复断裂引用 | \`svp prompt update-ref\` → subagent |
| **Toolchain** | 校验一致性 | \`svp check\` |
| **Toolchain** | 渲染层视图 | \`svp view\` |
| **Toolchain** | 生成编译任务列表 | \`svp compile-plan\` |
| **Toolchain** | 创建/更新 L2 映射 | \`svp link\` |
| **Toolchain** | 重算 hash | \`svp rehash\` |

核心原则：AI 只做需要创造力/判断力的事。机械操作全部交给 toolchain CLI。

### Subagent 派发模式

\`\`\`
1. 运行 svp prompt <action> <id> [options]  获取提示词
2. 将 stdout 输出派发给 subagent 执行
3. Subagent 完成后运行 svp link / svp rehash / svp check
\`\`\`

### Available CLI Commands

| Command | Description |
|---|---|
| \`svp view l5/l4/l3/l2\` | View layer data in AI-friendly format |
| \`svp check\` | Validate cross-layer consistency |
| \`svp compile-plan\` | Detect changes and generate recompile tasks |
| \`svp rehash [target]\` | Recompute contentHash + bump revision |
| \`svp link <l3-id> --files <paths>\` | Create/update L2 code block mapping |
| \`svp compile\` | Run orchestrator with compile-plan |
| \`svp prompt <action> <id>\` | Generate context-aware AI prompt to stdout |

### Prompt Commands

| Command | Description |
|---|---|
| \`svp prompt compile <l3-id>\` | Generate compile prompt for L3→L1 |
| \`svp prompt recompile <l3-id>\` | Generate recompile prompt (L3 changed) |
| \`svp prompt review <l3-id>\` | Generate review prompt (L1 drift) |
| \`svp prompt update-ref <l4-id>\` | Generate fix prompt for broken L4→L3 refs |
| \`svp prompt design-l5 --intent "..."\` | Generate L5 design prompt |
| \`svp prompt design-l4 --intent "..." [--kind flow|event-graph|state-machine]\` | Generate L4 design prompt |
| \`svp prompt design-l3 <id> --flow <fid> --step <n> --intent "..."\` | Generate L3 design prompt |

### Slash Commands

| Command | When to use |
|---|---|
| \`/svp-build\` | "做一个 X 系统" — full L5→L1 design+compile |
| \`/svp-add\` | "加个 Z 步骤" — add feature to existing system |
| \`/svp-change\` | "把 X 改成 Y" — modify existing requirement |
| \`/svp-fix\` | "修复 check 问题" — auto-fix consistency issues |

Toolchain 操作直接运行 CLI：\`svp check\`、\`svp view l3\` 等。

### Core Rules

1. **Layered penetration**: Work top-down only. Never modify upper layers to fix lower layers.
2. **Context isolation**: Main agent stays at L5+L4 (~30 lines). L3 design and L2+L1 compile dispatched to subagents.
3. **Hash management**: Write \`"placeholder"\` for contentHash in JSON. Run \`svp rehash\` to fix.
4. **L2 creation**: After generating L1 code, run \`svp link <l3-id> --files <paths>\` to create L2 mapping.
5. **Verification**: Run \`svp check\` after each layer to ensure consistency.

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
| **StateMachine** | \`"state-machine"\` | Entity lifecycle: states + transitions + guards |
`.trim();
}
