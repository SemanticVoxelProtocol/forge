# SVP 使用教程

> 本教程带你从零开始，用 SVP 工具链完成一个完整的 AI 辅助开发流程。
> 读完之后你会理解 SVP 的五层数据模型、核心 CLI 命令，以及如何用 SVP 指挥 AI 写代码。

---

## 目录

1. [SVP 是什么](#1-svp-是什么)
2. [安装与准备](#2-安装与准备)
3. [核心概念：五层数据模型](#3-核心概念五层数据模型)
4. [快速上手：Hello World](#4-快速上手hello-world)
5. [CLI 命令速查](#5-cli-命令速查)
6. [完整工作流：订单服务](#6-完整工作流订单服务)
7. [变更与维护](#7-变更与维护)
8. [与 AI 编码工具集成](#8-与-ai-编码工具集成)
9. [常见问题](#9-常见问题)

---

## 1. SVP 是什么

SVP（Semantic Voxel Protocol）是一个**五层观测框架**，让人类在 AI 写代码时保持控制。

核心思路很简单：AI 生成的代码越来越多，你不可能逐行审查。SVP 把软件系统拆成五个抽象层，每层都是一个**观测窗口**——出了问题，逐层问下去，问到哪层答案变了，问题就在哪层。

SVP 不调 AI API，不造编辑器。它是 AI 编码工具（Claude Code 等）的**增强层**——给 AI 喂更好的上下文，让人类能看懂 AI 在做什么。

---

## 2. 安装与准备

### 从源码构建

```bash
git clone <repo-url>
cd svp-blueprint
npm install
npm run build
```

构建后 CLI 入口在 `dist/packages/cli/index.js`，可以通过 `npx svp` 或 `node dist/packages/cli/index.js` 运行。

### 验证安装

```bash
npx svp --help
```

你应该能看到所有可用命令的列表。

---

## 3. 核心概念：五层数据模型

```
L5  Blueprint    系统要做什么 —— 意图、边界、领域拓扑
L4  Logic Chain  流程怎么编排 —— 步骤、顺序、数据传递
L3  Logic Block  每个单元做什么 —— 输入输出、校验规则、约束条件
L2  Code Block   代码怎么组织 —— 文件映射、对账哈希
L1  Code         最终的源代码
```

**层间关系：**

```
L5 ─聚合→ L4 ─聚合→ L3 ←1:1配对→ L2 ─聚合→ L1
```

本质是三个角色：

| 层次 | 谁定义 | 内容 |
|------|--------|------|
| **意图层** (L5 + L4) | 人 | 做什么、怎么编排 |
| **契约层** (L3) | 人定义，AI 验证 | 每个单元的规格 |
| **实现层** (L2 + L1) | AI 生成，人验收 | 代码结构和源码 |

**L3 是枢纽**——它是人和 AI 之间的接口。人在 L3 写清楚"我要什么"，AI 在 L3 以下实现"怎么做"。

### 数据存储

所有层数据存放在项目根目录的 `.svp/` 下：

```
.svp/
├── l5.json           # L5 蓝图（一个项目一份）
├── l4/               # L4 逻辑链（每个流程一个文件）
│   └── order-flow.json
├── l3/               # L3 逻辑块（每个单元一个文件）
│   └── validate-order.json
└── l2/               # L2 代码块（与 L3 一一配对）
    └── validate-order.json
```

---

## 4. 快速上手：Hello World

我们来构建一个最小的 SVP 项目：接收名字 → 生成问候语 → 转大写。

### 4.1 初始化项目

```bash
mkdir hello-svp && cd hello-svp
npx svp init --name hello-svp --intent "接收名字，生成大写问候语"
```

这会创建 `.svp/l5.json`（空的蓝图框架）。

### 4.2 设计 L5 蓝图

让 AI 帮你设计系统级蓝图：

```bash
npx svp prompt design-l5 --intent "接收名字，生成问候语，转成大写输出"
```

这会输出一段结构化的 prompt。把它发给 AI（Claude Code 等），AI 会生成 L5 蓝图的 JSON 内容，写入 `.svp/l5.json`。

写完后刷新哈希：

```bash
npx svp rehash l5
```

### 4.3 设计 L4 流程

设计处理流程——两个步骤串联：

```bash
npx svp prompt design-l4 --intent "greet → uppercase 串行管道" --kind flow
```

AI 会生成 L4 flow 文件。它的结构看起来像这样：

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

`steps` 定义了步骤和顺序，`dataFlows` 定义了步骤之间的数据传递。每个 step 通过 `blockRef` 引用一个 L3 逻辑块。

```bash
npx svp rehash l4
```

### 4.4 设计 L3 逻辑块

为每个步骤设计契约。以 `greet` 块为例：

```bash
npx svp prompt design-l3 greet --flow hello-world --step 0 --intent "接收名字，生成问候消息"
```

AI 会生成 L3 block —— 一个**契约盒**：

```json
{
  "id": "greet",
  "name": "greet",
  "input": [
    { "name": "name", "type": "string" }
  ],
  "output": [
    { "name": "greeting", "type": "Greeting" }
  ],
  "validate": {
    "name": "string"
  },
  "constraints": [
    "output.greeting.message is not empty",
    "output.greeting.timestamp is not empty"
  ],
  "description": "接收名字，生成问候消息 \"Hello, {name}!\"。\n如果名字为空，使用 \"World\" 作为默认值。\n附带当前时间戳。"
}
```

注意：`validate` 和 `constraints` 用自然语言——AI 直接理解，不需要结构化的规则引擎。

同样为 `uppercase` 设计 L3，然后：

```bash
npx svp rehash l3
```

### 4.5 校验

到这里，你已经定义了意图层 (L5+L4) 和契约层 (L3)。运行校验：

```bash
npx svp check
```

它会检查：
- **Hash 一致性** — contentHash 和实际内容是否匹配
- **引用完整性** — L4 step 引用的 L3 block 是否存在
- **图结构** — 流程步骤是否形成有效链

全部通过后，就可以让 AI 生成代码了。

### 4.6 编译：AI 生成代码

生成编译任务列表：

```bash
npx svp compile-plan
```

输出会告诉你哪些 L3 block 需要编译（生成 L1 代码）。然后为每个任务生成 prompt：

```bash
npx svp prompt compile greet
```

这段 prompt 包含了 AI 需要的全部上下文：L3 契约、pin 类型、校验规则、约束条件。把它发给 AI，AI 会生成源代码文件（比如 `src/greet.ts`）。

### 4.7 链接：建立 L2 映射

AI 生成代码后，用 `link` 命令建立 L3 ↔ L1 的映射关系：

```bash
npx svp link greet --files src/greet.ts
npx svp link uppercase --files src/uppercase.ts
npx svp rehash l2
```

这会创建 L2 代码块，记录每个 L3 block 对应哪些源文件。

### 4.8 最终校验

```bash
npx svp check
```

全部通过——你的项目从意图到代码，每一层都完整、一致、可追踪。

---

## 5. CLI 命令速查

| 命令 | 用途 | 示例 |
|------|------|------|
| `svp init` | 初始化项目 | `svp init --name my-app --intent "..." --host <host>` |
| `svp check` | 跨层一致性校验 | `svp check --json` |
| `svp view` | 查看层数据 | `svp view l3 greet` |
| `svp compile-plan` | 生成编译任务 | `svp compile-plan --json` |
| `svp prompt` | 生成 AI prompt | `svp prompt compile greet` |
| `svp link` | 创建/更新 L2 映射 | `svp link greet --files src/greet.ts` |
| `svp rehash` | 重算哈希 | `svp rehash l3/greet` |
| `svp compile-blueprint` | YAML → JSON 编译 | `svp compile-blueprint` |
| `svp blueprint` | 生成可视化节点图 | `svp blueprint -r . -o blueprint.html` |

### svp view 详解

```bash
svp view l5            # L5 蓝图概览
svp view l4            # 所有 L4 流程概览（每个流程一行）
svp view l4 order-flow # L4 流程详情（步骤图、数据流、引用关系）
svp view l3            # 所有 L3 块概览（签名、校验规则数、约束数）
svp view l3 greet      # L3 块详情（完整 pins、规则、约束、描述）
svp view l2            # 所有 L2 代码块（语言、文件、哈希状态）
svp view l2 greet      # L2 详情（文件列表、哈希状态、配对 L3）
```

Overview 把每个实体压缩成一行，供 AI 快速浏览全局拓扑；Detail 展示完整信息但不展开其他层。

### svp prompt 详解

**设计类**（创建新层数据）：

```bash
svp prompt design-l5 --intent "描述系统意图"
svp prompt design-l4 --intent "描述流程" [--kind flow|event-graph|state-machine]
svp prompt design-l3 <block-id> --flow <flow-id> --step <index> --intent "描述单元"
```

**任务类**（已有数据的编译/维护）：

```bash
svp prompt compile <l3-id>      # L3 → L1 首次编译
svp prompt recompile <l3-id>    # L3 变更后重编译
svp prompt review <l3-id>       # L1 手改后审查漂移
svp prompt update-ref <l4-id>   # 修复断裂的 L4 引用
```

---

## 6. 完整工作流：订单服务

一个更真实的例子：电商订单流程。

### 第一步：设计意图

```bash
svp init --name order-service --intent "电商订单创建：校验→库存→处理→支付"
svp prompt design-l5 --intent "订单管理系统，支持创建订单、校验、库存检查、支付"
# AI 生成 L5 → 写入 .svp/l5.json
svp rehash l5
```

### 第二步：设计流程

```bash
svp prompt design-l4 --intent "订单创建流程：validate → check-inventory → process → pay" --kind flow
# AI 生成 L4 flow → 写入 .svp/l4/order-flow.json
svp rehash l4
```

### 第三步：设计每个 block 的契约

```bash
svp prompt design-l3 validate-order --flow order-flow --step 0 --intent "校验订单请求字段"
svp prompt design-l3 check-inventory --flow order-flow --step 1 --intent "检查库存是否充足"
svp prompt design-l3 process-order --flow order-flow --step 2 --intent "处理订单，生成订单号"
svp prompt design-l3 process-payment --flow order-flow --step 3 --intent "调用支付网关"
# AI 分别生成 4 个 L3 block
svp rehash l3
svp check
```

### 第四步：编译代码

```bash
svp compile-plan
# 输出 4 个 compile 任务

svp prompt compile validate-order
# AI 生成 src/validate-order.ts
svp link validate-order --files src/validate-order.ts

svp prompt compile check-inventory
# AI 生成 src/check-inventory.ts
svp link check-inventory --files src/check-inventory.ts

# ... 对每个 block 重复
svp rehash l2
svp check   # 全部通过 ✓
```

### 关键洞察

注意工作流是**严格单向向下**的：

```
人定义 L5 意图 → 人定义 L4 流程 → 人定义 L3 契约 → AI 生成 L2+L1 代码
```

AI 只负责从契约编译到代码，绝不回头修改上层意图。如果 AI 在编译时发现 L3 契约有问题（比如缺一个输入参数），它会报错返回，而不是擅自修改 L3。**你（人类）是反向反馈回路。**

---

## 7. 变更与维护

项目不会一成不变。SVP 通过哈希追踪变更，自动检测需要重编译的范围。

### 场景 A：修改 L3 契约（自上而下）

你决定给 `validate-order` 增加一个新的校验规则：

```bash
# 1. 编辑 .svp/l3/validate-order.json，添加新的 validate 规则
# 2. 重算哈希
svp rehash l3/validate-order

# 3. 检测影响范围
svp compile-plan
# 输出：recompile validate-order（因为 L2 的 sourceHash 与 L3 的 contentHash 不匹配了）

# 4. 重编译
svp prompt recompile validate-order
# AI 更新 src/validate-order.ts
svp link validate-order --files src/validate-order.ts
svp rehash l2
svp check
```

### 场景 B：手改 L1 代码（自下而上）

开发者直接修改了 `src/validate-order.ts`（比如优化了性能）：

```bash
svp check
# 报告：CONTENT_DRIFT — L2 的 signatureHash 与 L1 实际导出签名不匹配
```

这时你有三个选择：

1. **接受变更** — 用 `svp link` 更新 L2 的哈希
2. **回退代码** — 用 `svp prompt recompile` 让 AI 重新生成
3. **更新契约** — 如果代码变更反映了新需求，同步修改 L3

```bash
# 让 AI 帮你分析漂移
svp prompt review validate-order
# AI 输出：哪些签名变了、是否兼容 L3 契约、建议怎么处理
```

### 场景 C：修改 L4 流程

如果你在流程中插入一个新步骤，`compile-plan` 会检测到新的 `blockRef` 没有对应的 L3 block，输出 `update-ref` 任务：

```bash
svp compile-plan
# 输出：update-ref order-flow（因为新步骤引用了不存在的 L3 block）

svp prompt update-ref order-flow
# AI 生成缺失的 L3 block
svp rehash l3
svp check
```

---

## 8. 与 AI 编码工具集成

SVP 支持 6 种 AI 编码工具。初始化时用 `--host` 指定你的工具，SVP 会自动生成对应的 skill 文件和上下文配置：

```bash
svp init --name my-app --host <host>
```

### 支持的工具

| Host | Skill 目录 | 上下文文件 | Skill 文件名 |
|------|-----------|-----------|-------------|
| `claude-code` | `.claude/commands/` | `CLAUDE.md` | `svp.md` |
| `cursor` | `.cursor/commands/` | `.cursor/rules/svp.mdc` | `svp.md` |
| `windsurf` | `.windsurf/commands/` | `.windsurf/rules/svp.md` | `svp.md` |
| `kimi-code` | `.agents/skills/` | `AGENTS.md` | `svp/SKILL.md` |
| `codex` | `.codex/skills/` | `AGENTS.md` | `svp/SKILL.md` |
| `github-copilot` | `.github/prompts/` | `.github/copilot-instructions.md` | `svp.prompt.md` |

如果不指定 `--host`，SVP 会自动检测项目中的工具标记目录（如 `.claude/`、`.cursor/`、`.github/copilot-instructions.md` 等）。

### 工作模式

在 AI 编码工具中使用 SVP 的典型对话：

```
你：设计一个用户注册流程
AI：（调用 svp prompt design-l4，生成流程，调用 svp rehash）
    已创建 L4 flow: user-registration，包含 3 个步骤...

你：编译所有 block
AI：（调用 svp compile-plan，对每个任务调用 svp prompt compile，生成代码，调用 svp link）
    已编译 3 个 block，所有文件已链接，svp check 通过 ✓

你：给 validate-email 加上域名黑名单校验
AI：（更新 L3 的 validate 规则，调用 svp rehash，然后 svp prompt recompile）
    已更新 L3 契约并重编译 validate-email ✓
```

---

## 9. 常见问题

### Q: SVP 支持哪些编程语言？

SVP 是语言无关的协议。L3 契约中的 `type` 字段引用 TypeScript interface（因为 AI 对 TypeScript 类型理解最好），但 L1 生成的代码可以是任何语言。用 `svp link --language python` 指定目标语言。

### Q: contentHash 是什么？

每个层的数据模型都包含 `contentHash`——内容的哈希值。编辑数据后用 `svp rehash` 重算。它是变更追踪的基础：上层哈希变了 → 下层记录的不匹配 → 触发重编译。

### Q: 为什么 validate 和 constraints 用自然语言？

因为 AI 直接理解自然语言。`"array, min 1, max 50"` 比结构化规则对象更简洁，AI 理解得一样准确。而且像 `"not just first"` 这样的微妙语义，结构化表示会丢失。

### Q: svp check 报错了怎么办？

`svp check` 会告诉你具体是哪一层的什么问题。常见问题：

| 错误类型 | 含义 | 修复 |
|----------|------|------|
| HASH_MISMATCH | contentHash 和实际内容不一致 | `svp rehash <target>` |
| MISSING_BLOCK_REF | L4 step 引用的 L3 block 不存在 | 创建缺失的 L3 或修复引用 |
| CONTENT_DRIFT | L1 代码与 L3 契约不同步 | `svp prompt review` 分析后决定 |
| ORPHAN_STEP | L4 中有不可达的步骤 | 检查步骤链接 |

### Q: 我可以跳过某些层吗？

可以。如果你只想用 L3 → L1 的编译能力，不需要定义 L5 和 L4。直接创建 L3 block，然后 `svp prompt compile`。不过完整使用五层能让你在更高层级观测和管理系统。

### Q: compile-blueprint 是做什么的？

如果你用 svp-blueprint 可视化编辑器（节点图方式编辑 L3/L4），编辑器会把数据保存为 `nodes/*.yaml` 和 `graphs/*.yaml`。`svp compile-blueprint` 把这些 YAML 编译成 `.svp/` 下的标准 JSON 格式。

### Q: svp blueprint 是做什么的？

`svp blueprint` 读取 `.svp/` 下的 L3/L4 数据，生成一个自包含的 HTML 文件并在浏览器中打开。这个查看器用节点图渲染流程的步骤编排和数据流，支持平移、缩放、点击查看 L3 契约详情。暗色主题 + 网格背景，pin 按类型自动着色，节点可展开查看完整的 validate 和 constraints。无需安装任何依赖，单个 HTML 文件离线可用。

---

## 下一步

- 查看 `examples/hello-world/` 和 `examples/order-service/` 了解实际项目结构
- 阅读 `docs/overview.md` 深入理解设计理念
- 阅读 `docs/architecture.md` 了解技术架构
- 阅读 `docs/check-reference.md` 了解所有校验规则的详细说明
