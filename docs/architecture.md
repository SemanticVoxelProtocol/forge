# SVP 架构

## 五层数据模型

SVP 的核心是五层数据模型。每层是一个独立的观测窗口，出问题时逐层定位。

```
L5  Blueprint    意图 + 领域拓扑
L4  Logic Chain  步骤编排 + 数据流
L3  Logic Block  契约盒（pins + validate + constraints + description）
L2  Code Block   L3 ↔ L1 的映射 + 对账
L1  Code         源代码文件
```

### 层间关系

```
L5 ─聚合─→ L4 ─聚合─→ L3 ←1:1配对→ L2 ─聚合─→ L1
```

- L5 → L4：一个蓝图的 domain 包含多个 flow
- L4 → L3：一个 flow 的 steps 引用多个 block
- L3 ↔ L2：一个 logic block 配对一个 code block
- L2 → L1：一个 code block 聚合多个源文件

### 数据载体

TypeScript 对象。核心数据模型用 TS 类型定义，运行时是 TS 对象，持久化用 JSON。人编辑时可以用任意格式（YAML、Web GUI、CLI），底下读写的都是同一份数据。

不用 JSON Schema、Protocol Buffers、自定义 DSL——AI 是编译器，不需要这些给传统 parser 设计的工具。

### 数据模型定义

定义在 `packages/core/`：

```typescript
// L5: 项目意图和边界
interface L5Blueprint {
  id: string
  name: string
  version: string
  intent: string                    // 自然语言
  constraints: string[]             // 自然语言
  domains: Domain[]                 // 结构化：名称 + 依赖
  integrations: Integration[]       // 结构化：名称 + 类型
  contentHash: string
}

// L4: 流程编排
interface L4Flow {
  id: string
  name: string
  trigger?: Trigger
  steps: Step[]                     // 结构化：引用 L3 block
  dataFlows: DataFlow[]             // 结构化：步骤间数据传递
  source: Source
  contentHash: string
}

// L3: 最小语义单元（契约盒）
interface L3Block {
  id: string
  name: string
  input: Pin[]                      // 结构化：类型化输入
  output: Pin[]                     // 结构化：类型化输出
  validate: Record<string, string>  // 自然语言规则
  constraints: string[]             // 自然语言断言
  description: string               // 自然语言逻辑
  source: Source
  contentHash: string
}

// L2: L3 和 L1 之间的桥接
interface L2CodeBlock {
  id: string
  blockRef: string                  // 配对的 L3 block ID
  language: string
  files: string[]                   // L1 文件路径
  sourceHash: string                // 对账：L3 改了就不匹配
  contentHash: string               // 对账：L1 被手改了就不匹配
}

// L1: 文件系统上的源代码，无额外数据模型
```

完整类型定义见 `packages/core/*.ts`。

### 结构化的边界

分界原则：**层间连接关系结构化，block 内部是黑盒。**

结构化（`forge check` 校验）：
- pins 的类型、wire 的引用、层间 block/flow 引用

自然语言（展示给人看就行）：
- validate 规则、constraints 断言、description 逻辑

### 存储原则：存得少，算得多

以下属性不存储，用到时计算：
- L3 signature → 从 input/output 生成
- L4 聚合了哪些 L3 blocks → 从 steps 的 blockRef 收集
- L5 domain 包含哪些 L4 flows → 从 L4 的 source.ref 反算
- DataFlow 的 dataType → 从引用的 pin 类型算出来
- Step 的 name → 从引用的 L3 block 名称算出来

单一数据源 + 计算，永远不会有不一致的风险。

---

## 变更传播

每层通过 contentHash 追踪变化。变更检测是双向的，但**修复是单向的**：

**自上而下（重编译）**：上层的 contentHash 变了 → 下层的 sourceHash 不匹配 → 触发重编译。AI 执行重编译时严格单向向下（详见 [交互架构](interaction.md)）。

**自下而上（对账检测）**：下层被手改 → 下层的 contentHash 和上层记录的不匹配 → 标记 drift 警告。对账检测只是**发现机制**，不自动修复。用户看到 drift 后决定如何处理。

```
自上而下（AI 自动执行）：
L5 改了 intent
  → L4 的 source.hash 不匹配 → L4 需要重编译
    → L3 的 source.hash 不匹配 → L3 需要重编译
      → L2 的 sourceHash 不匹配 → L2/L1 需要重编译

自下而上（仅检测，用户决策）：
L1 被手改
  → L2 的 contentHash 和 L1 实际哈希不匹配 → forge check 报 CONTENT_DRIFT
    → 用户决定：接受改动 / 回退 / 更新上层契约
```

---

## 工具链

SVP 是语言无关的协议。工具链是独立的实现，第一版用 TypeScript。SVP 不自己调 AI API——它提供工具链和 skills，增强用户已有的 AI 编码工具（Claude Code、Cursor 等）。

### svp-blueprint

L4/L3 的可视化编辑器。用节点图（nodes + wires）来编辑 L4 flow 和 L3 block。

svp-blueprint 不是一个"层"——它是数据模型的一种人看面（编辑视图）。未来可以有其他编辑器（CLI、Web IDE、VS Code 插件），底下操作的是同一份数据。

### forge check

校验层间连接关系：
- pin 类型匹配
- wire 引用有效
- block/flow 引用存在
- sourceHash 一致性（是否需要重编译）

不校验黑盒内部（validate 规则语义、constraints 断言逻辑、description 内容）。

### SVP Skills

SVP 不自己调 AI API，而是生成结构化的 context（skills）喂给用户已有的 AI 编码工具（Claude Code、Cursor 等）。

工作方式：
- SVP 把五层数据模型转化为 AI 工具能理解的 prompt context
- 用户用 Claude Code 等工具 + SVP skills 来完成编译（L3 → L2/L1）
- SVP 的能力随 base model 进化自动提升——模型越强，理解契约越准，生成代码越好

SVP 不锁定任何 AI 提供商。今天用 Claude Code，明天用别的，SVP 数据模型不变。

这个定位类似 [OpenSpec](https://github.com/Fission-AI/OpenSpec)——不造 AI，给 AI 喂更好的上下文。SVP 的差异在于：五层结构化的契约框架 + `forge check` 的形式化校验。

Skills 的具体实现形式是 SVP CLI 的虚拟文件树（`forge view`）和编译计划（`forge compile-plan`），详见 [交互架构](interaction.md)。

### SVP 交互架构

AI 和 SVP 的协作采用**逐层渗透模型**：用户在某层操作，AI 从下一层进入，严格单向向下编译，每层用独立 subagent 隔离上下文。

详见 [交互架构](interaction.md)。

---

## 项目目录

```
my-project/
├── svp.config.ts                   # 项目配置
│
├── types/                          # TypeScript interface（类型定义）
│   └── *.ts
│
├── .svp/                           # SVP 数据（五层数据模型实例）
│   ├── l5.json                     # L5 Blueprint
│   ├── l4/                         # L4 Flows
│   │   └── *.json
│   ├── l3/                         # L3 Blocks
│   │   └── *.json
│   └── l2/                         # L2 CodeBlocks
│       └── *.json
│
├── src/                            # L1 源代码（编译产物）
│   └── *.ts
│
└── nodes/                          # svp-blueprint 编辑格式（可选）
    └── *.yaml                      # 人看面，读写 .svp/ 下的数据
```
