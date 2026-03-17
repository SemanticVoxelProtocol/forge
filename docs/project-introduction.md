# SVP — Semantic Voxel Protocol：让人类在 AI 写代码时不失控的五层观测框架

## 一、项目总览：这是什么？

**SVP（Semantic Voxel Protocol）** 是一个全新的软件开发协议和工具链，旨在解决一个日益严峻的问题：**当 AI 生成越来越多的代码时，人类如何保持对系统的理解和控制？**

SVP 不调用 AI API，不造编译器，不造编辑器。它是 AI 编码工具（Claude Code、Cursor 等）的 **增强层**——给 AI 喂更好的上下文，让人类能看懂 AI 在做什么。类似 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 的定位——不造 AI，给 AI 喂更好的上下文。SVP 的能力随 base model 进化自动提升。

项目以 TypeScript monorepo 形式组织，使用 `vitest` 做测试，`eslint` + `prettier` 做代码质量保证，`commander` 构建 CLI。当前版本为 `0.1.0`，处于活跃开发阶段。

---

## 二、核心理念：五个设计原则

SVP 的设计哲学可以用五句话概括：

### 1. 透明优先于正确
SVP 不试图消灭 AI 的错误——这在当前技术条件下是不可能的。SVP 追求的是让错误**可见、可定位、可修复**。当系统出了问题，你可以逐层问下去：意图对吗？流程对吗？契约写够了吗？代码结构对吗？实现忠实吗？问到哪层答案变了，问题就在哪层。

### 2. AI 即编译器
SVP 中大量使用自然语言——validate 规则、constraints 断言、description 描述——因为 **AI 不是 parser，它是编译器**。`"request.items: array, min 1, max 50"` 这样的字符串，人和 AI 都能直觉理解。把它结构化成 `{ field, rule, params }` 只是在给不存在的传统 parser 喂食，增加了复杂度却没有增加表达力。

### 3. 只做真正的声明式
许多框架宣称是"声明式"，实际上只是把命令式代码换了一种语法。SVP 拒绝伪声明式——如果一个规则不能被自动验证，不如用自然语言表达。`validate` 和 `constraints` 就是真正的声明式：它们只声明"什么必须为真"，不关心"怎么实现"。

### 4. 存得少算得多
SVP 严格遵循**单一数据源 + 计算属性**的原则。例如，`signature` 不存储，而是从 `input/output` pins 实时计算；`dataType` 不存储，而是从引用的 pin 类型推导。这消灭了不一致的温床。

### 5. 协议与实现分离
SVP 是一个语言无关的规范。`packages/core/` 定义的 TypeScript 类型是协议的参考实现，但协议本身不绑定任何语言。L3 契约中的 `type` 字段引用 TypeScript interface（因为 AI 对 TypeScript 类型理解最好），但 L1 生成的代码可以是任何语言。

---

## 三、五层数据模型：系统的脊柱

SVP 的核心是一个五层数据模型，每层都是一个**观测窗口**：

```
L5  Blueprint    系统的意图和边界      —— 做什么？
L4  Logic Chain  流程如何编排          —— 怎么串？
L3  Logic Block  每个单元做什么        —— 契约是什么？
L2  Code Block   L3 ↔ L1 的映射       —— 代码在哪？
L1  Code         最终的源代码          —— 怎么写的？
```

层间关系：`L5 ─聚合→ L4 ─聚合→ L3 ←1:1配对→ L2 ─聚合→ L1`

本质上是三个角色：

| 层次 | 谁定义 | 内容 |
|------|--------|------|
| **意图层** (L5 + L4) | 人类 | 做什么、怎么编排 |
| **契约层** (L3) | 人定义，AI 验证 | 每个单元的规格 |
| **实现层** (L2 + L1) | AI 生成，人验收 | 代码结构和源码 |

**L3 是枢纽**——它是人和 AI 之间的接口。人在 L3 写清楚"我要什么"，AI 在 L3 以下实现"怎么做"。工作流是严格单向向下的：

```
人定义 L5 意图 → 人定义 L4 流程 → 人定义 L3 契约 → AI 生成 L2+L1 代码
```

AI 只负责从契约编译到代码，绝不回头修改上层意图。

### 3.1 L5 — Blueprint（系统蓝图）

定义在 `packages/core/l5.ts` 中，L5 是整个系统的最高层抽象：

```typescript
interface L5Blueprint {
  id: string;
  name: string;
  version: string;
  intent: string;          // 核心问题 + 解决方案 + 成功标准（自然语言）
  constraints: string[];   // 功能/非功能/业务约束
  domains: Domain[];       // 领域拓扑
  integrations: Integration[];  // 外部集成点
  language?: string;       // 语言偏好（ISO 639-1）
  revision: ArtifactVersion;
  contentHash: string;
}
```

L5 回答的问题是：**这个系统要解决什么问题？它的边界在哪里？**

`intent` 用自然语言描述核心意图，`constraints` 列出硬性约束，`domains` 描述领域拓扑（哪些子领域、它们之间的依赖关系），`integrations` 声明外部依赖（数据库、API、消息队列、存储）。

值得注意的是 `language` 字段——SVP 内置了国际化支持。设置 `language: "zh"` 后，所有 CLI 输出、check 报告、view 渲染都会切换为中文。

### 3.2 L4 — Logic Chain（流程编排）

定义在 `packages/core/l4.ts` 中，L4 是 SVP 最丰富的一层，支持**三种变体**：

#### Flow（有序管道）
最常见的变体，描述一个步骤序列：

```typescript
interface L4Flow {
  kind?: "flow";
  id: string;
  name: string;
  trigger?: Trigger;         // 触发方式：http、event、schedule、manual
  steps: Step[];             // 步骤序列
  dataFlows: DataFlow[];     // 步骤间的数据传递
  revision: ArtifactVersion;
  contentHash: string;
}
```

每个 `Step` 有四种动作类型：
- `process`：执行一个 L3 block（通过 `blockRef`）
- `call`：调用另一个 L4 flow（通过 `flowRef`，实现复合节点）
- `parallel`：分支并行（通过 `branches`）
- `wait`：等待汇聚（通过 `waitFor`）

`DataFlow` 用 `"stepId.pinName"` 格式描述数据如何在步骤之间流转。

#### EventGraph（事件驱动）
适用于事件驱动系统（如 CRDT 协同编辑）：

```typescript
interface L4EventGraph {
  kind: "event-graph";
  id: string;
  name: string;
  state: Record<string, StateField>;  // 共享状态声明
  handlers: EventHandler[];           // 事件处理器
  revision: ArtifactVersion;
  contentHash: string;
}
```

每个 `EventHandler` 响应一个事件，内部有自己的步骤链。dataFlow 支持特殊前缀 `$state.xxx` 和 `$event.xxx`，分别引用共享状态和事件负载。

#### StateMachine（状态机）
适用于有明确状态转换的业务实体（如订单生命周期）：

```typescript
interface L4StateMachine {
  kind: "state-machine";
  id: string;
  name: string;
  entity: string;           // 管理的实体类型
  initialState: string;
  states: Record<string, StateConfig>;   // 状态配置（onEntry/onExit）
  transitions: Transition[];             // 转换规则
  revision: ArtifactVersion;
  contentHash: string;
}
```

每个状态可以有 `onEntry` 和 `onExit` 钩子（引用 L3 block），转换可以有 `guard`（也是 L3 block，返回 boolean）。

三种变体通过联合类型 `L4Artifact = L4Flow | L4EventGraph | L4StateMachine` 统一，使用 `getL4Kind()` 工具函数区分（向后兼容：无 `kind` 字段默认为 `"flow"`）。

### 3.3 L3 — Logic Block（契约盒）

L3 是 SVP 的灵魂。每个 L3Block 是一个**契约盒子**：

```typescript
interface L3Block {
  id: string;
  name: string;
  input: Pin[];                      // 输入引脚
  output: Pin[];                     // 输出引脚
  validate: Record<string, string>;  // 输入约束
  constraints: string[];             // 输出约束 + 不变量
  description: string;               // 中间逻辑（自然语言）
  revision: ArtifactVersion;
  contentHash: string;
}
```

一个节点有两层信息：

**形式化层**（精确，机器可验证，不能丢）：
- `pins` — 数据形状（类型系统）
- `validate` — 输入必须满足什么
- `constraints` — 输出必须满足什么 + 不变量

**自由层**（自然语言，AI 自由理解和实现）：
- `description` — 中间逻辑：怎么算、怎么分支、什么副作用

形式化层构成一个**契约盒子**：输入被 validate 夹住，输出被 constraints 夹住。盒子里面的实现交给 description + AI 编译器。AI 可能实现得不完美，但 validate 和 constraints 构成的契约可以自动验证——**不是帮 AI 理解，而是 AI 理解错了的时候能被发现。**

`validate` 使用简洁的规则语法，如 `"request.items: array, min 1, max 50"`，支持 required、optional、类型名、uuid、email、url、min/max、比较操作符、pattern 正则、one of 枚举等。

`constraints` 使用受限的断言语言，如 `"if output.result.valid then output.result.errors is empty"`，支持比较、类型断言、空值断言、蕴含 (if/then)、当且仅当 (iff)、计数、包含、全称/存在量词等。

### 3.4 L2 — Code Block（代码映射）

L2 是 L3 和 L1 之间的桥梁，记录每个 L3 block 对应哪些源文件：

```typescript
interface L2CodeBlock {
  id: string;
  blockRef: string;          // 对应的 L3 block ID
  language: string;          // 实现语言
  files: string[];           // 源文件路径
  sourceHash: string;        // 编译时 L3 的 contentHash
  signatureHash?: string;    // L1 导出签名的哈希
  revision: ArtifactVersion;
  contentHash: string;
}
```

`sourceHash` 记录"编译时 L3 长什么样"，`signatureHash` 记录"L1 代码导出了什么"。当这两个哈希与当前实际值不匹配时，SVP 就能检测到"漂移"——要么 L3 改了代码没跟上（SOURCE_DRIFT），要么代码改了 L3 没同步（CONTENT_DRIFT）。

### 3.5 L1 — Code（最终源代码）

L1 就是文件系统中的实际源代码。SVP 不直接管理 L1，而是通过 L2 的哈希机制跟踪它。

---

## 四、数据存储：.svp/ 目录

所有层数据存放在项目根目录的 `.svp/` 下：

```
.svp/
├── l5.json           # L5 蓝图（一个项目一份）
├── l4/               # L4 逻辑链（每个流程一个 JSON 文件）
│   └── order-flow.json
├── l3/               # L3 逻辑块（每个单元一个 JSON 文件）
│   └── validate-order.json
└── l2/               # L2 代码块（与 L3 一一配对）
    └── validate-order.json
```

存储层由 `packages/core/store.ts` 实现，提供简洁的 CRUD API：

- `readL5(root)` / `writeL5(root, blueprint)`
- `readL4(root, id)` / `writeL4(root, artifact)` / `listL4(root)`
- `readL3(root, id)` / `writeL3(root, block)` / `listL3(root)`
- `readL2(root, id)` / `writeL2(root, codeBlock)` / `listL2(root)`
- `readNodeDocs(root, nodeId)` / `readGraphDocs(root, graphName)`

所有数据以格式化 JSON 存储（`JSON.stringify(data, null, 2)`），方便 diff 和人工审查。

---

## 五、核心引擎：check、compile-plan、hash

### 5.1 svp check — 层间一致性校验

`packages/core/check.ts` 实现了 SVP 最关键的功能——跨层一致性校验。check 是一个纯函数，接收所有层的数据，输出问题报告：

```typescript
function check(input: CheckInput, language?: string): CheckReport
```

校验分为四大类：

**1. Hash 一致性** — `HASH_MISMATCH`
每个层的 `contentHash` 必须与实际内容匹配。编辑数据后忘了 rehash，这里就会报错。check 对 L5、L4、L3、L2 四层都做 hash 验证。

**2. 引用完整性** — `MISSING_BLOCK_REF` / `MISSING_FLOW_REF` / `MISSING_STEP_REF` / `MISSING_PIN`
所有层间引用必须指向存在的实体。这包括：
- L4 Flow 的 step.blockRef → L3 必须存在
- L4 Flow 的 step.flowRef → L4 必须存在
- L4 step 的 next/branches/waitFor → 同 flow 内的 step 必须存在
- L4 dataFlow 的 stepId.pinName → step 必须存在且对应 L3 block 上有该 pin
- L4 EventGraph 的 $state.xxx → state 声明中必须有该 key
- L4 StateMachine 的 onEntry/onExit/guard → L3 必须存在
- L4 StateMachine 的 transition from/to → state 必须存在
- L2 blockRef → L3 必须存在

**3. 漂移检测** — `SOURCE_DRIFT` / `CONTENT_DRIFT`
- SOURCE_DRIFT：L3 改了，L2 还没重编译（L2.sourceHash ≠ L3.contentHash）
- CONTENT_DRIFT：L1 代码改了，L2 记录的签名过时（L2.signatureHash ≠ 实际导出签名）

**4. 图结构合法性** — `NEXT_CYCLE` / `ORPHAN_STEP` / `SELF_REFERENCING_FLOW` / `DUPLICATE_EVENT` / `UNREACHABLE_STATE` 等
- Flow/EventGraph：检测 next 链中的循环、不可达的孤立步骤、自引用
- EventGraph：检测重复事件处理器、空 state 声明
- StateMachine：检测无效 initialState、无效转换、不可达状态

每个问题都有 severity（error/warning）、layer、entityId、code、message。错误信息通过 i18n 系统支持英文和中文。

### 5.2 svp compile-plan — 智能任务规划

`packages/core/compile-plan.ts` 基于 check 的漂移检测，自动生成结构化的编译任务清单：

```typescript
function compilePlan(input: CheckInput, language?: string): CompilePlan
```

它检测四类场景：

1. **缺失编译** — 有 L3 但没有对应 L2 → 生成 `compile` 任务
2. **重编译** — L3 变了，L2 的 sourceHash 过期 → 生成 `recompile` 任务
3. **内容漂移** — L1 导出签名变了 → 生成 `review` 任务
4. **断裂引用** — L4 引用不存在的 L3 → 生成 `update-ref` 任务

每个任务包含：
- `action`：compile / recompile / update-ref / review
- `targetLayer` + `targetId`：目标层和实体
- `reason`：人类可读的原因
- `context`：AI subagent 需要参考的上下文引用列表
- `complexity`：heavy / standard / light（指导 AI 分配资源）

compile-plan 还做去重——同一个 target 可能被多个检测器命中，只保留一条任务。

### 5.3 Hash 系统

SVP 的变更追踪基于内容哈希。每个层的数据对象（去掉 `contentHash`、`revision`、`sourceHash` 等元数据字段）计算出一个哈希值。对象先 JSON 序列化（key 排序确保确定性），然后用 SHA-256 截取前 16 位十六进制。

`packages/core/hash.ts` 提供了 `computeHash`、`hashL3`、`hashL4`、`hashL5`、`hashL2` 等函数。rehash 后 `svp check` 就能通过 hash 一致性检查。

---

## 六、CLI 工具链：svp 命令

`packages/cli/index.ts` 使用 Commander.js 构建了一个完整的 CLI，包含 9 个顶层命令：

### 6.1 svp init
初始化 `.svp/` 目录结构 + 写入初始 L5 blueprint：
```bash
svp init --name my-app --intent "做什么" --host <host>
```
- 创建 `.svp/l2/`、`.svp/l3/`、`.svp/l4/` 目录
- 生成初始 L5 blueprint（自动检测系统语言）
- 如果指定 `--host <host>`（支持 `claude-code`、`cursor`、`windsurf`、`kimi-code`、`codex`、`github-copilot`），会在对应工具目录生成 skill 文件并追加上下文配置

### 6.2 svp check
运行跨层一致性校验：
```bash
svp check --json
```
加载所有层数据，调用 `check()` 纯函数，输出问题报告。支持 `--json` 结构化输出。

### 6.3 svp view
查看层数据的人类友好文本视图：
```bash
svp view l5            # L5 蓝图概览
svp view l4            # 所有 L4 流程概览
svp view l4 order-flow # L4 流程详情
svp view l3            # 所有 L3 块概览
svp view l3 greet      # L3 块详情
svp view l2            # 所有 L2 代码块
```
Overview 模式把每个实体压缩成一行，Detail 模式展示完整信息。视图由 `packages/core/view.ts` 的纯函数渲染，支持 i18n。

### 6.4 svp compile-plan
生成编译任务清单：
```bash
svp compile-plan --json
```
输出哪些 L3 block 需要编译、重编译、审查或修复引用。

### 6.5 svp prompt
生成上下文感知的 AI 提示词——这是 SVP 与 AI 工具交互的核心接口。包含 7 个子命令：

**任务类（操作已有数据）：**
```bash
svp prompt compile <l3-id>      # L3 → L1 首次编译
svp prompt recompile <l3-id>    # L3 变更后重编译
svp prompt review <l3-id>       # L1 手改后审查漂移
svp prompt update-ref <l4-id>   # 修复断裂的 L4 引用
```

**设计类（创建新层数据）：**
```bash
svp prompt design-l5 --intent "描述系统意图"
svp prompt design-l4 --intent "描述流程" --kind flow|event-graph|state-machine
svp prompt design-l3 <block-id> --flow <flow-id> --step <index> --intent "描述单元"
```

每个 prompt 子命令的流程是：加载 `.svp/` 状态 → 构造合成 CompileTask → resolve 上下文 → buildPrompt 构建结构化提示 → renderPrompt 渲染为 markdown → stdout 输出。

### 6.6 svp rehash
重算哈希值：
```bash
svp rehash l3          # 重算所有 L3 的 contentHash
svp rehash l3/greet    # 重算指定 L3
svp rehash l4          # 重算所有 L4
svp rehash l5          # 重算 L5
```

### 6.7 svp link
创建/更新 L2 映射：
```bash
svp link greet --files src/greet.ts
```

### 6.8 svp compile-blueprint
编译 svp-blueprint 节点格式（YAML → JSON）。

### 6.9 svp blueprint
生成自包含的 HTML 可视化节点图查看器：
```bash
svp blueprint                     # 当前目录，打开浏览器
svp blueprint -r examples/order-service   # 指定项目
svp blueprint -o blueprint.html   # 输出到文件
```

---

## 七、Skills 系统：AI Prompt 工程

`packages/skills/` 是 SVP 的 AI 交互层——它不调用 AI API，而是生成高质量的结构化 prompt，喂给用户已有的 AI 工具。

### 7.1 Skill 类型系统

定义在 `packages/core/skill.ts` 中，Skill 被设计为纯函数：`(task + context) → artifacts + notes`

```typescript
interface SkillInput {
  task: CompileTask;        // 什么任务
  resolved: ResolvedContext; // 预解析好的上下文数据
  config: SkillConfig;       // 行为约束
}

interface SkillResult {
  action: TaskAction;
  status: "done" | "needs-review" | "blocked";
  artifacts: Artifact[];    // 生成的层制品
  notes: string;            // AI 给人类的说明
}
```

编排层负责所有 IO（解析上下文、写磁盘、跑收敛循环），Skill 本身不做 IO。

### 7.2 Prompt Builder

`packages/skills/prompt-builder.ts` 将 SkillInput 转换为结构化的 markdown prompt：

```typescript
interface StructuredPrompt {
  role: string;        // 角色定义
  context: string;     // L5 概览等项目上下文
  task: string;        // 具体任务描述
  input: string;       // L3 契约、L2 映射、L1 代码等
  outputSpec: string;  // 输出规格要求
  rules: string;       // 通用规则 + 语言指令
  complexity: Complexity;  // heavy / standard / light
}
```

四种动作有各自的角色定义：
- **compile**："You are an SVP compiler subagent. Your job is to implement L1 source code from an L3 contract specification."
- **recompile**："You are an SVP recompiler subagent. An L3 contract has changed — update the L1 source code to match while preserving unchanged logic."
- **review**："You are an SVP review subagent. L1 code has drifted from its L3 contract. Analyze the difference and recommend."
- **update-ref**："You are an SVP reference repair subagent. An L4 flow references an L3 block that doesn't exist."

通用规则强制执行 SVP 的核心不变量：
- 严格向下只写——不修改上层
- 使用 `svp rehash` 修复 contentHash
- 使用 `svp link` 创建 L2 映射
- 保持实现最小化——满足契约，仅此而已

### 7.3 Design Prompts

除了任务类 prompt，SVP 还有三个设计类 prompt 生成器：

- `design-l5.ts` — 生成 L5 蓝图设计 prompt，注入 L5Blueprint 类型定义和设计指导
- `design-l4.ts` / `design-l4-event-graph.ts` / `design-l4-state-machine.ts` — 生成三种 L4 变体的设计 prompt
- `design-l3.ts` — 生成 L3 契约设计 prompt，注入前后步骤的上下文

每个设计 prompt 都会注入相应层的 TypeScript 类型定义作为 schema 参考，并提供具体的设计指导。

### 7.4 多工具集成（Adapter 系统）

`packages/skills/adapters/` 实现了插件化的多工具适配器系统，支持 6 种 AI 编码工具：

| Host | Skill 目录 | 上下文文件 |
|------|-----------|-----------|
| `claude-code` | `.claude/commands/` | `CLAUDE.md` |
| `cursor` | `.cursor/commands/` | `.cursor/rules/svp.mdc` |
| `windsurf` | `.windsurf/commands/` | `.windsurf/rules/svp.md` |
| `kimi-code` | `.agents/skills/` | `AGENTS.md` |
| `codex` | `.codex/skills/` | `AGENTS.md` |
| `github-copilot` | `.github/prompts/` | `.github/copilot-instructions.md` |

核心设计：所有 SVP 协议内容（工作流、CLI 命令、五层模型）集中在 `shared.ts` 维护，每个 adapter 只提供路径、模型名称等 host 特定配置。SVP 协议演进时只需改 `shared.ts`，所有 adapter 自动同步。

初始化时指定 `--host <host>`，对应的 skill 文件和上下文配置会自动生成。不指定 `--host` 时，SVP 会自动检测项目中的工具标记。

---

## 八、蓝图查看器：可视化节点图

`packages/viewer/` 实现了一个 **Unreal Engine Blueprint 风格**的可视化查看器——暗色主题 + 网格背景，节点卡片用深色调，类型着色连线。

查看器特性：
- **节点即契约盒** — 每个节点显示 L3 block 的 name、description（2 行截断）、pins（按类型着色），点击展开查看 validate 和 constraints
- **类型着色系统** — pin 圆点和数据流连线的颜色由类型名 hash 生成（HSL），同类型 pin 自动同色
- **执行流标记** — 节点头部左右各有三角形执行引脚，表示执行流方向
- **三种 L4 变体** — 支持 Flow、EventGraph、StateMachine 三种不同的图渲染
- **零依赖自包含** — 单个 HTML 文件内联所有 CSS/JS/数据，无需服务器，离线可用
- **平移/缩放** — 鼠标拖拽平移，滚轮缩放
- **侧栏导航** — 项目概览、L4 列表、L3 列表、健康仪表盘
- **搜索** — 全局搜索节点和流程

查看器使用 Vite + React/Preact 构建（开发模式），但最终产物是一个自包含的 HTML 文件。

---

## 九、国际化系统

`packages/core/i18n.ts` 实现了一个轻量的消息目录系统：

- `t(lang, key, params?)` — 查找翻译，英文兜底，支持 `{param}` 插值
- `detectSystemLanguage()` — 从 `LANG`/`LC_ALL` 环境变量检测语言
- `getLanguage(l5?)` — 从 L5 提取语言偏好，缺省用系统语言
- `languageDirective(lang)` — 在 AI prompt 中注入语言输出指令

当前支持英文和中文两种语言，覆盖了 check 错误消息、compile-plan 原因描述、view 渲染标签、CLI 提示信息、viewer UI 文本等所有用户可见的字符串。

这意味着：如果你的 L5 设置了 `language: "zh"`，整个工具链——从 `svp check` 的错误报告到 `svp view` 的数据展示再到 AI prompt 中的语言指令——都会切换为中文。

---

## 十、示例项目

### 10.1 Hello World

`examples/hello-world/` 是最小的 SVP 项目：接收名字 → 生成问候语 → 转大写。

**L3 greet.json：**
```json
{
  "id": "greet",
  "name": "greet",
  "input": [{ "name": "name", "type": "string" }],
  "output": [{ "name": "greeting", "type": "Greeting" }],
  "validate": { "name": "string" },
  "constraints": [
    "output.greeting.message is not empty",
    "output.greeting.timestamp is not empty"
  ],
  "description": "接收名字，生成问候消息 \"Hello, {name}!\"。如果名字为空，使用 \"World\" 作为默认值。附带当前时间戳。"
}
```

**L4 hello-world.json：**
```json
{
  "id": "hello-world",
  "name": "hello-world",
  "steps": [
    { "id": "g", "action": "process", "blockRef": "greet", "next": "u" },
    { "id": "u", "action": "process", "blockRef": "uppercase" }
  ],
  "dataFlows": [
    { "from": "g.greeting", "to": "u.greeting" }
  ]
}
```

两个步骤串联：greet 的 greeting 输出流向 uppercase 的 greeting 输入。简洁明了。

### 10.2 Order Service

`examples/order-service/` 是一个更真实的电商订单服务，展示了 SVP 的组合能力：

- **order-service.json**（顶层 L4）：一个 `call` 步骤调用 `order-pipeline`
- **order-pipeline.json**（复合 L4）：包含 validate-order → check-inventory → process-order 的完整流程
- **validate-order.json / check-inventory.json / process-order.json**（L3 blocks）：各自定义了完整的契约

这个例子展示了 L4 的 `call` 机制——顶层 flow 通过 `flowRef` 引用子 flow，实现层次化的流程组织。每个 L3 block 都有完整的 validate 规则和 constraints，如 validate-order 检查用户 ID、商品列表、邮箱格式等。

### 10.3 Cockatiel Resilience

`examples/cockatiel-resilience/` 展示了 SVP 如何描述弹性模式——可能涉及断路器、重试策略等分布式系统模式。

---

## 十一、模块化文档系统

SVP 支持一种可选的**模块化文档**机制，让每个节点可以携带超出 `description` 字段的丰富上下文。

### 文件位置
```
nodes/my-node/
├── node.yaml          # 契约（pins, validate, constraints, description）
└── docs.md            # 模块化文档（可选）
```

### 与 description 的关系
- **description** 是摘要（1-4 句话），嵌入 L3Block，参与编译流程
- **docs.md** 是详述，独立文件，按需加载，**不影响 contentHash**

推荐的文档结构包含：Intent（设计意图）、Edge Cases（边界情况）、Error Strategy（错误处理策略）、Integration Notes（集成约定）、Examples（输入输出示例）。

`svp prompt compile/recompile/review` 时会自动加载并注入 prompt，让 AI 在编译时能获得更多上下文。

---

## 十二、测试策略

项目使用 Vitest 作为测试框架，测试文件与源码共存（`*.test.ts`）。

核心模块的测试覆盖包括：
- `check.test.ts` — 测试所有四类校验（hash 一致性、引用完整性、漂移检测、图结构），覆盖三种 L4 变体
- `compile-plan.test.ts` — 测试四类任务生成（缺失编译、重编译、内容漂移、断裂引用）
- `store.test.ts` — 测试 JSON 读写、目录创建
- `i18n.test.ts` — 测试翻译查找、参数插值、语言检测
- `prompt.test.ts` — 测试 prompt 生成流程
- `design-prompts.test.ts` — 测试设计类 prompt 生成
- `prompt-builder.test.ts` — 测试 StructuredPrompt 构建和渲染

`tests/` 目录下还有端到端测试，验证完整的 CLI 流程。

所有核心逻辑（check、compile-plan、view、prompt-builder）都是纯函数——不做 IO，方便测试和复用。

---

## 十三、版本追踪

每个层的数据对象都包含 `revision` 字段：

```typescript
interface ArtifactVersion {
  rev: number;              // 版本号
  parentRev: number | null; // 父版本
  source: VersionSource;    // 来源（init / human / ai / tool）
  timestamp: string;        // ISO 时间戳
}
```

这让每次修改都有迹可循——是人手动改的、AI 生成的、还是工具自动修改的。

---

## 十四、工作流：从意图到代码的完整旅程

一个典型的 SVP 工作流是这样的：

### 阶段一：设计意图（人）
```bash
svp init --name my-app --intent "做什么" --host <host>
svp prompt design-l5 --intent "详细描述系统"
# AI 生成 L5 → 人审查 → 写入 .svp/l5.json
svp rehash l5
```

### 阶段二：设计流程（人）
```bash
svp prompt design-l4 --intent "描述流程" --kind flow
# AI 生成 L4 → 人审查 → 写入 .svp/l4/
svp rehash l4
```

### 阶段三：设计契约（人 + AI）
```bash
svp prompt design-l3 validate-order --flow order-flow --step 0 --intent "校验订单"
# AI 生成 L3 → 人审查 → 写入 .svp/l3/
svp rehash l3
svp check  # 确保一致性
```

### 阶段四：编译代码（AI）
```bash
svp compile-plan           # 查看待编译任务
svp prompt compile greet   # 生成 compile prompt
# AI 生成 L1 代码
svp link greet --files src/greet.ts
svp rehash l2
svp check  # 全部通过 ✓
```

### 阶段五：变更维护
当 L3 契约变更时：
```bash
svp rehash l3/validate-order
svp compile-plan  # 自动检测到 recompile 任务
svp prompt recompile validate-order
# AI 更新代码
```

当 L1 代码被手动修改时：
```bash
svp check  # 报告 CONTENT_DRIFT
svp prompt review validate-order
# AI 分析漂移，建议如何处理
```

---

## 十五、架构亮点

### 纯函数设计
`check`、`compilePlan`、`buildPrompt`、`renderPrompt`、所有 `view*` 函数都是纯函数。它们不做 IO，不依赖全局状态，输入确定则输出确定。这让它们极易测试和复用。

### 关注点分离
- `core/` — 类型定义 + 纯逻辑
- `skills/` — prompt 生成 + 模板
- `cli/` — IO + 用户交互
- `viewer/` — 可视化渲染

CLI 负责加载数据（IO），传给 core 的纯函数处理，再输出结果。Skill 负责组装 prompt，不关心数据从哪来。

### 计算属性模式
很多信息不存储而是实时计算：
- `signature` — 从 input/output pins 计算
- `dataType` — 从引用的 pin 类型推导
- `blockRefs` — 用 `extractBlockRefs()` 从 L4 结构中收集
- `blockContext` — 用 `findBlockContext()` 定位 block 在 L4 中的位置

### 向后兼容
L4 的 `kind` 字段是可选的——没有 `kind` 默认为 `"flow"`。这让旧数据无需迁移。

---

## 十六、技术栈

| 技术 | 用途 |
|------|------|
| TypeScript 5.7+ | 主语言，strict 模式 |
| ES2023 + NodeNext | 编译目标和模块系统 |
| Commander.js 14 | CLI 框架 |
| Vitest 4 | 测试框架 |
| ESLint 10 + Prettier 3 | 代码质量 |
| yaml 2.8 | YAML 解析（svp-blueprint 节点格式） |
| Vite | Viewer 构建工具 |
| Node.js crypto | SHA-256 哈希计算 |

零运行时依赖（仅 `commander` 和 `yaml`），保持工具链轻量。

---

## 十七、总结：SVP 的独特价值

SVP 不是又一个 AI 编码工具，不是又一个代码生成框架。它是一个**观测协议**——让人类在 AI 越来越多地参与编码时，依然能看清系统的全貌。

它的核心洞察是：**控制来自观测，而非限制。** 你不需要限制 AI 能做什么，你需要的是能看清 AI 做了什么。五层数据模型就是五个观测窗口。当系统出了问题——而它一定会出问题——你能迅速定位问题在哪一层，然后修复它。

L3 契约盒模型是另一个精妙的设计：形式化的 validate 和 constraints 构成可自动验证的外壳，自然语言的 description 给 AI 足够的实现自由度。**不是帮 AI 理解，而是 AI 理解错了的时候能被发现。**

SVP 选择做增强层而非替代品，意味着它能与任何 AI 编码工具配合使用，而且随着 base model 能力的提升，SVP 的编译质量会自动提升——无需修改协议本身。

这是一个仍在活跃开发中的项目（v0.1.0），但核心架构已经成型。五层模型、check 引擎、compile-plan、prompt 系统、蓝图查看器——所有主要组件都已就位，形成了一个完整的从意图到代码的工作流。
