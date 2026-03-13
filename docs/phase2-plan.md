# SVP Phase 2: AI Skill 实现 & Claude Code 集成 — 完整计划 (v2 - 用户确认完整)

## Context

### 现状

SVP 核心基础设施已完成（208 tests passing）：
- **类型系统**: L5Blueprint, L4Flow, L3Block, L2CodeBlock, Pin, Step, DataFlow, Trigger, ArtifactVersion (`packages/core/l5.ts`, `l4.ts`, `l3.ts`, `l2.ts`, `version.ts`)
- **校验**: `check()` — hash 一致性、引用完整性、漂移检测、图结构合法性 (`packages/core/check.ts`)
- **编译计划**: `compilePlan()` — 检测缺失编译、重编译、内容漂移、断裂引用，生成 `CompileTask[]`，每个任务带 `context: ContextRef[]` (`packages/core/compile-plan.ts`)
- **编排器**: `runOrchestrator()` — 收敛循环：loadInput → compilePlan → dispatch skills → apply → repeat (`packages/core/orchestrator.ts`)
- **视图**: `viewL5Overview`, `viewL4Overview/Detail`, `viewL3Overview/Detail`, `viewL2Overview/Detail` — AI 友好的文本渲染 (`packages/core/view.ts`)
- **存储**: `readL5/writeL5`, `readL4/writeL4`, `readL3/writeL3`, `readL2/writeL2`, `listL3/listL4/listL2` (`packages/core/store.ts`)
- **哈希**: `computeHash`, `hashL3`, `hashL4`, `hashL5`, `hashL2` (`packages/core/hash.ts`)
- **初始化**: `init()` — 创建 `.svp/` + L5 (`packages/core/init.ts`)
- **编译器**: YAML 节点图 → L3/L4 JSON（确定性格式转换）(`packages/compiler/`)
- **CLI**: `svp init/check/compile/compile-plan/view/compile-blueprint` (`packages/cli/`)

### 跑不通的环节

1. **Skill 接口有定义无实现** — `SkillRegistry` 是空 Map，orchestrator 找不到 skill 执行任务
2. **CodeCLIAdapter 无适配器** — `adapter.ts` 只有接口，CLI 用的是空 `stubAdapter`
3. **缺少辅助命令** — AI 写完 JSON 后没有 `rehash` 修正 hash，生成 L1 后没有 `link` 创建 L2
4. **缺少设计能力** — compile-plan 只检测 L3→L1 的编译需求，L5/L4/L3 的设计没有任何入口
5. **缺少宿主集成** — 没有 slash commands，没有 CLAUDE.md，Claude Code 不知道怎么用 SVP

### 本阶段目标

让用户在 Claude Code 中通过意图驱动的 slash commands 与 SVP 全层协作。人只做两件事：**看**（svp view / svp check）和**说**（自然语言指令）。AI 负责 L5 到 L1 所有层的创建、编辑和编译。

---

## 核心设计原则（来自文档，必须贯穿实现）

### 1. AI 即编译器（overview.md §四）

SVP 不调 AI API，不造编译器。SVP 是 AI 编码工具的**增强层**——提供结构化上下文，让 AI 工具（Claude Code）消费。Skill 的 `execute()` 不执行 AI 调用，而是**生成结构化 Prompt**，由宿主 CLI 的 AI 能力执行。

### 2. 透明优先于正确（overview.md §二）

SVP 不追求 AI 不犯错，追求错误可见、可定位、可修复。五层是五个观测窗口。`svp check` 是闭环验收工具。每层完成后展示给用户确认。

### 3. 逐层渗透模型（interaction.md §逐层渗透）

三条规则：
- 用户在哪层，AI 从下一层进入
- 严格单向向下，不回头修改上层
- 做不到就报错，说清哪层有什么问题

用户就是反向反馈回路。AI 不越权修改上层意图。

### 4. 上下文隔离——SVP 最核心的价值（interaction.md §上下文效率）

```
L5（意图层）：    ~10 行     ← 用户一眼看完
L4（流程层）：    ~20 行/flow ← 主 Agent 的工作空间
L3（契约层）：    ~50 行/block ← subagent 独立处理
L2（映射层）：    ~30 行/block ← 几乎机械转换
L1（代码层）：    ~200+ 行    ← 最重，隔离在 subagent 里
```

**主 Agent 只待在用户所在层，上下文极少。每层的编译由独立 subagent 完成，每个 subagent 只看自己那层的最小必要信息。** compile-plan 的 `ContextRef[]` 就是 subagent 的最小上下文清单。

效果：主 Agent 上下文极小（~30 行），subagent 上下文精确（~50-200 行），天然并行，失败隔离。

### 5. 契约盒模型——L3 是枢纽（overview.md §三）

```
意图层   L5 + L4    做什么、怎么编排     人定义
契约层   L3         每个单元的规格       人定义，AI 验证
实现层   L2 + L1    代码结构和源码       AI 生成，人验收
```

L3 是人和 AI 之间的接口。pins（结构化）+ validate（自然语言输入约束）+ constraints（自然语言输出约束）+ description（自然语言中间逻辑）。

**validate 约束输入，constraints 约束输出，description 负责中间。**

### 6. 层间关系（overview.md §三）

```
L5 ─聚合─→ L4 ─聚合─→ L3 ←1:1配对→ L2 ─聚合─→ L1
```

L3 和 L2 是同一个单元的两面：L3 说"做什么"（契约），L2 说"怎么做"（实现映射）。

### 7. 存得少，算得多（overview.md §八）

signature 从 input/output 算，dataType 从 pin 类型算，聚合关系从引用反算。单一数据源 + 计算。

### 8. 两种"编译"（compilation.md 开头）

- **格式转换编译**：YAML 节点图 → L3/L4 JSON，确定性，不需要 AI（已有 `packages/compiler/`）
- **变更驱动重编译**：某层改了 → compile-plan 计算范围 → AI subagent 逐层编译（本阶段实现）

### 9. 变更追踪（overview.md §七）

- **自上而下（重编译）**：上层 contentHash 变 → 下层 sourceHash 不匹配 → 触发重编译
- **自下而上（对账检测）**：下层被手改 → signatureHash 不匹配 → 标记 drift 警告，不自动修复

### 10. 聚焦视图格式（interaction.md §视图格式原则）

- 像代码不像 JSON — AI 训练数据中代码和 Markdown 最多
- Overview 极度压缩 — 一个实体一行
- Detail 完整但有边界 — 不展开其他层
- 层间导航显式 — `↑` `↓` 标注关联

---

## 架构设计

### 两类 Skill：设计 + 编译

| 类别 | 覆盖层 | 触发方式 | 输出 |
|---|---|---|---|
| **设计** | L5, L4, L3 | slash commands 的 prompt 直接驱动 | `.svp/` JSON 文件 |
| **编译** | L2, L1 | compile-plan → orchestrator → skill dispatch | L2 映射 + L1 源代码 |

设计 Skills 是全新的——AI 根据用户意图创建/修改 L5、L4、L3 数据。**不在 SkillRegistry 里**，因为不走 compile-plan → orchestrator 流程。

编译 Skills 填充已有框架——compile-plan 检测需求 → orchestrator 派发 → skill 生成 prompt → 宿主 AI 执行。

### Prompt 即 Skill

SVP 是"寄生在 Code CLI 上的协议层"。Skill 的 `execute()` 不调 AI API，而是：
1. 用 `prompt-builder` 将 `SkillInput` 组装为结构化 Prompt
2. 返回 `{ status: "needs-review", notes: prompt }` — prompt 即结果
3. 宿主 CLI（Claude Code）用自身 AI 能力执行这个 prompt

Slash commands 同理——它们是 markdown 文件，内含完整的工作流指导，Claude Code 读取后按步骤执行。

### 新增包：`packages/skills/`

```
core (no deps)
  ↑          ↑
compiler     skills (都只依赖 core)
  ↑          ↑
cli (依赖 core + compiler + skills)
```

```
packages/skills/
├── index.ts                        # 公开 API
├── prompt-builder.ts               # SkillInput → StructuredPrompt（纯函数）
│
├── prompts/                        # Prompt 模板（设计 + 编译）
│   ├── design-l5.ts                # 创建/修改 L5 blueprint
│   ├── design-l4.ts                # 创建/修改 L4 flow
│   ├── design-l3.ts                # 创建/修改 L3 contract
│   ├── compile.ts                  # L3 → L2+L1 初始编译
│   ├── recompile.ts                # L3 变更 → 重编译 L2+L1
│   ├── review.ts                   # L1 漂移 → 审查
│   └── update-ref.ts               # L4 断引用 → 修复
│
├── rehash.ts                       # 重算 contentHash + revision（纯函数）
├── link.ts                         # 创建 L2CodeBlock（纯函数）
│
├── templates/                      # Claude Code 集成模板
│   ├── slash-commands.ts           # 6 个意图驱动 slash commands
│   └── claude-md.ts                # CLAUDE.md SVP section
│
├── adapters/
│   └── claude-code.ts              # CodeCLIAdapter 实现
│
└── __tests__/
    ├── rehash.test.ts
    ├── link.test.ts
    ├── prompt-builder.test.ts
    └── adapters/claude-code.test.ts
```

---

## 实现细节

### 1. `rehash.ts` — 重算 contentHash + 更新 revision

**问题**：AI 创建/编辑 L5、L4、L3 的 JSON 时，contentHash 和 revision 需要正确计算。让 AI 在 prompt 中算 SHA-256 不可靠。

**方案**：`svp rehash` — AI 写完 JSON 后运行，自动修正 hash 和 revision。

```typescript
// packages/skills/rehash.ts — 纯函数，不做 IO

import { hashL3, hashL4, hashL5, hashL2 } from "../core/hash";
import type { L3Block } from "../core/l3";
import type { L4Flow } from "../core/l4";
import type { L5Blueprint } from "../core/l5";
import type { L2CodeBlock } from "../core/l2";
import type { ArtifactVersion } from "../core/version";

export interface RehashResult {
  readonly id: string;
  readonly layer: "l2" | "l3" | "l4" | "l5";
  readonly oldHash: string;
  readonly newHash: string;
  readonly changed: boolean;
}

/** 重算 L5 的 contentHash，rev+1 */
export function rehashL5(l5: L5Blueprint): L5Blueprint { ... }
/** 重算 L4 的 contentHash，rev+1 */
export function rehashL4(flow: L4Flow): L4Flow { ... }
/** 重算 L3 的 contentHash，rev+1 */
export function rehashL3(block: L3Block): L3Block { ... }
/** 重算 L2 的 contentHash（不改 sourceHash），rev+1 */
export function rehashL2(cb: L2CodeBlock): L2CodeBlock { ... }
```

每个 rehash 函数的逻辑：
1. 用对应的 hash 函数计算新 contentHash
2. 如果新旧 hash 相同，不修改 revision（幂等）
3. 如果不同，rev+1, parentRev=当前rev, source={type:"human"}, 新 timestamp

**CLI 命令** `packages/cli/commands/rehash.ts`：

```bash
svp rehash                    # 重算所有层
svp rehash l5                 # 只重算 L5
svp rehash l4                 # 重算所有 L4
svp rehash l3/validate-order  # 重算指定 L3
svp rehash l2                 # 重算所有 L2
```

实现：
1. 解析参数确定范围（全部 / 某层 / 某实体）
2. 用 `store.ts` 的 `readL5/readL4/readL3/readL2` + `listL4/listL3/listL2` 读取数据
3. 调用 `rehashL5/rehashL4/rehashL3/rehashL2` 纯函数
4. 用 `store.ts` 的 `writeL5/writeL4/writeL3/writeL2` 写回
5. 输出变更摘要：`Rehashed l3/validate-order: abc123 → def456`

### 2. `link.ts` — 创建 L2CodeBlock

**问题**：AI 生成 L1 源代码后，需要创建 L2 映射（L3 和 L1 之间的桥接层）。L2 记录 blockRef、文件列表、sourceHash（生成时 L3 的 contentHash）。

```typescript
// packages/skills/link.ts — 纯函数

import { hashL2 } from "../core/hash";
import type { L2CodeBlock } from "../core/l2";
import type { L3Block } from "../core/l3";

export interface LinkOptions {
  readonly l3Block: L3Block;
  readonly files: readonly string[];
  readonly language?: string; // 默认 "typescript"
}

/** 从 L3 block + L1 文件路径创建 L2CodeBlock */
export function createL2Link(options: LinkOptions): L2CodeBlock {
  const base = {
    id: options.l3Block.id,              // L2 id = L3 id（1:1 配对）
    blockRef: options.l3Block.id,
    language: options.language ?? "typescript",
    files: options.files,
  };
  const contentHash = hashL2(base);
  return {
    ...base,
    sourceHash: options.l3Block.contentHash,  // 生成时 L3 的 hash
    contentHash,
    revision: {
      rev: 1,
      parentRev: null,
      source: { type: "ai", action: "compile" },
      timestamp: new Date().toISOString(),
    },
  };
}
```

**CLI 命令** `packages/cli/commands/link.ts`：

```bash
svp link <l3-id> --files src/validate-order.ts src/validate-order.test.ts
svp link validate-order --files src/validate-order.ts --language typescript
```

实现：
1. 用 `readL3(root, l3Id)` 读取 L3 contract
2. 检查 L3 存在，否则报错 `L3 block "${l3Id}" not found`
3. 调用 `createL2Link({ l3Block, files, language })`
4. 用 `writeL2(root, l2)` 写入 `.svp/l2/<id>.json`
5. 输出：`Linked l3/validate-order → l2/validate-order (2 files)`

### 3. `prompt-builder.ts` — Prompt 组装器

将 `SkillInput` 组装为结构化 prompt。**复用 `core/view.ts`** 的渲染函数嵌入层数据——因为 view 输出就是 AI 友好格式（像代码不像 JSON）。

```typescript
// packages/skills/prompt-builder.ts

import { viewL3Detail, viewL4Detail, viewL5Overview, viewL2Detail } from "../core/view";
import type { SkillInput } from "../core/skill";

export interface StructuredPrompt {
  readonly role: string;        // AI 的角色定义
  readonly context: string;     // L5 intent + 项目级约束
  readonly task: string;        // 做什么、为什么（来自 CompileTask.reason）
  readonly input: string;       // 层数据（用 view.ts 渲染的聚焦视图）
  readonly outputSpec: string;  // 期望输出格式（JSON schema 示例 + 文件路径约定）
  readonly rules: string;       // AI 必须遵守的规则
}

/** 从 SkillInput 构建结构化 Prompt */
export function buildPrompt(input: SkillInput): StructuredPrompt { ... }

/** 渲染 StructuredPrompt 为 markdown 文本（喂给 AI） */
export function renderPrompt(prompt: StructuredPrompt): string { ... }
```

**input 字段的渲染策略**（关键：每种 action 嵌入不同的视图）：

| action | 嵌入的视图数据 |
|---|---|
| compile | `viewL3Detail(l3, flows, [])` + 相关 types/ 定义 |
| recompile | `viewL3Detail(l3, flows, l2s)` + 旧 L1 代码（`resolved.l1Files`）|
| review | `viewL3Detail(l3, flows, l2s)` + `viewL2Detail(l2, l3s)` + L1 实际代码 |
| update-ref | `viewL4Detail(flow, l3s, l5)` |

### 4. 设计 Prompt 模板（L5、L4、L3）

这些模板不走 SkillRegistry，由 slash commands 的 prompt 直接驱动。每个模板是一个函数，接收当前层数据 + 用户指令，输出结构化 prompt 文本。

#### `prompts/design-l5.ts`

```typescript
export interface DesignL5Input {
  readonly currentL5?: L5Blueprint;  // null if first time
  readonly userIntent: string;       // 用户的自然语言描述
}
export function buildDesignL5Prompt(input: DesignL5Input): string
```

Prompt 内容指导 AI：
- 从用户描述中提取：intent（核心问题+解决方案+成功标准）、constraints（功能/非功能/业务约束）、domains（领域+依赖关系）、integrations（外部系统+类型）
- 输出 `.svp/l5.json`，格式符合 `L5Blueprint` schema
- 保持简洁（~10行有效信息），只描述"做什么"不描述"怎么做"
- 运行 `svp rehash l5` 修正 hash
- **嵌入 JSON schema 示例**（让 AI 知道怎么写）：

```json
{
  "id": "my-project", "name": "My Project", "version": "0.1.0",
  "intent": "解决什么问题，怎么解决，成功标准是什么",
  "constraints": ["约束1", "约束2"],
  "domains": [{ "name": "order", "description": "订单领域", "dependencies": ["inventory"] }],
  "integrations": [{ "name": "postgres", "type": "database", "description": "主数据库" }],
  "contentHash": "placeholder", "revision": { "rev": 1, "parentRev": null, "source": { "type": "init" }, "timestamp": "..." }
}
```

#### `prompts/design-l4.ts`

```typescript
export interface DesignL4Input {
  readonly l5: L5Blueprint;
  readonly existingFlows: readonly L4Flow[];
  readonly existingBlocks: readonly L3Block[];
  readonly userIntent: string;
  readonly targetFlowId?: string;  // 修改已有 flow 时指定
}
export function buildDesignL4Prompt(input: DesignL4Input): string
```

Prompt 内容：
- 基于 L5 intent 设计/修改流程编排
- 定义 steps（每个 step 有 id、action、blockRef）、dataFlows（from "stepId.pinName" → to "stepId.pinName"）、trigger
- **每个 process step 必须有 blockRef**（指向 L3 block id，可以是尚不存在的）
- step.action 类型：process（引用 L3 block）、call（引用 L4 子 flow）、parallel（分支+branches）、wait（汇聚+waitFor）
- 运行 `svp rehash l4` 修正 hash
- **嵌入 L4Flow JSON schema 示例**

#### `prompts/design-l3.ts`

```typescript
export interface DesignL3Input {
  readonly l4Context: {
    readonly flow: L4Flow;
    readonly stepIndex: number;
    readonly prevBlock?: L3Block;
    readonly nextBlock?: L3Block;
  };
  readonly existingBlock?: L3Block;
  readonly userIntent: string;
}
export function buildDesignL3Prompt(input: DesignL3Input): string
```

Prompt 内容：
- 设计契约盒：pins（input/output，每个有 name + type + optional?）、validate（字段路径→规则字符串）、constraints（输出断言）、description（中间逻辑）
- **validate 约束输入，constraints 约束输出，description 负责中间**
- validate 用自然语言：`"request.items": "array, min 1, max 50"`
- constraints 用自然语言断言：`"output.result.errors contains all failed checks, not just first"`
- type 引用 TypeScript interface 名称（来自项目 `types/` 目录）
- 运行 `svp rehash l3/<id>` 修正 hash
- **嵌入 L3Block JSON schema 示例**

### 5. 编译 Prompt 模板（L2、L1）

这些模板由 SkillRegistry 中的 Skill 使用，通过 orchestrator 派发。

#### `prompts/compile.ts` — 初始编译（L3 → L2+L1）

指导 subagent：
1. 读取 L3 契约（已通过 `resolved.l3` 提供，用 `viewL3Detail` 渲染）
2. 读取 L4 流上下文（已通过 `resolved.l4` 提供）
3. 读取相关类型定义（如果 types/ 目录存在）
4. 生成 L1 源代码：函数签名匹配 L3 pins，实现满足 validate + constraints，内部逻辑参考 description
5. 运行 `svp link <l3-id> --files <paths>` 创建 L2 映射

#### `prompts/recompile.ts` — 重编译

在 compile 基础上额外提供旧 L1 代码（`resolved.l1Files`）和 L2 映射。指导保留不变的逻辑，只修改受影响部分。运行 `svp link` 更新 L2。

#### `prompts/review.ts` — 漂移审查

展示 L3 契约 vs L1 实际导出。AI 判断：L3 需更新？L1 改错了？还是只是格式变化不影响接口？

#### `prompts/update-ref.ts` — 引用修复

L4 引用不存在的 L3。AI 决定：创建缺失的 L3（根据 L4 上下文推断契约）还是修改 L4 step。

### 6. `adapters/claude-code.ts` — CodeCLIAdapter 实现

```typescript
import { createSkillRegistry } from "../core/skill";
import type { CodeCLIAdapter } from "../core/adapter";
import { buildPrompt, renderPrompt } from "./prompt-builder";

function createPromptSkill(action: TaskAction): Skill {
  return {
    action,
    execute: async (input: SkillInput): Promise<SkillResult> => {
      const prompt = buildPrompt(input);
      return {
        action: input.task.action,
        status: "needs-review",
        artifacts: [],
        notes: renderPrompt(prompt),  // prompt 即输出
      };
    },
  };
}

export const claudeCodeAdapter: CodeCLIAdapter = {
  name: "claude-code",
  createSkillRegistry: () => createSkillRegistry([
    createPromptSkill("compile"),
    createPromptSkill("recompile"),
    createPromptSkill("review"),
    createPromptSkill("update-ref"),
  ]),
};
```

### 7. 意图驱动的 Slash Commands

`svp init --host claude-code` 生成到 `.claude/commands/`。每个是 markdown 文件，内含完整工作流指导。

| 命令文件 | 用户意图 | AI 做什么 |
|---|---|---|
| `svp-build.md` | "做一个 X 系统" | L5→L4→L3→L2→L1 全量设计+编译 |
| `svp-add.md` | "加个 Z 步骤" | 编辑 L4 → 设计 L3 → 编译 L2+L1 |
| `svp-change.md` | "把 email 改成可选" | 定位层级 → 修改 → 向下重编译 |
| `svp-fix.md` | "修复 check 问题" | 读 check 报告 → 逐个修复 |
| `svp-check.md` | "检查一下" | `svp check` → 结构化报告 |
| `svp-view.md` | "看一下 L3" | `svp view $ARGUMENTS` |

#### `/svp-build` — 全量设计+编译（最重要的命令）

核心 prompt 结构：

```
你是 SVP 编译器。用户描述了一个系统意图，你从 L5 到 L1 完整设计并实现。

## 核心原则：上下文隔离
你（主 Agent）只维护 L5+L4 级别的拓扑信息（~30 行上下文）。
L3 设计和 L2+L1 编译通过 Agent 工具派发 subagent 完成。
你绝不直接读写 L1 源代码——那是 subagent 的事。

## Step 1: 设计 L5 Blueprint（主 Agent 直接做，~10 行）
- 运行 `svp view l5` 查看当前 blueprint
- 根据用户描述，编辑 .svp/l5.json（嵌入 L5Blueprint JSON schema 示例）
- 运行 `svp rehash l5` 修正 hash
- 展示 `svp view l5` 给用户确认

## Step 2: 设计 L4 Flows（主 Agent 直接做，~20 行/flow）
- 基于 L5 domains，为每个核心流程设计 L4 Flow
- 写入 .svp/l4/<flow-id>.json（嵌入 L4Flow JSON schema 示例）
- 注意：扇出用 parallel step，汇聚用 wait step
- 运行 `svp rehash l4`
- 展示 `svp view l4` 给用户确认

## Step 3: 设计 L3 Contracts（派发 subagent，每个 ~50 行）
对每个 L4 step 引用的 blockRef：
- 用 Agent 工具派发 subagent，prompt 包含：
  - 该 step 在 L4 中的位置（用 `svp view l4/<flow-id>` 输出）
  - 上游/下游 block 的 pin 信息（如果已创建）
  - 用户意图描述
  - L3Block JSON schema 示例
- subagent 创建 .svp/l3/<block-id>.json（pins + validate + constraints + description）
- subagent 运行 `svp rehash l3/<id>`
- **无依赖的 block 并行派发**
- 展示 `svp view l3` 给用户确认

## Step 4: 编译 L2+L1（派发 subagent，每个 ~200 行）
- 运行 `svp compile-plan` 获取任务列表（每个任务带 context refs）
- 对每个 compile 任务派发 subagent，prompt 只包含：
  - 该任务的 L3 契约（`svp view l3/<id>`）
  - 相关类型定义（types/ 目录）
  - 任务描述和输出要求
- subagent 生成 L1 源代码 + 运行 `svp link <l3-id> --files <paths>` 创建 L2
- **无依赖的任务并行派发**
- 主 Agent 只看完成摘要，不读代码

## Step 5: 验证
- 运行 `svp check` 验证一致性
- 如有问题，定位到对应层修复
- 重复直到 check 通过

## 规则
- 严格单向向下，不回头修改上层
- 主 Agent 不读 L1 代码——上下文隔离是核心价值
- 每层完成后展示给用户确认
- 做不到就报错，说清哪层什么问题——用户是反向反馈回路
- 用 `svp rehash` 处理 hash，用 `svp link` 创建 L2
- JSON 中 contentHash 和 revision 写占位值，rehash 会修正
- 尽量并行派发无依赖的 subagent
```

#### `/svp-change` — 修改需求

```
你是 SVP 编译器。定位受影响层级，从该层向下重编译。

Step 1: 定位层级（主 Agent 运行 svp view l5 + svp view l4）
  系统意图变了 → L5 | 流程编排变了 → L4 | 契约规则变了 → L3 | 代码变了 → L1（只报 drift）
  越低层介入越精确越便宜

Step 2: 执行修改（L5/L4 主 Agent 做，L3 派发 subagent）
  运行 svp rehash 更新 hash → 展示给用户确认

Step 3: 向下重编译
  运行 svp compile-plan → 按 /svp-build Step 3/4 模式派发 subagent
  只处理受影响的实体
```

#### `/svp-add` — 添加步骤

```
定位 flow → 编辑 L4 加新 step → 设计新 L3 → 编译新 L2+L1
同 /svp-build Step 2-5，但只处理新增的 block
```

#### `/svp-fix` — 修复 check 问题

```
运行 svp check --json → 按 issue code 分类修复：
  HASH_MISMATCH → svp rehash
  MISSING_BLOCK_REF → 创建 L3 或修改 L4
  SOURCE_DRIFT → svp compile-plan 重编译
  CONTENT_DRIFT → 展示给用户决定
  ORPHAN_STEP / NEXT_CYCLE → 展示给用户修复
```

### 8. `templates/claude-md.ts` — CLAUDE.md SVP Section

```typescript
export function generateClaudeMdSection(projectName: string): string
```

生成内容包括：
- 五层模型说明 + 层间关系图
- `.svp/` 目录结构
- 可用命令列表（svp view/check/compile-plan/rehash/link/compile）
- 逐层渗透规则（三条规则）
- 上下文隔离原则（主 Agent 不读 L1）
- JSON 编辑规则（contentHash 写占位值，rehash 修正）
- 每层 JSON schema 简要示例（L5Blueprint, L4Flow, L3Block）

### 9. `templates/slash-commands.ts` — Slash Command 生成

```typescript
export interface SlashCommandTemplate {
  readonly filename: string;     // e.g., "svp-build.md"
  readonly content: string;      // 完整的 prompt markdown
}
export function generateSlashCommands(): readonly SlashCommandTemplate[]
```

### 10. 增强 `svp init --host`

修改 `packages/core/init.ts` — `InitOptions` 加 `host?: "claude-code"`
修改 `packages/cli/commands/init.ts` — `--host` 选项

当 `--host claude-code` 时额外生成：
1. `.claude/commands/svp-build.md`
2. `.claude/commands/svp-add.md`
3. `.claude/commands/svp-change.md`
4. `.claude/commands/svp-fix.md`
5. `.claude/commands/svp-check.md`
6. `.claude/commands/svp-view.md`
7. 追加 SVP section 到 `CLAUDE.md`（已存在则追加，否则创建）

---

## 实现顺序

### Phase A: 基础工具（rehash + link）

1. 创建 `packages/skills/` 包结构 + `index.ts`
2. 实现 `rehash.ts`（纯函数）+ 测试
3. 实现 `packages/cli/commands/rehash.ts` + 在 `cli/index.ts` 注册
4. 实现 `link.ts`（纯函数）+ 测试
5. 实现 `packages/cli/commands/link.ts` + 在 `cli/index.ts` 注册

### Phase B: Prompt 模板

6. 实现 `prompt-builder.ts`（复用 `core/view.ts`）+ 测试
7. 实现设计 prompts: `design-l5.ts`, `design-l4.ts`, `design-l3.ts`
8. 实现编译 prompts: `compile.ts`, `recompile.ts`, `review.ts`, `update-ref.ts`

### Phase C: Claude Code 集成

9. 实现 `adapters/claude-code.ts` + 测试
10. 实现 `templates/slash-commands.ts`（6 个命令模板）
11. 实现 `templates/claude-md.ts`
12. 增强 `svp init --host claude-code`（修改 init.ts + init CLI）

### Phase D: 验证

13. 单元测试全覆盖（rehash, link, prompt-builder, adapter）
14. 集成测试（svp rehash/link CLI, svp init --host）
15. 端到端：init → /svp-build → check 全绿
16. 回归：`npm test`（208+ tests 通过）+ `npm run check`（tsc + eslint + prettier）

---

## 关键文件清单

### 要修改的文件
| 文件 | 修改内容 |
|---|---|
| `packages/core/init.ts` | `InitOptions` 增加 `host?: "claude-code"` |
| `packages/cli/commands/init.ts` | 注册 `--host` 选项，调用模板生成 |
| `packages/cli/index.ts` | import 并 register link 和 rehash 命令 |

### 要新建的文件（~20 个）
| 文件 | 描述 |
|---|---|
| `packages/skills/index.ts` | 公开 API 导出 |
| `packages/skills/rehash.ts` | rehash 纯函数（复用 `core/hash.ts`） |
| `packages/skills/link.ts` | link 纯函数（复用 `core/hash.ts`） |
| `packages/skills/prompt-builder.ts` | SkillInput → StructuredPrompt（复用 `core/view.ts`） |
| `packages/skills/prompts/design-l5.ts` | L5 设计 prompt 模板 |
| `packages/skills/prompts/design-l4.ts` | L4 设计 prompt 模板 |
| `packages/skills/prompts/design-l3.ts` | L3 设计 prompt 模板 |
| `packages/skills/prompts/compile.ts` | L3→L2+L1 编译 prompt |
| `packages/skills/prompts/recompile.ts` | 重编译 prompt |
| `packages/skills/prompts/review.ts` | 漂移审查 prompt |
| `packages/skills/prompts/update-ref.ts` | 引用修复 prompt |
| `packages/skills/templates/slash-commands.ts` | 6 个 slash command 模板 |
| `packages/skills/templates/claude-md.ts` | CLAUDE.md SVP section |
| `packages/skills/adapters/claude-code.ts` | CodeCLIAdapter 实现 |
| `packages/cli/commands/rehash.ts` | svp rehash CLI 命令 |
| `packages/cli/commands/link.ts` | svp link CLI 命令 |
| `packages/skills/__tests__/rehash.test.ts` | rehash 测试 |
| `packages/skills/__tests__/link.test.ts` | link 测试 |
| `packages/skills/__tests__/prompt-builder.test.ts` | prompt-builder 测试 |
| `packages/skills/__tests__/adapters/claude-code.test.ts` | adapter 测试 |

### 复用的现有代码
| 模块 | 被谁复用 | 具体函数 |
|---|---|---|
| `core/view.ts` | prompt-builder | `viewL3Detail`, `viewL4Detail`, `viewL5Overview`, `viewL2Detail` |
| `core/hash.ts` | rehash, link | `hashL3`, `hashL4`, `hashL5`, `hashL2` |
| `core/store.ts` | CLI commands | `readL5/writeL5`, `readL4/writeL4`, `readL3/writeL3`, `readL2/writeL2`, `listL3/listL4/listL2` |
| `core/skill.ts` | adapter | `Skill`, `SkillInput`, `SkillResult`, `createSkillRegistry` |
| `core/adapter.ts` | adapter | `CodeCLIAdapter` |
| `core/compile-plan.ts` | prompt-builder | `CompileTask`, `ContextRef`, `TaskAction` |
| `core/version.ts` | rehash | `ArtifactVersion`, `VersionSource` |

---

## 验证方案

### 单元测试（vitest）
- **rehash**: 每层 rehash 后 contentHash 正确、revision 递增、幂等（相同内容不改 rev）
- **link**: `createL2Link` 返回正确的 blockRef、sourceHash、contentHash、files
- **prompt-builder**: 每种 action 生成包含正确视图渲染的 prompt
- **adapter**: `claudeCodeAdapter.createSkillRegistry()` 返回 4 个 skill（compile/recompile/review/update-ref），每个 execute() 返回 status="needs-review" + prompt in notes

### 集成测试
- `svp rehash`：写入错误 hash → rehash → `svp check` 无 HASH_MISMATCH
- `svp link`：有 L3 无 L2 → link → `svp check` 无 MISSING_L2
- `svp init --host claude-code`：检查 .claude/commands/ 有 6 个 md 文件 + CLAUDE.md 有 SVP section

### 端到端
1. `svp init --name hello --host claude-code`
2. 在 Claude Code 中 `/svp-build 一个简单的 hello world HTTP 服务`
3. `svp check` → 全绿

### 回归
- `npm test` — 所有 208+ 现有测试通过
- `npm run check` — tsc + eslint + prettier 通过
